const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const repo = require('../../src/billing/repo');
const { consumirCredito, SinCreditosError, saldo } = require('../../src/billing/creditos');

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

test('consumirCredito descuenta y audita', async () => {
  const db = await freshDb(); const c = cid();
  await repo.createFreeSubscription(db, c);
  await consumirCredito(db, c, { tipo: 'imagen', cantidad: 1 });
  const s = await saldo(db, c);
  expect(s.usado).toBe(1);
  expect(s.restante).toBe(29);
  const audit = await db.query('SELECT count(*)::int n FROM ia_consumo WHERE company_id=$1', [c]);
  expect(audit.rows[0].n).toBe(1);
});

test('consumirCredito lanza SinCreditosError al exceder y NO audita ni descuenta', async () => {
  const db = await freshDb(); const c = cid();
  await repo.createFreeSubscription(db, c);
  for (let i = 0; i < 30; i++) await consumirCredito(db, c, { tipo: 'imagen', cantidad: 1 });
  await expect(consumirCredito(db, c, { tipo: 'imagen', cantidad: 1 }))
    .rejects.toThrow(SinCreditosError);
  const s = await saldo(db, c);
  expect(s.usado).toBe(30);
  const audit = await db.query('SELECT count(*)::int n FROM ia_consumo WHERE company_id=$1', [c]);
  expect(audit.rows[0].n).toBe(30);
});

test('tipo con peso 0 (texto) no consume pero sí audita', async () => {
  const db = await freshDb(); const c = cid();
  await repo.createFreeSubscription(db, c);
  await consumirCredito(db, c, { tipo: 'texto', cantidad: 1 });
  const s = await saldo(db, c);
  expect(s.usado).toBe(0);
});
