const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const repo = require('../../src/billing/repo');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}
const cid = () => require('crypto').randomUUID();

test('crea suscripción free y la lee', async () => {
  const db = await freshDb(); const c = cid();
  const s = await repo.createFreeSubscription(db, c);
  expect(s.plan).toBe('free');
  expect(Number(s.creditos_limite)).toBe(30);
  const got = await repo.getSubscription(db, c);
  expect(got.company_id).toBe(c);
});

test('tryConsume incrementa hasta el límite y luego rechaza', async () => {
  const db = await freshDb(); const c = cid();
  await repo.createFreeSubscription(db, c);
  const ok = await repo.tryConsume(db, c, 30);
  expect(ok).toBe(true);
  const sob = await repo.tryConsume(db, c, 1);
  expect(sob).toBe(false);
  const s = await repo.getSubscription(db, c);
  expect(Number(s.creditos_usados)).toBe(30);
});

test('logConsumo guarda auditoría', async () => {
  const db = await freshDb(); const c = cid();
  await repo.logConsumo(db, c, { tipo: 'imagen', cantidad: 1, creditos: 1 });
  const r = await db.query('SELECT tipo, creditos FROM ia_consumo WHERE company_id=$1', [c]);
  expect(r.rows[0].tipo).toBe('imagen');
});

test('resetCiclo pone usados en 0', async () => {
  const db = await freshDb(); const c = cid();
  await repo.createFreeSubscription(db, c);
  await repo.tryConsume(db, c, 10);
  await repo.resetCiclo(db, c);
  const s = await repo.getSubscription(db, c);
  expect(Number(s.creditos_usados)).toBe(0);
});
