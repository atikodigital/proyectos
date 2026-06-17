// gastos/tests/auxiliares/semilla.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const repo = require('../../src/auxiliares/repo');
const { sembrarPorRubro } = require('../../src/auxiliares/semilla');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';

test('sembrarPorRubro crea los auxiliares que sugiere la IA, idempotente', async () => {
  const db = await makeDb();
  const componer = async () => ([
    { nombre: 'Harina', naturaleza: 'insumo', unidad: 'kg' },
    { nombre: 'Levadura', naturaleza: 'insumo', unidad: 'un' },
    { nombre: 'Electricidad', naturaleza: 'energia', unidad: 'kWh' },
  ]);
  const n = await sembrarPorRubro(db, COMPANY, 'pizzería', { componer });
  expect(n).toBe(3);
  const lista = await repo.listAuxiliares(db, COMPANY);
  expect(lista.map((a) => a.nombre).sort()).toEqual(['Electricidad', 'Harina', 'Levadura']);
  // idempotente: 2ª vez no duplica
  const n2 = await sembrarPorRubro(db, COMPANY, 'pizzería', { componer });
  expect(n2).toBe(0);
  expect((await repo.listAuxiliares(db, COMPANY)).length).toBe(3);
});

test('si la IA falla, sembrarPorRubro no rompe y devuelve 0', async () => {
  const db = await makeDb();
  const componer = async () => { throw new Error('ia_down'); };
  const n = await sembrarPorRubro(db, COMPANY, 'x', { componer });
  expect(n).toBe(0);
});
