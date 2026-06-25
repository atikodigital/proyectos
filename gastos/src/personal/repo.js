async function calcularResumenPersonal(db, companyId) {
  const { rows: [company] } = await db.query(
    'SELECT sueldo_mensual, dia_pago FROM companies WHERE id=$1',
    [companyId]
  );
  if (!company) return null;

  const now = new Date();
  const mes = now.getMonth() + 1;
  const anio = now.getFullYear();

  const { rows: [gasto] } = await db.query(
    `SELECT COALESCE(SUM(total::numeric), 0) AS gastado
     FROM expenses
     WHERE company_id=$1 AND tipo='gasto' AND estado!='anulado'
       AND EXTRACT(MONTH FROM fecha::date)=$2 AND EXTRACT(YEAR FROM fecha::date)=$3`,
    [companyId, mes, anio]
  );

  const { rows: rawCats } = await db.query(
    `SELECT categoria, total::numeric AS total
     FROM expenses
     WHERE company_id=$1 AND tipo='gasto' AND estado!='anulado'
       AND EXTRACT(MONTH FROM fecha::date)=$2 AND EXTRACT(YEAR FROM fecha::date)=$3`,
    [companyId, mes, anio]
  );
  // Group by categoria in JS to avoid pg-mem COALESCE+GROUP BY bug
  const catMap = {};
  for (const row of rawCats) {
    const nombre = row.categoria || 'Otros';
    catMap[nombre] = (catMap[nombre] || 0) + parseInt(row.total) || 0;
  }
  const categorias = Object.entries(catMap)
    .map(([nombre, total]) => ({ nombre, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const lastDay = new Date(anio, mes, 0).getDate();
  const diasRestantes = Math.max(0, lastDay - now.getDate());
  const sueldoMensual = parseInt(company.sueldo_mensual) || 0;
  const gastadoMes = parseInt(gasto.gastado) || 0;
  const disponible = sueldoMensual - gastadoMes;
  const porcentajeGastado = sueldoMensual > 0 ? Math.round((gastadoMes / sueldoMensual) * 100) : 0;

  return {
    sueldo_mensual: sueldoMensual,
    dia_pago: parseInt(company.dia_pago) || 1,
    gastado_mes: gastadoMes,
    disponible,
    dias_restantes_mes: diasRestantes,
    porcentaje_gastado: porcentajeGastado,
    categorias,
  };
}

module.exports = { calcularResumenPersonal };
