// Resumen de gastos CONFIRMADOS de un mes (year, month 1-12) para una empresa.
async function monthlySummary(db, companyId, { year, month }) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const toMonth = month === 12 ? 1 : month + 1;
  const toYear = month === 12 ? year + 1 : year;
  const to = `${toYear}-${String(toMonth).padStart(2, '0')}-01`;

  const r = await db.query(
    `SELECT categoria, SUM(total) AS total, COUNT(*) AS n
     FROM expenses
     WHERE company_id=$1 AND estado='confirmado' AND fecha >= $2 AND fecha < $3
     GROUP BY categoria
     ORDER BY SUM(total) DESC`,
    [companyId, from, to]
  );

  const porCategoria = r.rows.map((row) => ({ categoria: row.categoria, total: Number(row.total) }));
  const total = porCategoria.reduce((a, c) => a + c.total, 0);
  const count = r.rows.reduce((a, row) => a + Number(row.n), 0);
  return { total, count, porCategoria };
}

module.exports = { monthlySummary };
