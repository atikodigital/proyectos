// gastos/tests/auxiliares/intake-auxiliar.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { intakeFromImage } = require('../../src/expenses/intake');
const lineasRepo = require('../../src/expenses/lineas-repo');
const auxRepo = require('../../src/auxiliares/repo');

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

test('el intake mapea las líneas a auxiliares (auxiliar_id queda seteado)', async () => {
  const db = await makeDb();
  await auxRepo.createAuxiliar(db, COMPANY, { nombre: 'Harina', unidad_principal: 'kg' });
  const extract = async () => ({
    tipo: 'gasto', proveedor: 'Distribuidora', fecha: '2026-06-10', neto: 10000, iva: 1900, total: 11900,
    categoria: 'Mercadería e insumos del giro',
    lineas: [{ descripcion: 'Harina de trigo 25kg', cantidad: 2, unidad: 'kg', neto: 10000, iva: 1900, total: 11900 }],
  });
  const { expense } = await intakeFromImage({
    db, companyId: COMPANY, employeeId: null, imageBuffer: Buffer.from('x'), mimeType: 'image/jpeg',
    canal: 'app', extract, storeImage: () => null,
    // mapeo real (det) sin IA: la línea matchea "Harina" existente
    mapearAux: async (lineas) => {
      const { mapearLineas } = require('../../src/auxiliares/mapear');
      return mapearLineas(db, COMPANY, lineas, { componer: async () => { throw new Error('no IA'); } });
    },
  });
  const lineas = await lineasRepo.getLineas(db, expense.id);
  expect(lineas[0].auxiliar_id).toBeTruthy();
});
