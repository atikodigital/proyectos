// Prueba gratis de 14 días del plan Pyme para cuentas nuevas.
// Al vencer, la suscripción se degrada sola a Free (lazy, al leer saldo o consumir).
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const repo = require('../../src/billing/repo');
const { consumirCredito, saldo } = require('../../src/billing/creditos');
const { createCompany } = require('../../src/companies/repo');

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

test('crear empresa la deja en prueba Pyme (210 créditos, 14 días)', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'Pyme Test' });
  const sub = await repo.getSubscription(db, co.id);
  expect(sub.plan).toBe('pyme');
  expect(sub.estado).toBe('trial');
  expect(Number(sub.creditos_limite)).toBe(210);
  expect(sub.ciclo_fin).toBeTruthy();
  // ciclo_fin ~14 días en el futuro
  const dias = (new Date(sub.ciclo_fin).getTime() - Date.now()) / 86400000;
  expect(dias).toBeGreaterThan(13);
  expect(dias).toBeLessThan(15);
});

test('createTrialSubscription es idempotente (no pisa una sub existente)', async () => {
  const db = await freshDb(); const c = cid();
  await repo.createTrialSubscription(db, c);
  await repo.createTrialSubscription(db, c);
  const rows = await db.query('SELECT count(*)::int n FROM subscriptions WHERE company_id=$1', [c]);
  expect(rows.rows[0].n).toBe(1);
});

test('durante el trial se pueden consumir créditos hasta el límite Pyme (210)', async () => {
  const db = await freshDb(); const c = cid();
  await repo.createTrialSubscription(db, c);
  const ok = await repo.tryConsume(db, c, 210);
  expect(ok).toBe(true);
  const sob = await repo.tryConsume(db, c, 1);
  expect(sob).toBe(false);
});

test('saldo expone es_trial y dias_restantes durante la prueba', async () => {
  const db = await freshDb(); const c = cid();
  await repo.createTrialSubscription(db, c);
  const s = await saldo(db, c);
  expect(s.es_trial).toBe(true);
  expect(s.plan).toBe('pyme');
  expect(s.limite).toBe(210);
  expect(s.dias_restantes).toBeGreaterThan(0);
  expect(s.dias_restantes).toBeLessThanOrEqual(14);
});

test('expireTrialIfDue NO degrada si el trial aún no vence', async () => {
  const db = await freshDb(); const c = cid();
  await repo.createTrialSubscription(db, c);
  const degradado = await repo.expireTrialIfDue(db, c);
  expect(degradado).toBe(false);
  const s = await repo.getSubscription(db, c);
  expect(s.estado).toBe('trial');
});

test('expireTrialIfDue degrada a Free cuando el trial ya venció', async () => {
  const db = await freshDb(); const c = cid();
  // Trial vencido: ciclo_fin en el pasado.
  await repo.createTrialSubscription(db, c, -1);
  const degradado = await repo.expireTrialIfDue(db, c);
  expect(degradado).toBe(true);
  const s = await repo.getSubscription(db, c);
  expect(s.plan).toBe('free');
  expect(s.estado).toBe('activa');
  expect(Number(s.creditos_limite)).toBe(30);
  expect(Number(s.creditos_usados)).toBe(0);
  expect(s.ciclo_fin).toBeNull();
});

test('saldo degrada el trial vencido automáticamente (lazy)', async () => {
  const db = await freshDb(); const c = cid();
  await repo.createTrialSubscription(db, c, -1);
  const s = await saldo(db, c);
  expect(s.plan).toBe('free');
  expect(s.es_trial).toBe(false);
  expect(s.limite).toBe(30);
});

test('consumir con trial vencido cobra contra el plan Free (no contra Pyme)', async () => {
  const db = await freshDb(); const c = cid();
  await repo.createTrialSubscription(db, c, -1);
  // Al primer consumo se degrada a free; se pueden gastar 30, no 210.
  for (let i = 0; i < 30; i++) await consumirCredito(db, c, { tipo: 'imagen', cantidad: 1 });
  const s = await saldo(db, c);
  expect(s.plan).toBe('free');
  expect(s.usado).toBe(30);
  await expect(consumirCredito(db, c, { tipo: 'imagen', cantidad: 1 })).rejects.toThrow();
});
