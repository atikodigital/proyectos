// gastos/tests/auxiliares/repo.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const repo = require('../../src/auxiliares/repo');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';

test('createAuxiliar y listAuxiliares scoped por empresa', async () => {
  const db = await makeDb();
  const a = await repo.createAuxiliar(db, COMPANY, { nombre: 'Harina', naturaleza: 'insumo', unidad_principal: 'kg', sinonimos: ['harina de trigo'] });
  expect(a.id).toBeTruthy();
  expect(a.nombre).toBe('Harina');
  expect(a.estado).toBe('sugerido');
  const lista = await repo.listAuxiliares(db, COMPANY);
  expect(lista.length).toBe(1);
  expect(lista[0].sinonimos).toContain('harina de trigo'); // jsonb round-trip
  // otra empresa no la ve
  expect((await repo.listAuxiliares(db, '22222222-2222-2222-2222-222222222222')).length).toBe(0);
});
