const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { buildAgentContext } = require('../../src/agent/context');
const memory = require('../../src/agent/memory');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  return db;
}

test('buildAgentContext de empresa A no incluye memoria de empresa B', async () => {
  const db = await freshDb();
  const A = (await db.query("INSERT INTO companies(nombre) VALUES('Pizza A') RETURNING id")).rows[0].id;
  const B = (await db.query("INSERT INTO companies(nombre) VALUES('Pizza B') RETURNING id")).rows[0].id;
  await memory.crearMemoria(db, A, { contenido: 'secreto de A', tipo: 'negocio' });
  await memory.crearMemoria(db, B, { contenido: 'secreto de B', tipo: 'negocio' });
  const ctx = await buildAgentContext(db, { companyId: A, employeeId: null, owner: { kind: 'user', id: 'uA' } });
  expect(ctx.empresaNombre).toBe('Pizza A');
  const contenidos = (ctx.memorias || []).map((m) => m.contenido);
  expect(contenidos).toContain('secreto de A');
  expect(contenidos).not.toContain('secreto de B');
});

test('buildAgentContext incluye la memoria personal de la persona, no la de otra', async () => {
  const db = await freshDb();
  const C = (await db.query("INSERT INTO companies(nombre) VALUES('Pizza C') RETURNING id")).rows[0].id;
  await memory.crearMemoria(db, C, { contenido: 'privado de U1', owner_kind: 'user', owner_id: 'U1' });
  const ctx = await buildAgentContext(db, { companyId: C, employeeId: null, owner: { kind: 'user', id: 'U2' } });
  const contenidos = (ctx.memorias || []).map((m) => m.contenido);
  expect(contenidos).not.toContain('privado de U1');
});
