const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { intakeFromImage } = require('../../src/expenses/intake');
const lineasRepo = require('../../src/expenses/lineas-repo');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await db.query("INSERT INTO companies (id, nombre) VALUES ($1, 'Test')", [COMPANY]);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';

test('intake guarda las lineas del gasto', async () => {
  const db = await makeDb();
  const extract = async () => ({
    tipo: 'gasto', tipo_documento: 'factura', proveedor: 'Distribuidora', fecha: '2026-06-10',
    neto: 15000, iva: 2850, total: 17850, categoria: 'Mercadería e insumos del giro',
    lineas: [
      { descripcion: 'Harina 25kg', cantidad: 2, unidad: 'kg', neto: 10000, iva: 1900, total: 11900 },
      { descripcion: 'Levadura', cantidad: 1, unidad: 'un', neto: 5000, iva: 950, total: 5950 },
    ],
  });
  const { expense } = await intakeFromImage({
    db, companyId: COMPANY, employeeId: null, imageBuffer: Buffer.from('x'), mimeType: 'image/jpeg',
    canal: 'app', extract, storeImage: () => null,
  });
  expect(expense).toBeTruthy();
  const lineas = await lineasRepo.getLineas(db, expense.id);
  expect(lineas.length).toBe(2);
  expect(lineas[0].descripcion).toBe('Harina 25kg');
  expect(lineas[0].unidad).toBe('kg');
});

test('intake sin lineas no guarda detalle (no rompe)', async () => {
  const db = await makeDb();
  const extract = async () => ({ tipo: 'gasto', proveedor: 'X', fecha: '2026-06-10', total: 5000, categoria: 'Otros gastos' });
  const { expense } = await intakeFromImage({
    db, companyId: COMPANY, employeeId: null, imageBuffer: Buffer.from('x'), mimeType: 'image/jpeg',
    canal: 'app', extract, storeImage: () => null,
  });
  expect(expense).toBeTruthy();
  expect((await lineasRepo.getLineas(db, expense.id)).length).toBe(0);
});
