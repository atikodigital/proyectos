// gastos/tests/varas/tools.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const cuentas = require('../../src/contabilidad/cuentas');
const { contabilizarMovimiento } = require('../../src/contabilidad/contabilizar');
const auxRepo = require('../../src/auxiliares/repo');
const lineasRepo = require('../../src/expenses/lineas-repo');
const { createExpense } = require('../../src/expenses/repo');
const { TOOLS_READ, TOOL_DECLARATIONS, ACCION_NAMES } = require('../../src/varas/tools');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await db.query("INSERT INTO companies (id, nombre) VALUES ($1,'T')", [COMPANY]);
  await cuentas.sembrarCuentas(db, COMPANY);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';

test('TOOL_DECLARATIONS y ACCION_NAMES están definidos', () => {
  expect(Array.isArray(TOOL_DECLARATIONS)).toBe(true);
  expect(TOOL_DECLARATIONS.find((d) => d.name === 'consumo_insumo')).toBeTruthy();
  expect(ACCION_NAMES.has('marcar_pagado')).toBe(true);
  expect(ACCION_NAMES.has('consumo_insumo')).toBe(false);
});

test('balance() devuelve cuadrado y totales', async () => {
  const db = await makeDb();
  await contabilizarMovimiento(db, COMPANY, { id: 'e1', tipo: 'gasto', neto: 10000, iva: 1900, total: 11900, fecha: '2026-06-10', cuenta_sii_codigo: '4.3.10.1', proveedor: 'X' }, 'devengo');
  const r = await TOOLS_READ.balance(db, COMPANY, {});
  expect(r.cuadrado).toBe(true);
});

test('consumo_insumo() responde por nombre', async () => {
  const db = await makeDb();
  const harina = await auxRepo.createAuxiliar(db, COMPANY, { nombre: 'Harina', unidad_principal: 'kg' });
  const e = await createExpense(db, { company_id: COMPANY, tipo: 'gasto', total: 11900, fecha: '2026-06-10' });
  await lineasRepo.createLineas(db, e.id, [{ descripcion: 'Harina', cantidad: 25, unidad: 'kg', total: 11900, auxiliar_id: harina.id }]);
  const r = await TOOLS_READ.consumo_insumo(db, COMPANY, { nombre: 'harina' });
  expect(r.cantidadPorUnidad.kg).toBe(25);
  expect(typeof r.frase).toBe('string');
});

test('deudas() trae saldo de proveedores y clientes', async () => {
  const db = await makeDb();
  // gasto a crédito (devengo) → proveedores con saldo acreedor
  await contabilizarMovimiento(db, COMPANY, { id: 'e1', tipo: 'gasto', neto: 10000, iva: 1900, total: 11900, fecha: '2026-06-10', cuenta_sii_codigo: '4.3.10.1', proveedor: 'X' }, 'devengo');
  const r = await TOOLS_READ.deudas(db, COMPANY, {});
  expect(Number(r.proveedores)).toBe(11900); // por pagar
  expect(Number(r.clientes)).toBe(0);
});
