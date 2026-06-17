// gastos/tests/auxiliares/reportes.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createExpense } = require('../../src/expenses/repo');
const lineas = require('../../src/expenses/lineas-repo');
const aux = require('../../src/auxiliares/repo');
const { consumoAuxiliar, consumoPorNombre } = require('../../src/auxiliares/reportes');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await db.query("INSERT INTO companies (id, nombre) VALUES ($1,'T')", [COMPANY]);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';

async function seed(db) {
  const harina = await aux.createAuxiliar(db, COMPANY, { nombre: 'Harina', unidad_principal: 'kg', sinonimos: ['harina de trigo'] });
  const e1 = await createExpense(db, { company_id: COMPANY, tipo: 'gasto', total: 23800, fecha: '2026-06-10' });
  await lineas.createLineas(db, e1.id, [{ descripcion: 'Harina 25kg', cantidad: 25, unidad: 'kg', total: 11900, auxiliar_id: harina.id }, { descripcion: 'Harina 25kg', cantidad: 25, unidad: 'kg', total: 11900, auxiliar_id: harina.id }]);
  const e2 = await createExpense(db, { company_id: COMPANY, tipo: 'gasto', total: 11900, fecha: '2026-05-12' });
  await lineas.createLineas(db, e2.id, [{ descripcion: 'Harina 20kg', cantidad: 20, unidad: 'kg', total: 11900, auxiliar_id: harina.id }]);
  return harina;
}

test('consumoAuxiliar suma cantidad por unidad, monto y serie mensual', async () => {
  const db = await makeDb();
  const harina = await seed(db);
  const r = await consumoAuxiliar(db, COMPANY, harina.id, {});
  expect(r.cantidadPorUnidad.kg).toBe(70);     // 25+25+20
  expect(r.monto).toBe(35700);                  // 11900*3
  const junio = r.serie.find((s) => s.ym === '2026-06');
  expect(junio.cantidad).toBe(50);
  expect(junio.monto).toBe(23800);
});

test('consumoAuxiliar con período filtra', async () => {
  const db = await makeDb();
  const harina = await seed(db);
  const r = await consumoAuxiliar(db, COMPANY, harina.id, { periodo: '2026-06' });
  expect(r.cantidadPorUnidad.kg).toBe(50);
  expect(r.monto).toBe(23800);
});

test('consumoPorNombre encuentra por nombre/sinónimo', async () => {
  const db = await makeDb();
  await seed(db);
  const r = await consumoPorNombre(db, COMPANY, 'harina de trigo', {});
  expect(r.auxiliar.nombre).toBe('Harina');
  expect(r.cantidadPorUnidad.kg).toBe(70);
});

test('consumoPorNombre sin match → auxiliar null y ceros', async () => {
  const db = await makeDb();
  await seed(db);
  const r = await consumoPorNombre(db, COMPANY, 'plutonio', {});
  expect(r.auxiliar).toBeNull();
  expect(r.monto).toBe(0);
});
