// gastos/tests/contabilidad/repo.test.js
const crypto = require('crypto');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const repo = require('../../src/contabilidad/repo');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';
const C1 = crypto.randomUUID();
const C2 = crypto.randomUUID();
const asientoDemo = (ref) => ({
  origen: 'expense', origen_ref: ref, tipo_asiento: 'devengo', fecha: '2026-06-10', glosa: 'Gasto',
  lineas: [{ cuenta_id: C1, debe: 10000, haber: 0 }, { cuenta_id: C2, debe: 0, haber: 10000 }],
});

test('guardarAsiento persiste cabecera + líneas y devuelve el id', async () => {
  const db = await makeDb();
  const a = await repo.guardarAsiento(db, COMPANY, asientoDemo('e1'));
  expect(a.id).toBeTruthy();
  const lineas = await repo.getLineas(db, a.id);
  expect(lineas.length).toBe(2);
  expect(Number(lineas.reduce((s, l) => s + Number(l.debe), 0))).toBe(10000);
});

test('buscarAsientoVivo encuentra el asiento no anulado del origen', async () => {
  const db = await makeDb();
  await repo.guardarAsiento(db, COMPANY, asientoDemo('e1'));
  const vivo = await repo.buscarAsientoVivo(db, COMPANY, 'expense', 'e1', 'devengo');
  expect(vivo).toBeTruthy();
});

test('anularAsiento marca estado anulado y deja de aparecer como vivo', async () => {
  const db = await makeDb();
  const a = await repo.guardarAsiento(db, COMPANY, asientoDemo('e1'));
  await repo.anularAsiento(db, a.id);
  const vivo = await repo.buscarAsientoVivo(db, COMPANY, 'expense', 'e1', 'devengo');
  expect(vivo).toBeNull();
});
