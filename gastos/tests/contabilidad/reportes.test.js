// gastos/tests/contabilidad/reportes.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const cuentas = require('../../src/contabilidad/cuentas');
const { contabilizarMovimiento } = require('../../src/contabilidad/contabilizar');
const reportes = require('../../src/contabilidad/reportes');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';

async function seed(db) {
  await cuentas.sembrarCuentas(db, COMPANY);
  await contabilizarMovimiento(db, COMPANY, { id: 'e1', tipo: 'gasto', neto: 10000, iva: 1900, total: 11900, fecha: '2026-06-10', cuenta_sii_codigo: '4.3.10.1', proveedor: 'Sodimac' }, 'devengo');
  await contabilizarMovimiento(db, COMPANY, { id: 'e1', tipo: 'gasto', total: 11900, fecha: '2026-06-15', proveedor: 'Sodimac' }, 'pago');
}

test('libroDiario lista los asientos del período con sus líneas', async () => {
  const db = await makeDb(); await seed(db);
  const diario = await reportes.libroDiario(db, COMPANY, { periodo: '2026-06' });
  expect(diario.length).toBe(2); // devengo + pago
  for (const a of diario) {
    const sumD = a.lineas.reduce((s, l) => s + Number(l.debe), 0);
    const sumH = a.lineas.reduce((s, l) => s + Number(l.haber), 0);
    expect(sumD).toBe(sumH);
  }
});

test('libroMayor agrupa por cuenta con saldo', async () => {
  const db = await makeDb(); await seed(db);
  const mayor = await reportes.libroMayor(db, COMPANY, { periodo: '2026-06' });
  const prov = mayor.find((c) => c.clave === 'proveedores');
  // Devengo: haber 11900; Pago: debe 11900 -> saldo 0
  expect(Number(prov.debe)).toBe(11900);
  expect(Number(prov.haber)).toBe(11900);
  expect(Number(prov.saldo)).toBe(0);
  const banco = mayor.find((c) => c.clave === 'banco');
  expect(Number(banco.haber)).toBe(11900); // salió plata del banco
});

test('balanceComprobacion cuadra (Σdebe total == Σhaber total)', async () => {
  const db = await makeDb(); await seed(db);
  const bal = await reportes.balanceComprobacion(db, COMPANY, { periodo: '2026-06' });
  expect(bal.cuadrado).toBe(true);
  expect(Number(bal.totalDebe)).toBe(Number(bal.totalHaber));
  // cada fila trae saldo deudor o acreedor
  const prov = bal.cuentas.find((c) => c.clave === 'proveedores');
  expect(Number(prov.deudor) + Number(prov.acreedor)).toBe(0); // saldo 0 -> ambos 0
});

test('flujoCaja suma solo asientos de pago de Caja+Banco', async () => {
  const db = await makeDb(); await seed(db);
  const flujo = await reportes.flujoCaja(db, COMPANY, { periodo: '2026-06' });
  // El único movimiento de banco fue el pago (haber 11900) -> salida
  expect(Number(flujo.salidas)).toBe(11900);
  expect(Number(flujo.entradas)).toBe(0);
  expect(Number(flujo.neto)).toBe(-11900);
  expect(flujo.movimientos.length).toBe(1);
});
