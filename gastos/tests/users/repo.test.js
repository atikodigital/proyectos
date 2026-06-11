const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createUser, getUserByEmail } = require('../../src/users/repo');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const db = mem.adapters.createPg();
  const client = new db.Pool();
  await migrate(client).catch(() => {});
  const c = await client.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  return { db: client, companyId: c.rows[0].id };
}

test('crea usuario y lo busca por email', async () => {
  const { db, companyId } = await freshDb();
  const u = await createUser(db, { company_id: companyId, email: 'jefe@x.cl', password_hash: 'H', rol: 'owner' });
  expect(u.email).toBe('jefe@x.cl');
  const found = await getUserByEmail(db, 'jefe@x.cl');
  expect(found.id).toBe(u.id);
  expect(await getUserByEmail(db, 'no@x.cl')).toBeNull();
});
