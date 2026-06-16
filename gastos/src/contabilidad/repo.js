// gastos/src/contabilidad/repo.js
// Persistencia de asientos contables (cabecera + líneas). Multi-tenant por company_id.
const _ready = new WeakMap();
async function ensureAsientosTables(db) {
  if (!_ready.has(db)) {
    const p = db.query(`
      CREATE TABLE IF NOT EXISTS asientos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL,
        fecha date,
        glosa text,
        origen text NOT NULL,
        origen_ref text,
        tipo_asiento text NOT NULL,
        estado text NOT NULL DEFAULT 'confirmado',
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS asiento_lineas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        asiento_id uuid NOT NULL,
        cuenta_id uuid,
        debe bigint NOT NULL DEFAULT 0,
        haber bigint NOT NULL DEFAULT 0,
        glosa text
      );
      CREATE INDEX IF NOT EXISTS idx_asientos_company ON asientos(company_id);
      CREATE INDEX IF NOT EXISTS idx_asientos_origen ON asientos(company_id, origen, origen_ref, tipo_asiento);
      CREATE INDEX IF NOT EXISTS idx_aslineas_asiento ON asiento_lineas(asiento_id);
    `).catch((e) => { _ready.delete(db); throw e; });
    _ready.set(db, p);
  }
  return _ready.get(db);
}

async function guardarAsiento(db, companyId, asiento) {
  await ensureAsientosTables(db);
  const cab = await db.query(
    `INSERT INTO asientos (company_id, fecha, glosa, origen, origen_ref, tipo_asiento, estado)
     VALUES ($1,$2,$3,$4,$5,$6,'confirmado') RETURNING *`,
    [companyId, asiento.fecha || null, asiento.glosa || null, asiento.origen, asiento.origen_ref || null, asiento.tipo_asiento]
  );
  const a = cab.rows[0];
  for (const l of (asiento.lineas || [])) {
    await db.query(
      'INSERT INTO asiento_lineas (asiento_id, cuenta_id, debe, haber, glosa) VALUES ($1,$2,$3,$4,$5)',
      [a.id, l.cuenta_id || null, Math.round(Number(l.debe) || 0), Math.round(Number(l.haber) || 0), l.glosa || null]
    );
  }
  return a;
}

async function getLineas(db, asientoId) {
  await ensureAsientosTables(db);
  const r = await db.query('SELECT * FROM asiento_lineas WHERE asiento_id=$1', [asientoId]);
  return r.rows;
}

async function buscarAsientoVivo(db, companyId, origen, origenRef, tipoAsiento) {
  await ensureAsientosTables(db);
  const r = await db.query(
    `SELECT * FROM asientos WHERE company_id=$1 AND origen=$2 AND origen_ref=$3 AND tipo_asiento=$4 AND estado <> 'anulado' LIMIT 1`,
    [companyId, origen, origenRef, tipoAsiento]
  );
  return r.rows[0] || null;
}

async function anularAsiento(db, asientoId) {
  await ensureAsientosTables(db);
  const r = await db.query("UPDATE asientos SET estado='anulado' WHERE id=$1 RETURNING *", [asientoId]);
  return r.rows[0] || null;
}

module.exports = { ensureAsientosTables, guardarAsiento, getLineas, buscarAsientoVivo, anularAsiento };
