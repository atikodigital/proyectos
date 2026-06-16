// gastos/tests/contabilidad/integracion.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const cuentas = require('../../src/contabilidad/cuentas');
const { aplicarContabilidad } = require('../../src/contabilidad/contabilizar');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';
const gasto = { id: 'e1', tipo: 'gasto', neto: 10000, iva: 1900, total: 11900, fecha: '2026-06-10', cuenta_sii_codigo: '4.3.10.1', proveedor: 'Sodimac' };

test('aplicarContabilidad("confirmar") crea el devengo; ("pagar") crea el pago; ("anular") descontabiliza', async () => {
  const db = await makeDb();
  await cuentas.sembrarCuentas(db, COMPANY);
  await aplicarContabilidad(db, COMPANY, gasto, 'confirmar');
  let vivos = await db.query("SELECT tipo_asiento FROM asientos WHERE company_id=$1 AND origen_ref='e1' AND estado<>'anulado'", [COMPANY]);
  expect(vivos.rows.map((r) => r.tipo_asiento).sort()).toEqual(['devengo']);

  await aplicarContabilidad(db, COMPANY, gasto, 'pagar');
  vivos = await db.query("SELECT tipo_asiento FROM asientos WHERE company_id=$1 AND origen_ref='e1' AND estado<>'anulado'", [COMPANY]);
  expect(vivos.rows.map((r) => r.tipo_asiento).sort()).toEqual(['devengo', 'pago']);

  await aplicarContabilidad(db, COMPANY, gasto, 'anular');
  vivos = await db.query("SELECT tipo_asiento FROM asientos WHERE company_id=$1 AND origen_ref='e1' AND estado<>'anulado'", [COMPANY]);
  expect(vivos.rows.length).toBe(0);
});

test('aplicarContabilidad nunca lanza aunque falle (no debe tumbar el flujo)', async () => {
  const db = await makeDb();
  // sin sembrar cuentas a propósito; igual no debe lanzar
  await expect(aplicarContabilidad(db, COMPANY, gasto, 'confirmar')).resolves.toBeDefined();
});
