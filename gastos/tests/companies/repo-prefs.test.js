const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { setAgentPrefs, getAgentPrefs } = require('../../src/companies/repo');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}

test('setAgentPrefs guarda proactividad boolean', async () => {
  const db = await freshDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const e = await db.query("INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'J','juan','h') RETURNING id", [c.rows[0].id]);
  const id = e.rows[0].id;
  await setAgentPrefs(db, id, { proactividad: false });
  expect((await getAgentPrefs(db, id)).proactividad).toBe(false);
  await setAgentPrefs(db, id, { proactividad: true });
  expect((await getAgentPrefs(db, id)).proactividad).toBe(true);
});
