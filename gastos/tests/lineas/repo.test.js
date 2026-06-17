// gastos/tests/lineas/repo.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const repo = require('../../src/expenses/lineas-repo');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const EXP = '11111111-1111-1111-1111-111111111111';

test('createLineas guarda y getLineas devuelve en orden', async () => {
  const db = await makeDb();
  await repo.createLineas(db, EXP, [
    { descripcion: 'Harina 25kg', cantidad: 2, unidad: 'kg', neto: 10000, iva: 1900, total: 11900 },
    { descripcion: 'Levadura', cantidad: 1, unidad: 'un', neto: 5000, iva: 950, total: 5950 },
  ]);
  const rows = await repo.getLineas(db, EXP);
  expect(rows.length).toBe(2);
  expect(rows[0].descripcion).toBe('Harina 25kg');
  expect(Number(rows[0].total)).toBe(11900);
  expect(rows[0].orden).toBe(0);
  expect(rows[1].orden).toBe(1);
  expect(rows[0].auxiliar_id).toBeNull();
});

test('createLineas con arreglo vacío no inserta nada', async () => {
  const db = await makeDb();
  await repo.createLineas(db, EXP, []);
  expect((await repo.getLineas(db, EXP)).length).toBe(0);
});
