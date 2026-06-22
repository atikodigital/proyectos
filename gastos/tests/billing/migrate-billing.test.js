const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}

test('migrate crea las tablas subscriptions e ia_consumo', async () => {
  const db = await freshDb();
  const cid = require('crypto').randomUUID();
  await db.query(
    `INSERT INTO subscriptions(company_id, plan, estado, source, creditos_limite, creditos_usados)
     VALUES($1,'free','activa','manual',30,0)`, [cid]);
  const s = await db.query('SELECT plan, creditos_limite, creditos_usados FROM subscriptions WHERE company_id=$1', [cid]);
  expect(s.rows[0].plan).toBe('free');
  expect(Number(s.rows[0].creditos_limite)).toBe(30);
  await db.query(`INSERT INTO ia_consumo(company_id, tipo, cantidad, creditos) VALUES($1,'imagen',1,1)`, [cid]);
  const c = await db.query('SELECT tipo, creditos FROM ia_consumo WHERE company_id=$1', [cid]);
  expect(c.rows[0].tipo).toBe('imagen');
});
