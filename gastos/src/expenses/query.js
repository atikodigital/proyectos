// Lista de gastos de UNA empresa con filtros opcionales. Siempre acotado por company_id.
async function listExpenses(db, companyId, filtros = {}) {
  const where = ['company_id = $1'];
  const vals = [companyId];
  const add = (sql, val) => { vals.push(val); where.push(sql.replace('?', `$${vals.length}`)); };

  if (filtros.from) add('fecha >= ?', filtros.from);
  if (filtros.to) add('fecha <= ?', filtros.to);
  if (filtros.empleadoId) add('employee_id = ?', filtros.empleadoId);
  if (filtros.categoria) add('categoria = ?', filtros.categoria);
  if (filtros.estado) add('estado = ?', filtros.estado);
  if (filtros.tipoDocumento) add('tipo_documento = ?', filtros.tipoDocumento);
  if (filtros.proveedor) add('proveedor ILIKE ?', `%${filtros.proveedor}%`);

  const r = await db.query(
    `SELECT * FROM expenses WHERE ${where.join(' AND ')}
     ORDER BY fecha DESC, created_at DESC LIMIT 1000`,
    vals
  );
  return r.rows;
}

module.exports = { listExpenses };
