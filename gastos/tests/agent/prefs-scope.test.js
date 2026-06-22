const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createEmployee, getAgentPrefs, setAgentPrefs } = require('../../src/companies/repo');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  return db;
}

test('getAgentPrefs no cruza empresas: empleado de B no se lee desde empresa A', async () => {
  const db = await freshDb();
  const A = (await db.query("INSERT INTO companies(nombre) VALUES('A') RETURNING id")).rows[0].id;
  const B = (await db.query("INSERT INTO companies(nombre) VALUES('B') RETURNING id")).rows[0].id;
  const empB = await createEmployee(db, { company_id: B, nombre: 'Bob' });
  await setAgentPrefs(db, empB.id, B, { nombre: 'Bob', trato: 'señor' });
  const cruz = await getAgentPrefs(db, empB.id, A);
  expect(cruz).toEqual({});
  const propio = await getAgentPrefs(db, empB.id, B);
  expect(propio.nombre).toBe('Bob');
});
