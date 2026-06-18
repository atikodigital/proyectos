// Convierte 'YYYY-MM' a { from, to } (primer y último día del mes). null si no aplica.
function periodoRange(periodo) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(periodo || ''));
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const lastDay = new Date(year, month, 0).getDate(); // día 0 del mes siguiente = último del mes
  return { from: `${m[1]}-${m[2]}-01`, to: `${m[1]}-${m[2]}-${String(lastDay).padStart(2, '0')}` };
}

// Lista movimientos de UNA empresa con filtros opcionales. Siempre acotado por company_id.
async function listExpenses(db, companyId, filtros = {}) {
  const where = ['e.company_id = $1'];
  const vals = [companyId];
  const add = (sql, val) => { vals.push(val); where.push(sql.replace('?', `$${vals.length}`)); };

  const periodo = periodoRange(filtros.periodo);
  const from = periodo ? periodo.from : filtros.from;
  const to = periodo ? periodo.to : filtros.to;

  if (from) add('e.fecha >= ?', from);
  if (to) add('e.fecha <= ?', to);
  if (filtros.empleadoId) add('e.employee_id = ?', filtros.empleadoId);
  if (filtros.categoria) add('e.categoria = ?', filtros.categoria);
  if (filtros.estado) add('e.estado = ?', filtros.estado);
  if (filtros.estadoPago) add('e.estado_pago = ?', filtros.estadoPago);
  if (filtros.tipo === 'gasto' || filtros.tipo === 'ingreso') add('e.tipo = ?', filtros.tipo);
  if (filtros.tipoDocumento) add('e.tipo_documento = ?', filtros.tipoDocumento);
  if (filtros.proveedor) add('e.proveedor ILIKE ?', `%${filtros.proveedor}%`);
  if (!filtros.estado) where.push("e.estado <> 'anulado'");

  const lim = (Number.isInteger(filtros.limit) && filtros.limit > 0) ? filtros.limit : 1000;
  vals.push(lim);
  const r = await db.query(
    `SELECT e.*, emp.nombre AS empleado_nombre
     FROM expenses e
     LEFT JOIN employees emp ON emp.id = e.employee_id
     WHERE ${where.join(' AND ')}
     ORDER BY e.fecha DESC, e.created_at DESC LIMIT $${vals.length}`,
    vals
  );
  return r.rows;
}

module.exports = { listExpenses, periodoRange };
