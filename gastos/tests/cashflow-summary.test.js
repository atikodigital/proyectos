const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
const { createExpense, confirmExpense } = require('../src/expenses/repo');
const { cashflowSummary } = require('../src/expenses/summary');
const { formatCashflowSummary } = require('../src/whatsapp/format');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}

test('cashflowSummary separa ingresos/gastos confirmados del mes y calcula saldo', async () => {
  const db = await makeDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const cid = c.rows[0].id;
  const g = await createExpense(db, { company_id: cid, tipo: 'gasto', categoria: 'Arriendos', fecha: '2026-06-05', total: 30000 });
  const i = await createExpense(db, { company_id: cid, tipo: 'ingreso', categoria: 'Ingreso', fecha: '2026-06-06', total: 80000 });
  await createExpense(db, { company_id: cid, tipo: 'gasto', categoria: 'Otros gastos', fecha: '2026-06-07', total: 5000 });
  await confirmExpense(db, g.id);
  await confirmExpense(db, i.id);

  const s = await cashflowSummary(db, cid, { year: 2026, month: 6 });
  expect(s.ingresos).toBe(80000);
  expect(s.gastos).toBe(30000);
  expect(s.saldo).toBe(50000);
  expect(s.countGastos).toBe(1);
  expect(s.countIngresos).toBe(1);
  expect(s.porCategoria).toEqual([{ categoria: 'Arriendos', total: 30000 }]);
});

test('formatCashflowSummary arma texto con ingresos, gastos y saldo', () => {
  const txt = formatCashflowSummary({ periodo: 'junio 2026', ingresos: 80000, gastos: 30000, saldo: 50000, countGastos: 1, countIngresos: 1, porCategoria: [{ categoria: 'Arriendos', total: 30000 }] });
  expect(txt).toContain('junio 2026');
  expect(txt).toContain('Ingresos');
  expect(txt).toContain('$80.000');
  expect(txt.toLowerCase()).toContain('saldo');
  expect(txt).toContain('$50.000');
  expect(txt).toContain('Arriendos');
});
