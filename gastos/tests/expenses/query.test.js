const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { listExpenses } = require('../../src/expenses/query');

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
  const c2 = await client.query("INSERT INTO companies(nombre) VALUES('Y') RETURNING id");
  const cid = c.rows[0].id;
  const ins = (fecha, categoria, estado, proveedor, total, company = cid) => client.query(
    `INSERT INTO expenses(company_id, fecha, categoria, estado, proveedor, total) VALUES($1,$2,$3,$4,$5,$6)`,
    [company, fecha, categoria, estado, proveedor, total]);
  await ins('2026-06-05', 'Combustible y transporte', 'confirmado', 'Copec', 25000);
  await ins('2026-06-10', 'Otros gastos', 'pendiente_confirmacion', 'Lider', 10000);
  await ins('2026-05-01', 'Otros gastos', 'confirmado', 'Lider', 5000);
  await ins('2026-06-09', 'Otros gastos', 'confirmado', 'COPEC SA', 7000, c2.rows[0].id);
  return { db: client, cid };
}

test('lista acotada por company_id y ordenada por fecha desc', async () => {
  const { db, cid } = await seed();
  const all = await listExpenses(db, cid, {});
  expect(all.map((r) => r.proveedor)).toEqual(['Lider', 'Copec', 'Lider']);
});

test('filtra por estado', async () => {
  const { db, cid } = await seed();
  const conf = await listExpenses(db, cid, { estado: 'confirmado' });
  expect(conf).toHaveLength(2);
});

test('filtra por rango de fecha', async () => {
  const { db, cid } = await seed();
  const jun = await listExpenses(db, cid, { from: '2026-06-01', to: '2026-06-30' });
  expect(jun).toHaveLength(2);
});

test('filtra por proveedor substring case-insensitive', async () => {
  const { db, cid } = await seed();
  const cop = await listExpenses(db, cid, { proveedor: 'copec' });
  expect(cop).toHaveLength(1);
  expect(cop[0].proveedor).toBe('Copec');
});
