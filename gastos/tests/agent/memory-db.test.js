const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { crearMemoria, listMemorias, borrarMemoria } = require('../../src/agent/memory');

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

test('crear/listar/borrar memorias scoped por empresa', async () => {
  const db = await freshDb();
  const A = '00000000-0000-0000-0000-0000000000aa';
  const B = '00000000-0000-0000-0000-0000000000bb';
  await crearMemoria(db, A, { tipo: 'negocio', contenido: 'Cierra domingos', origen: 'kaly' });
  await crearMemoria(db, A, { tipo: 'dueño', contenido: 'Se llama José', origen: 'dueño' });
  await crearMemoria(db, B, { tipo: 'hecho', contenido: 'otra empresa' });

  const listaA = await listMemorias(db, A);
  expect(listaA.map((m) => m.contenido).sort()).toEqual(['Cierra domingos', 'Se llama José']);
  expect(listaA[0]).toHaveProperty('id');

  await borrarMemoria(db, A, listaA[0].id);
  expect((await listMemorias(db, A)).length).toBe(1);
  expect((await listMemorias(db, B)).length).toBe(1);
});

test('crearMemoria ignora contenido vacío', async () => {
  const db = await freshDb();
  const A = '00000000-0000-0000-0000-0000000000aa';
  const r = await crearMemoria(db, A, { contenido: '  ' });
  expect(r).toBeNull();
  expect((await listMemorias(db, A)).length).toBe(0);
});

test('crearMemoria acepta origen "auto"', async () => {
  const db = await freshDb();
  const companyId = '00000000-0000-0000-0000-0000000000aa';
  const m = await crearMemoria(db, companyId, { tipo: 'negocio', contenido: 'Atiende sábados', origen: 'auto' });
  expect(m.origen).toBe('auto');
});
