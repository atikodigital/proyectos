// gastos/tests/contabilidad/manual.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const cuentas = require('../../src/contabilidad/cuentas');
const repo = require('../../src/contabilidad/repo');
const { validarAsientoManual, crearAsientoManual, anularAsientoManual } = require('../../src/contabilidad/manual');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';
const OTRA = '99999999-9999-9999-9999-999999999999';

test('validarAsientoManual: cuadra / descuadrado / min líneas', () => {
  expect(validarAsientoManual({ lineas: [{ cuenta_id: 'a', debe: 1000, haber: 0 }, { cuenta_id: 'b', debe: 0, haber: 1000 }] }).ok).toBe(true);
  expect(validarAsientoManual({ lineas: [{ cuenta_id: 'a', debe: 1000, haber: 0 }, { cuenta_id: 'b', debe: 0, haber: 900 }] }).ok).toBe(false);
  expect(validarAsientoManual({ lineas: [{ cuenta_id: 'a', debe: 1000, haber: 0 }] }).ok).toBe(false); // <2
  expect(validarAsientoManual({ lineas: [{ debe: 1000, haber: 0 }, { cuenta_id: 'b', debe: 0, haber: 1000 }] }).ok).toBe(false); // sin cuenta
});

test('crearAsientoManual persiste un asiento balanceado origen=manual', async () => {
  const db = await makeDb();
  await cuentas.sembrarCuentas(db, COMPANY);
  const lista = await cuentas.listCuentas(db, COMPANY);
  const c1 = lista[0].id; const c2 = lista[1].id;
  const a = await crearAsientoManual(db, COMPANY, { fecha: '2026-06-10', glosa: 'Ajuste', lineas: [
    { cuenta_id: c1, debe: 5000, haber: 0 }, { cuenta_id: c2, debe: 0, haber: 5000 },
  ] });
  expect(a.id).toBeTruthy();
  expect(a.origen).toBe('manual');
  expect(a.tipo_asiento).toBe('ajuste');
  const lineas = await repo.getLineas(db, a.id);
  expect(lineas.reduce((s, l) => s + Number(l.debe), 0)).toBe(5000);
});

test('crearAsientoManual rechaza descuadre y cuenta de otra empresa', async () => {
  const db = await makeDb();
  await cuentas.sembrarCuentas(db, COMPANY);
  await cuentas.sembrarCuentas(db, OTRA);
  const mias = await cuentas.listCuentas(db, COMPANY);
  const ajenas = await cuentas.listCuentas(db, OTRA);
  await expect(crearAsientoManual(db, COMPANY, { lineas: [
    { cuenta_id: mias[0].id, debe: 1000, haber: 0 }, { cuenta_id: mias[1].id, debe: 0, haber: 900 },
  ] })).rejects.toThrow('descuadrado');
  await expect(crearAsientoManual(db, COMPANY, { lineas: [
    { cuenta_id: mias[0].id, debe: 1000, haber: 0 }, { cuenta_id: ajenas[0].id, debe: 0, haber: 1000 },
  ] })).rejects.toThrow('cuenta_invalida');
});

test('anularAsientoManual scoped: no anula asiento de otra empresa', async () => {
  const db = await makeDb();
  await cuentas.sembrarCuentas(db, COMPANY);
  const lista = await cuentas.listCuentas(db, COMPANY);
  const a = await crearAsientoManual(db, COMPANY, { lineas: [{ cuenta_id: lista[0].id, debe: 5000, haber: 0 }, { cuenta_id: lista[1].id, debe: 0, haber: 5000 }] });
  expect(await anularAsientoManual(db, OTRA, a.id)).toBeNull();      // otra empresa → null
  const ok = await anularAsientoManual(db, COMPANY, a.id);
  expect(ok.estado).toBe('anulado');
});
