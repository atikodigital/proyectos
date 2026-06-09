const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { monthlySummary } = require('../../src/expenses/summary');

async function seed() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const db = mem.adapters.createPg();
  const client = new db.Pool();
  await migrate(client).catch(() => {});
  const c = await client.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const cid = c.rows[0].id;
  const ins = (fecha, total, categoria, estado) => client.query(
    `INSERT INTO expenses(company_id, fecha, total, categoria, estado)
     VALUES($1,$2,$3,$4,$5)`, [cid, fecha, total, categoria, estado]);
  await ins('2026-06-05', 25000, 'Combustible y transporte', 'confirmado');
  await ins('2026-06-20', 10000, 'Otros gastos', 'confirmado');
  await ins('2026-06-21', 99999, 'Otros gastos', 'pendiente_confirmacion');
  await ins('2026-05-10', 50000, 'Otros gastos', 'confirmado');
  return { db: client, cid };
}

test('agrega solo confirmados del mes pedido', async () => {
  const { db, cid } = await seed();
  const s = await monthlySummary(db, cid, { year: 2026, month: 6 });
  expect(s.total).toBe(35000);
  expect(s.count).toBe(2);
  expect(s.porCategoria).toEqual([
    { categoria: 'Combustible y transporte', total: 25000 },
    { categoria: 'Otros gastos', total: 10000 },
  ]);
});
