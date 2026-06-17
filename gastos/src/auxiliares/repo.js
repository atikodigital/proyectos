// gastos/src/auxiliares/repo.js
// Catálogo de auxiliares (insumos) por empresa. CRUD mínimo (mapeo/fusión = A2).
const { matchExistente } = require('./mapear');
const _ready = new WeakMap();
async function ensureAuxiliaresTable(db) {
  if (!_ready.has(db)) {
    const p = db.query(`
      CREATE TABLE IF NOT EXISTS auxiliares (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL,
        nombre text NOT NULL,
        cuenta_id uuid,
        naturaleza text,
        unidad_principal text,
        sinonimos jsonb NOT NULL DEFAULT '[]',
        estado text NOT NULL DEFAULT 'sugerido',
        activo boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_auxiliares_company ON auxiliares(company_id);
    `).catch((e) => { _ready.delete(db); throw e; });
    _ready.set(db, p);
  }
  return _ready.get(db);
}

const COLS = 'id, company_id, nombre, cuenta_id, naturaleza, unidad_principal, sinonimos, estado, activo, created_at';

async function createAuxiliar(db, companyId, d = {}) {
  await ensureAuxiliaresTable(db);
  const r = await db.query(
    `INSERT INTO auxiliares (company_id, nombre, cuenta_id, naturaleza, unidad_principal, sinonimos, estado)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING ${COLS}`,
    [companyId, String(d.nombre || '').trim(), d.cuenta_id || null, d.naturaleza || 'insumo',
     d.unidad_principal || 'un', JSON.stringify(Array.isArray(d.sinonimos) ? d.sinonimos : []), d.estado || 'sugerido']
  );
  return r.rows[0];
}

async function listAuxiliares(db, companyId) {
  await ensureAuxiliaresTable(db);
  const r = await db.query(`SELECT ${COLS} FROM auxiliares WHERE company_id=$1 AND activo=true ORDER BY nombre ASC`, [companyId]);
  return r.rows;
}

async function getById(db, id) {
  await ensureAuxiliaresTable(db);
  const r = await db.query(`SELECT ${COLS} FROM auxiliares WHERE id=$1`, [id]);
  return r.rows[0] || null;
}

async function findMatch(db, companyId, descripcion) {
  const lista = await listAuxiliares(db, companyId);
  return matchExistente(descripcion, lista);
}

async function addSinonimo(db, id, sinonimo) {
  const a = await getById(db, id);
  if (!a) return null;
  const s = String(sinonimo || '').trim();
  const set = new Set([...(Array.isArray(a.sinonimos) ? a.sinonimos : []), s].filter(Boolean));
  const arr = [...set];
  const r = await db.query(`UPDATE auxiliares SET sinonimos=$2::jsonb WHERE id=$1 RETURNING ${COLS}`, [id, JSON.stringify(arr)]);
  return r.rows[0] || null;
}

async function updateAuxiliar(db, companyId, id, patch = {}) {
  await ensureAuxiliaresTable(db);
  const exists = (await db.query('SELECT id FROM auxiliares WHERE id=$1 AND company_id=$2', [id, companyId])).rows[0];
  if (!exists) return null;
  const campos = ['nombre', 'naturaleza', 'unidad_principal', 'cuenta_id', 'estado'];
  const sets = []; const vals = [id, companyId];
  for (const c of campos) { if (patch[c] !== undefined) { vals.push(patch[c]); sets.push(`${c}=$${vals.length}`); } }
  if (!sets.length) return getById(db, id);
  const r = await db.query(`UPDATE auxiliares SET ${sets.join(', ')} WHERE id=$1 AND company_id=$2 RETURNING ${COLS}`, vals);
  return r.rows[0] || null;
}
async function setActivo(db, companyId, id, activo) {
  await ensureAuxiliaresTable(db);
  const r = await db.query(`UPDATE auxiliares SET activo=$3 WHERE id=$1 AND company_id=$2 RETURNING ${COLS}`, [id, companyId, !!activo]);
  return r.rows[0] || null;
}
async function mergeAuxiliar(db, companyId, fromId, toId) {
  await ensureAuxiliaresTable(db);
  const from = await getById(db, fromId); const to = await getById(db, toId);
  if (!from || !to || from.company_id !== companyId || to.company_id !== companyId) return null;
  // reapunta las líneas del from al to
  await db.query('UPDATE expense_lineas SET auxiliar_id=$1 WHERE auxiliar_id=$2', [toId, fromId]);
  // hereda sinónimos (nombre + sinónimos del from)
  const merged = new Set([...(to.sinonimos || []), from.nombre, ...((from.sinonimos) || [])].filter(Boolean));
  await db.query('UPDATE auxiliares SET sinonimos=$2::jsonb WHERE id=$1', [toId, JSON.stringify([...merged])]);
  await db.query('UPDATE auxiliares SET activo=false WHERE id=$1', [fromId]);
  return getById(db, toId);
}

module.exports = { ensureAuxiliaresTable, createAuxiliar, listAuxiliares, getById, findMatch, addSinonimo, updateAuxiliar, setActivo, mergeAuxiliar };
