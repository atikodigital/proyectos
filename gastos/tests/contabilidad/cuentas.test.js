const { PLAN_BASE, cuentaPorClave, CLAVES } = require('../../src/contabilidad/cuentas');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const cuentas = require('../../src/contabilidad/cuentas');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';

test('PLAN_BASE trae las cuentas mínimas para cuadrar', () => {
  const claves = PLAN_BASE.map((c) => c.clave);
  for (const k of ['caja', 'banco', 'iva_credito', 'iva_debito', 'proveedores', 'clientes', 'ventas', 'gastos_financieros', 'gasto_generico']) {
    expect(claves).toContain(k);
  }
  // cada cuenta tiene codigo, nombre, tipo, imputable
  for (const c of PLAN_BASE) {
    expect(typeof c.codigo).toBe('string');
    expect(typeof c.nombre).toBe('string');
    expect(['activo', 'pasivo', 'patrimonio', 'resultado_ganancia', 'resultado_perdida']).toContain(c.tipo);
    expect(typeof c.imputable).toBe('boolean');
  }
});

test('tipos contables correctos de las cuentas núcleo', () => {
  expect(cuentaPorClave('banco').tipo).toBe('activo');
  expect(cuentaPorClave('iva_credito').tipo).toBe('activo');
  expect(cuentaPorClave('proveedores').tipo).toBe('pasivo');
  expect(cuentaPorClave('iva_debito').tipo).toBe('pasivo');
  expect(cuentaPorClave('clientes').tipo).toBe('activo');
  expect(cuentaPorClave('ventas').tipo).toBe('resultado_ganancia');
});

test('CLAVES expone las claves núcleo como constantes', () => {
  expect(CLAVES.BANCO).toBe('banco');
  expect(CLAVES.PROVEEDORES).toBe('proveedores');
});

test('no hay códigos duplicados en PLAN_BASE', () => {
  const codigos = PLAN_BASE.map((c) => c.codigo);
  expect(new Set(codigos).size).toBe(codigos.length);
});

test('cuentaPorClave devuelve null para clave inexistente', () => {
  expect(cuentaPorClave('no_existe')).toBeNull();
});

test('sembrarCuentas crea el plan base y es idempotente', async () => {
  const db = await makeDb();
  await cuentas.sembrarCuentas(db, COMPANY);
  const a = await cuentas.listCuentas(db, COMPANY);
  expect(a.length).toBe(cuentas.PLAN_BASE.length);
  // 2ª vez no duplica
  await cuentas.sembrarCuentas(db, COMPANY);
  const b = await cuentas.listCuentas(db, COMPANY);
  expect(b.length).toBe(cuentas.PLAN_BASE.length);
});

test('getCuentaId resuelve una cuenta núcleo por clave (sembrando si hace falta)', async () => {
  const db = await makeDb();
  const id = await cuentas.getCuentaId(db, COMPANY, 'banco');
  expect(id).toBeTruthy();
  const lista = await cuentas.listCuentas(db, COMPANY);
  const banco = lista.find((c) => c.clave === 'banco');
  expect(banco.id).toBe(id);
});
