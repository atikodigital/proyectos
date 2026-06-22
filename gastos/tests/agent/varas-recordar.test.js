const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { ejecutarAccion } = require('../../src/varas/acciones');
const memory = require('../../src/agent/memory');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  return db;
}

test('VARAS recordar guarda hecho de empresa por default', async () => {
  const db = await freshDb();
  const C = (await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id")).rows[0].id;
  const r = await ejecutarAccion(db, C, 'recordar', { contenido: 'el arriendo se paga el 5' }, { owner: { kind: 'user', id: 'u1' } });
  expect(r.ok).toBe(true);
  const emp = (await memory.listMemorias(db, C)).map((m) => m.contenido);
  expect(emp).toContain('el arriendo se paga el 5');
});

test('VARAS recordar con alcance personal queda privado de la persona', async () => {
  const db = await freshDb();
  const C = (await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id")).rows[0].id;
  await ejecutarAccion(db, C, 'recordar', { contenido: 'me dicen don José', alcance: 'personal' }, { owner: { kind: 'user', id: 'U1' } });
  const verU2 = (await memory.listMemorias(db, C, { owner: { kind: 'user', id: 'U2' } })).map((m) => m.contenido);
  expect(verU2).not.toContain('me dicen don José');
  const verU1 = (await memory.listMemorias(db, C, { owner: { kind: 'user', id: 'U1' } })).map((m) => m.contenido);
  expect(verU1).toContain('me dicen don José');
});
