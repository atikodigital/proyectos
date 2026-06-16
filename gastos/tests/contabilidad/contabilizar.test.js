// gastos/tests/contabilidad/contabilizar.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const cuentas = require('../../src/contabilidad/cuentas');
const repo = require('../../src/contabilidad/repo');
const { contabilizarMovimiento, descontabilizarMovimiento } = require('../../src/contabilidad/contabilizar');

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

test('contabiliza el devengo y queda balanceado y vivo', async () => {
  const db = await makeDb();
  await cuentas.sembrarCuentas(db, COMPANY);
  const a = await contabilizarMovimiento(db, COMPANY, gasto, 'devengo');
  expect(a.id).toBeTruthy();
  const lineas = await repo.getLineas(db, a.id);
  const sumD = lineas.reduce((s, l) => s + Number(l.debe), 0);
  const sumH = lineas.reduce((s, l) => s + Number(l.haber), 0);
  expect(sumD).toBe(sumH);
  expect(sumD).toBe(11900);
});

test('idempotente: re-contabilizar reemplaza, no duplica', async () => {
  const db = await makeDb();
  await cuentas.sembrarCuentas(db, COMPANY);
  await contabilizarMovimiento(db, COMPANY, gasto, 'devengo');
  await contabilizarMovimiento(db, COMPANY, { ...gasto, neto: 20000, iva: 3800, total: 23800 }, 'devengo');
  const r = await db.query("SELECT * FROM asientos WHERE company_id=$1 AND origen_ref='e1' AND tipo_asiento='devengo' AND estado<>'anulado'", [COMPANY]);
  expect(r.rows.length).toBe(1); // solo uno vivo
  const lineas = await repo.getLineas(db, r.rows[0].id);
  expect(lineas.reduce((s, l) => s + Number(l.haber), 0)).toBe(23800); // el nuevo total
});

test('descontabilizar anula todos los asientos vivos del movimiento', async () => {
  const db = await makeDb();
  await cuentas.sembrarCuentas(db, COMPANY);
  await contabilizarMovimiento(db, COMPANY, gasto, 'devengo');
  await contabilizarMovimiento(db, COMPANY, gasto, 'pago');
  await descontabilizarMovimiento(db, COMPANY, 'e1');
  const vivos = await db.query("SELECT * FROM asientos WHERE company_id=$1 AND origen_ref='e1' AND estado<>'anulado'", [COMPANY]);
  expect(vivos.rows.length).toBe(0);
});
