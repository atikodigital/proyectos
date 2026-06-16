const FIELDS = [
  'company_id', 'employee_id', 'wa_message_id', 'foto_path', 'canal',
  'tipo', 'tipo_documento', 'rut_emisor', 'proveedor', 'folio', 'direccion_emisor',
  'fecha', 'neto', 'iva', 'total', 'moneda', 'categoria',
  'cuenta_sii_codigo', 'cuenta_sii_nombre', 'glosa', 'confianza', 'raw_ocr',
  'nro_operacion', 'image_hash', 'estado_pago', 'dedup_override',
  'wa_sender_name', 'wa_sender_phone',
];

async function createExpense(db, data) {
  const cols = FIELDS.filter((f) => data[f] !== undefined);
  const vals = cols.map((f) => (f === 'raw_ocr' && data[f] ? JSON.stringify(data[f]) : data[f]));
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `INSERT INTO expenses(${cols.join(', ')}) VALUES(${ph}) RETURNING *`;
  const r = await db.query(sql, vals);
  return r.rows[0];
}

async function getExpense(db, id) {
  const r = await db.query('SELECT * FROM expenses WHERE id=$1', [id]);
  return r.rows[0] || null;
}

async function confirmExpense(db, id) {
  const r = await db.query(
    "UPDATE expenses SET estado='confirmado', confirmed_at=now() WHERE id=$1 RETURNING *",
    [id]
  );
  return r.rows[0] || null;
}

const EDITABLE = ['tipo', 'tipo_documento', 'rut_emisor', 'proveedor', 'folio', 'nro_operacion',
  'direccion_emisor', 'fecha', 'neto', 'iva', 'total', 'categoria', 'cuenta_sii_codigo', 'cuenta_sii_nombre', 'glosa'];

async function updateExpense(db, id, patch) {
  const cols = EDITABLE.filter((f) => patch[f] !== undefined);
  if (!cols.length) return getExpense(db, id);
  const set = cols.map((f, i) => `${f}=$${i + 2}`).join(', ');
  const vals = cols.map((f) => patch[f]);
  const r = await db.query(`UPDATE expenses SET ${set} WHERE id=$1 RETURNING *`, [id, ...vals]);
  return r.rows[0] || null;
}

async function getLatestPending(db, companyId, employeeId) {
  const r = await db.query(
    `SELECT * FROM expenses
     WHERE company_id=$1 AND employee_id=$2 AND estado='pendiente_confirmacion'
     ORDER BY created_at DESC LIMIT 1`,
    [companyId, employeeId]
  );
  return r.rows[0] || null;
}

async function rejectExpense(db, id) {
  const r = await db.query(
    "UPDATE expenses SET estado='rechazado' WHERE id=$1 RETURNING *",
    [id]
  );
  return r.rows[0] || null;
}

async function markExpensePaid(db, companyId, id) {
  const r = await db.query(
    "UPDATE expenses SET estado_pago='pagada' WHERE id=$1 AND company_id=$2 RETURNING *",
    [id, companyId]
  );
  return r.rows[0] || null;
}

async function markExpenseConciliada(db, companyId, id) {
  const r = await db.query(
    "UPDATE expenses SET estado_pago='conciliada' WHERE id=$1 AND company_id=$2 RETURNING *",
    [id, companyId]
  );
  return r.rows[0] || null;
}

async function annulExpense(db, companyId, id) {
  const r = await db.query(
    "UPDATE expenses SET estado='anulado' WHERE id=$1 AND company_id=$2 RETURNING *",
    [id, companyId]
  );
  return r.rows[0] || null;
}

module.exports = { createExpense, getExpense, confirmExpense, updateExpense, getLatestPending, rejectExpense, markExpensePaid, markExpenseConciliada, annulExpense };
