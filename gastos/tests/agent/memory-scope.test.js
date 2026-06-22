const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const memory = require('../../src/agent/memory');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  return db;
}

test('kaly_memory tiene columnas owner_kind/owner_id con defaults', async () => {
  const db = await freshDb();
  const C = require('crypto').randomUUID();
  await db.query("INSERT INTO kaly_memory(company_id, tipo, contenido, origen) VALUES($1,'hecho','x','kaly')", [C]);
  const r = await db.query('SELECT owner_kind, owner_id FROM kaly_memory WHERE company_id=$1', [C]);
  expect(r.rows[0].owner_kind).toBe('company');
  expect(r.rows[0].owner_id == null).toBe(true);
});

test('cross-tenant: empresa A no ve memoria de empresa B', async () => {
  const db = await freshDb();
  const A = require('crypto').randomUUID();
  const B = require('crypto').randomUUID();
  await memory.crearMemoria(db, A, { contenido: 'hecho de A', tipo: 'negocio' });
  await memory.crearMemoria(db, B, { contenido: 'hecho de B', tipo: 'negocio' });
  const listaA = await memory.listMemorias(db, A, { owner: { kind: 'user', id: 'u1' } });
  expect(listaA.map((m) => m.contenido)).toEqual(['hecho de A']);
});

test('personal: persona P2 no ve la memoria privada de P1; la de empresa la ven ambas', async () => {
  const db = await freshDb();
  const C = require('crypto').randomUUID();
  const P1 = require('crypto').randomUUID();
  const P2 = require('crypto').randomUUID();
  await memory.crearMemoria(db, C, { contenido: 'privado de P1', tipo: 'dueño', owner_kind: 'user', owner_id: P1 });
  await memory.crearMemoria(db, C, { contenido: 'de la empresa', tipo: 'negocio' });
  const verP1 = (await memory.listMemorias(db, C, { owner: { kind: 'user', id: P1 } })).map((m) => m.contenido);
  const verP2 = (await memory.listMemorias(db, C, { owner: { kind: 'user', id: P2 } })).map((m) => m.contenido);
  expect(verP1.sort()).toEqual(['de la empresa', 'privado de P1'].sort());
  expect(verP2).toEqual(['de la empresa']);
});

test('listMemorias sin owner devuelve solo memoria de empresa (uso legacy/auto-aprender)', async () => {
  const db = await freshDb();
  const C = require('crypto').randomUUID();
  await memory.crearMemoria(db, C, { contenido: 'empresa', tipo: 'negocio' });
  await memory.crearMemoria(db, C, { contenido: 'privado', tipo: 'dueño', owner_kind: 'employee', owner_id: 'e1' });
  const lista = (await memory.listMemorias(db, C)).map((m) => m.contenido);
  expect(lista).toEqual(['empresa']);
});

test('borrarMemoria con owner: P2 no puede borrar lo privado de P1', async () => {
  const db = await freshDb();
  const C = require('crypto').randomUUID();
  const P1 = require('crypto').randomUUID();
  const P2 = require('crypto').randomUUID();
  const m = await memory.crearMemoria(db, C, { contenido: 'privado P1', owner_kind: 'user', owner_id: P1 });
  const noBorra = await memory.borrarMemoria(db, C, m.id, { owner: { kind: 'user', id: P2 } });
  expect(noBorra).toBe(null);
  const siBorra = await memory.borrarMemoria(db, C, m.id, { owner: { kind: 'user', id: P1 } });
  expect(siBorra && siBorra.id).toBe(m.id);
});

test('borrarMemoriasDe limpia toda la memoria personal de la persona', async () => {
  const db = await freshDb();
  const C = require('crypto').randomUUID();
  const P1 = require('crypto').randomUUID();
  await memory.crearMemoria(db, C, { contenido: 'a', owner_kind: 'user', owner_id: P1 });
  await memory.crearMemoria(db, C, { contenido: 'b', owner_kind: 'user', owner_id: P1 });
  await memory.crearMemoria(db, C, { contenido: 'empresa', tipo: 'negocio' });
  const n = await memory.borrarMemoriasDe(db, C, { ownerKind: 'user', ownerId: P1 });
  expect(n).toBe(2);
  const quedan = (await memory.listMemorias(db, C, { owner: { kind: 'user', id: P1 } })).map((m) => m.contenido);
  expect(quedan).toEqual(['empresa']);
});

test('crearMemoria personal sin owner_id se rechaza (no crea fila huérfana)', async () => {
  const db = await freshDb();
  const C = require('crypto').randomUUID();
  const orphan = await memory.crearMemoria(db, C, { contenido: 'x', owner_kind: 'user' });
  expect(orphan).toBe(null);
});
