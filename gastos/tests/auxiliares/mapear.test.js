// gastos/tests/auxiliares/mapear.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const repo = require('../../src/auxiliares/repo');
const { mapearLineas } = require('../../src/auxiliares/mapear');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';

test('mapea por match determinístico al auxiliar existente (sin IA)', async () => {
  const db = await makeDb();
  const harina = await repo.createAuxiliar(db, COMPANY, { nombre: 'Harina', unidad_principal: 'kg' });
  const lineas = [{ descripcion: 'Harina de trigo 25kg', cantidad: 2, unidad: 'kg', total: 11900 }];
  const componer = async () => { throw new Error('no debería llamar IA'); };
  const out = await mapearLineas(db, COMPANY, lineas, { componer });
  expect(out[0].auxiliar_id).toBe(harina.id);
});

test('línea desconocida → IA propone auxiliar nuevo (sugerido) y se asigna', async () => {
  const db = await makeDb();
  const lineas = [{ descripcion: 'Mantequilla sin sal 1kg', cantidad: 1, unidad: 'kg', total: 5950 }];
  const componer = async () => ([{ idx: 0, auxiliar: 'Mantequilla', existe: false, naturaleza: 'insumo', unidad: 'kg', cuentaClave: null }]);
  const out = await mapearLineas(db, COMPANY, lineas, { componer });
  expect(out[0].auxiliar_id).toBeTruthy();
  const lista = await repo.listAuxiliares(db, COMPANY);
  expect(lista.find((a) => a.nombre === 'Mantequilla')).toBeTruthy();
  // la descripción cruda quedó como sinónimo para futuros matches
  const aux = await repo.getById(db, out[0].auxiliar_id);
  expect(aux.sinonimos.join(' ').toLowerCase()).toContain('mantequilla');
});

test('si la IA falla, las líneas no matcheadas quedan con auxiliar_id null (no rompe)', async () => {
  const db = await makeDb();
  const lineas = [{ descripcion: 'Algo raro', cantidad: 1, unidad: 'un', total: 1000 }];
  const componer = async () => { throw new Error('ia_down'); };
  const out = await mapearLineas(db, COMPANY, lineas, { componer });
  expect(out[0].auxiliar_id).toBeNull();
});
