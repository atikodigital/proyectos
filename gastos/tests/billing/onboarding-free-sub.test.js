const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createCompany } = require('../../src/companies/repo');
const { getSubscription } = require('../../src/billing/repo');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}

test('crear empresa la deja en prueba Pyme de 14 días (antes era free)', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'Pyme Test' });
  const sub = await getSubscription(db, co.id);
  expect(sub).toBeTruthy();
  expect(sub.plan).toBe('pyme');
  expect(sub.estado).toBe('trial');
  expect(Number(sub.creditos_limite)).toBe(210);
});
