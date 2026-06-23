const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const billingRepo = require('../../src/billing/repo');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  // Crear una empresa para usar en los tests
  const r = await db.query("INSERT INTO companies(nombre) VALUES('Test Co') RETURNING id");
  return { db, cid: r.rows[0].id };
}

test('setPlanLimite con plan pyme → limite 250', async () => {
  const { db, cid } = await freshDb();
  const sub = await billingRepo.setPlanLimite(db, cid, { plan: 'pyme' });
  expect(sub.plan).toBe('pyme');
  expect(Number(sub.creditos_limite)).toBe(250);
});

test('setPlanLimite con plan ilimitado → limite 100000000', async () => {
  const { db, cid } = await freshDb();
  const sub = await billingRepo.setPlanLimite(db, cid, { plan: 'ilimitado' });
  expect(sub.plan).toBe('ilimitado');
  expect(Number(sub.creditos_limite)).toBe(100000000);
});

test('setPlanLimite con creditosLimite numérico → limite custom y plan custom', async () => {
  const { db, cid } = await freshDb();
  const sub = await billingRepo.setPlanLimite(db, cid, { creditosLimite: 5000 });
  expect(sub.plan).toBe('custom');
  expect(Number(sub.creditos_limite)).toBe(5000);
});

test('setPlanLimite con creditosLimite y plan explícito → usa el plan dado', async () => {
  const { db, cid } = await freshDb();
  const sub = await billingRepo.setPlanLimite(db, cid, { plan: 'empresa', creditosLimite: 9999 });
  expect(sub.plan).toBe('empresa');
  expect(Number(sub.creditos_limite)).toBe(9999);
});
