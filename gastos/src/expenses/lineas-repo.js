// gastos/src/expenses/lineas-repo.js
// Detalle línea-a-línea de un gasto. Una fila por ítem de la factura.
const _ready = new WeakMap();
async function ensureLineasTable(db) {
  if (!_ready.has(db)) {
    const p = db.query(`
      CREATE TABLE IF NOT EXISTS expense_lineas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        expense_id uuid NOT NULL,
        orden int NOT NULL DEFAULT 0,
        descripcion text,
        auxiliar_id uuid,
        cantidad numeric,
        unidad text,
        neto bigint NOT NULL DEFAULT 0,
        iva bigint NOT NULL DEFAULT 0,
        total bigint NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_expense_lineas_exp ON expense_lineas(expense_id);
    `).catch((e) => { _ready.delete(db); throw e; });
    _ready.set(db, p);
  }
  return _ready.get(db);
}

async function createLineas(db, expenseId, lineas) {
  await ensureLineasTable(db);
  const arr = Array.isArray(lineas) ? lineas : [];
  for (let i = 0; i < arr.length; i++) {
    const l = arr[i] || {};
    await db.query(
      `INSERT INTO expense_lineas (expense_id, orden, descripcion, auxiliar_id, cantidad, unidad, neto, iva, total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [expenseId, i, l.descripcion || null, l.auxiliar_id || null,
       (l.cantidad != null ? Number(l.cantidad) : null), l.unidad || null,
       Math.round(Number(l.neto) || 0), Math.round(Number(l.iva) || 0), Math.round(Number(l.total) || 0)]
    );
  }
  return arr.length;
}

async function getLineas(db, expenseId) {
  await ensureLineasTable(db);
  const r = await db.query('SELECT * FROM expense_lineas WHERE expense_id=$1 ORDER BY orden ASC', [expenseId]);
  return r.rows;
}

async function getLineaConCompany(db, lineaId) {
  await ensureLineasTable(db);
  const r = await db.query(
    `SELECT el.*, e.company_id FROM expense_lineas el JOIN expenses e ON e.id = el.expense_id WHERE el.id=$1`,
    [lineaId]
  );
  return r.rows[0] || null;
}
async function setLineaAuxiliar(db, lineaId, auxiliarId, patch = {}) {
  await ensureLineasTable(db);
  const sets = ['auxiliar_id=$2']; const vals = [lineaId, auxiliarId || null];
  if (patch.cantidad != null) { vals.push(Number(patch.cantidad)); sets.push(`cantidad=$${vals.length}`); }
  if (patch.unidad != null) { vals.push(String(patch.unidad)); sets.push(`unidad=$${vals.length}`); }
  const r = await db.query(`UPDATE expense_lineas SET ${sets.join(', ')} WHERE id=$1 RETURNING *`, vals);
  return r.rows[0] || null;
}

module.exports = { ensureLineasTable, createLineas, getLineas, getLineaConCompany, setLineaAuxiliar };
