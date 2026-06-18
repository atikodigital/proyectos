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
  const origen = input && input.origen === 'dueño' ? 'dueño' : 'kaly';
  const r = await db.query(
    "INSERT INTO kaly_memory(company_id, tipo, contenido, origen) VALUES($1,$2,$3,$4) RETURNING id, tipo, contenido, origen, created_at",
    [companyId, n.tipo, n.contenido, origen]
  );
  return r.rows[0];
}
async function listMemorias(db, companyId, { limite = 50 } = {}) {
  const r = await db.query(
    "SELECT id, tipo, contenido, origen, created_at FROM kaly_memory WHERE company_id=$1 AND activo=true ORDER BY created_at DESC LIMIT $2",
    [companyId, limite]
  );
  return r.rows;
}
async function borrarMemoria(db, companyId, id) {
  const r = await db.query("UPDATE kaly_memory SET activo=false, updated_at=now() WHERE id=$1 AND company_id=$2 RETURNING id", [id, companyId]);
  return r.rows[0] || null;
}

module.exports = { normalizeMemoria, formatMemoriaBlock, TIPOS, crearMemoria, listMemorias, borrarMemoria };
