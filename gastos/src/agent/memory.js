// Memoria del cliente para KALY: hechos por empresa (kaly_memory).
const TIPOS = ['negocio', 'dueño', 'preferencia', 'hecho'];

function normalizeMemoria(input) {
  input = input || {};
  const contenido = String(input.contenido || '').trim().slice(0, 500);
  if (!contenido) return null;
  const tipo = TIPOS.includes(input.tipo) ? input.tipo : 'hecho';
  return { tipo, contenido };
}

function formatMemoriaBlock(memorias) {
  const arr = (Array.isArray(memorias) ? memorias : []).filter((m) => m && m.contenido);
  if (!arr.length) return '';
  const porTipo = {};
  for (const m of arr) { (porTipo[m.tipo || 'hecho'] = porTipo[m.tipo || 'hecho'] || []).push(m.contenido); }
  const etiqueta = { negocio: 'Del negocio', 'dueño': 'Del dueño', preferencia: 'Preferencias', hecho: 'Otros' };
  let out = '## Lo que sé de este negocio\n';
  for (const t of TIPOS) {
    if (!porTipo[t]) continue;
    out += `- ${etiqueta[t]}: ${porTipo[t].join('; ')}\n`;
  }
  return out.trim();
}

async function crearMemoria(db, companyId, input) {
  const n = normalizeMemoria(input);
  if (!n) return null;
  const ORIGENES = ['kaly', 'dueño', 'auto'];
  const origen = input && ORIGENES.includes(input.origen) ? input.origen : 'kaly';
  const KINDS = ['company', 'user', 'employee'];
  const owner_kind = input && KINDS.includes(input.owner_kind) ? input.owner_kind : 'company';
  const owner_id = owner_kind === 'company' ? null : (input && input.owner_id) || null;
  // Memoria personal SIEMPRE necesita owner_id; sin él sería una fila huérfana
  // (invisible para listMemorias y no borrable por la limpieza). Se rechaza.
  if (owner_kind !== 'company' && !owner_id) return null;
  const r = await db.query(
    "INSERT INTO kaly_memory(company_id, tipo, contenido, origen, owner_kind, owner_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id, tipo, contenido, origen, owner_kind, owner_id, created_at",
    [companyId, n.tipo, n.contenido, origen, owner_kind, owner_id]
  );
  return r.rows[0];
}

// owner: { kind, id } opcional. Sin owner → solo memoria de empresa.
async function listMemorias(db, companyId, { limite = 50, owner = null } = {}) {
  if (owner && owner.kind && owner.id) {
    const r = await db.query(
      "SELECT id, tipo, contenido, origen, owner_kind, created_at FROM kaly_memory WHERE company_id=$1 AND activo=true AND (owner_kind='company' OR (owner_kind=$2 AND owner_id=$3)) ORDER BY created_at DESC LIMIT $4",
      [companyId, owner.kind, owner.id, limite]
    );
    return r.rows;
  }
  const r = await db.query(
    "SELECT id, tipo, contenido, origen, owner_kind, created_at FROM kaly_memory WHERE company_id=$1 AND activo=true AND owner_kind='company' ORDER BY created_at DESC LIMIT $2",
    [companyId, limite]
  );
  return r.rows;
}
// Borra (soft-delete) por id. Si se pasa owner, solo borra si la fila es de
// empresa, o es personal y pertenece a esa persona.
async function borrarMemoria(db, companyId, id, { owner = null } = {}) {
  if (owner && owner.kind && owner.id) {
    const r = await db.query(
      "UPDATE kaly_memory SET activo=false, updated_at=now() WHERE id=$1 AND company_id=$2 AND (owner_kind='company' OR (owner_kind=$3 AND owner_id=$4)) RETURNING id",
      [id, companyId, owner.kind, owner.id]
    );
    return r.rows[0] || null;
  }
  const r = await db.query("UPDATE kaly_memory SET activo=false, updated_at=now() WHERE id=$1 AND company_id=$2 RETURNING id", [id, companyId]);
  return r.rows[0] || null;
}

// Limpia toda la memoria de un alcance. ownerKind='company' limpia la de empresa
// (owner_id se ignora). Devuelve cuántas filas se desactivaron.
async function borrarMemoriasDe(db, companyId, { ownerKind, ownerId }) {
  if (ownerKind === 'company') {
    const r = await db.query("UPDATE kaly_memory SET activo=false, updated_at=now() WHERE company_id=$1 AND owner_kind='company' AND activo=true RETURNING id", [companyId]);
    return r.rows.length;
  }
  const r = await db.query("UPDATE kaly_memory SET activo=false, updated_at=now() WHERE company_id=$1 AND owner_kind=$2 AND owner_id=$3 AND activo=true RETURNING id", [companyId, ownerKind, ownerId]);
  return r.rows.length;
}

// Registra un HECHO automático (origen 'auto'). Cada llamada crea una entrada.
// Úsalo para datos que se acumulan (ej. cada gasto/ingreso registrado).
async function registrarHechoAuto(db, companyId, { tipo = 'hecho', contenido, owner = null } = {}) {
  return crearMemoria(db, companyId, {
    tipo, contenido, origen: 'auto',
    owner_kind: owner && owner.kind ? owner.kind : 'company',
    owner_id: owner && owner.id ? owner.id : null,
  });
}

// Upsert de un hecho automático por prefijo: desactiva el anterior con ese
// prefijo (mismo alcance) y crea el nuevo. Para datos que evolucionan y no
// deben duplicarse (ej. "Última conversación con KALY: ...").
async function upsertHechoAuto(db, companyId, { tipo = 'hecho', prefijo, contenido, owner = null } = {}) {
  const ownerKind = owner && owner.kind ? owner.kind : 'company';
  const ownerId = owner && owner.id ? owner.id : null;
  try {
    if (ownerKind === 'company') {
      await db.query("UPDATE kaly_memory SET activo=false, updated_at=now() WHERE company_id=$1 AND owner_kind='company' AND origen='auto' AND activo=true AND contenido LIKE $2", [companyId, prefijo + '%']);
    } else {
      await db.query("UPDATE kaly_memory SET activo=false, updated_at=now() WHERE company_id=$1 AND owner_kind=$2 AND owner_id=$3 AND origen='auto' AND activo=true AND contenido LIKE $4", [companyId, ownerKind, ownerId, prefijo + '%']);
    }
  } catch (_) { /* si falla el limpiado, igual insertamos */ }
  return crearMemoria(db, companyId, { tipo, contenido, origen: 'auto', owner_kind: ownerKind, owner_id: ownerId });
}

module.exports = { normalizeMemoria, formatMemoriaBlock, TIPOS, crearMemoria, listMemorias, borrarMemoria, borrarMemoriasDe, registrarHechoAuto, upsertHechoAuto };
