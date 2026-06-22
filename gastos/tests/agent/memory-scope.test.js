const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  return db;
}

test('kaly_memory tiene columnas owner_kind/owner_id con defaults', async () => {
  const db = await freshDb();
  const C = require('crypto').randomUUID();
  await db.query("INSERT INTO kaly_memory(company_id, tipo, contenido, origen) VALUES($1,'hecho','x','kaly')", [C]);
  const r = await db.query('SELECT owner_kind, owner_id FROM kaly_memory WHERE company_id=$1', [C]);
  expect(r.rows[0].owner_kind).toBe('company');
  expect(r.rows[0].owner_id == null).toBe(true);
});
