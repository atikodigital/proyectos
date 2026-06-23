const { newDb } = require('pg-mem');
const { migrate, grandfatherExisting } = require('../../src/db/migrate');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}

test('grandfather: empresa preexistente sin suscripción queda ilimitada', async () => {
  const db = await freshDb();
  const cid = require('crypto').randomUUID();
  // Empresa creada SIN pasar por createCompany → no tiene suscripción.
  await db.query("INSERT INTO companies(id, nombre) VALUES($1, 'Vieja')", [cid]);
  const n = await grandfatherExisting(db);
  expect(n).toBe(1);
  const s = await db.query('SELECT plan, creditos_limite FROM subscriptions WHERE company_id=$1', [cid]);
  expect(s.rows[0].plan).toBe('ilimitado');
  expect(Number(s.rows[0].creditos_limite)).toBe(100000000);
});

test('grandfather es idempotente: no duplica ni re-toca a quien ya tiene suscripción', async () => {
  const db = await freshDb();
  const cid = require('crypto').randomUUID();
  await db.query("INSERT INTO companies(id, nombre) VALUES($1, 'Vieja')", [cid]);
  await grandfatherExisting(db);
  // Le bajo el límite a mano (como haría el admin) y vuelvo a correr: NO debe re-tocarla.
  await db.query('UPDATE subscriptions SET plan=$2, creditos_limite=$3 WHERE company_id=$1', [cid, 'free', 30]);
  const n2 = await grandfatherExisting(db);
  expect(n2).toBe(0);
  const r = await db.query('SELECT count(*)::int n, max(creditos_limite) lim FROM subscriptions WHERE company_id=$1', [cid]);
  expect(r.rows[0].n).toBe(1);
  expect(Number(r.rows[0].lim)).toBe(30);
});
