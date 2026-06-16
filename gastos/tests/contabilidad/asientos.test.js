// gastos/tests/contabilidad/asientos.test.js
const { asientoDeMovimiento, asientoBalanceado } = require('../../src/contabilidad/asientos');

// Resolvedor de cuentas para tests: clave/código -> id ficticio.
const ID = {
  banco: 'c-banco', caja: 'c-caja', iva_credito: 'c-ivacred', iva_debito: 'c-ivadeb',
  proveedores: 'c-prov', clientes: 'c-clientes', ventas: 'c-ventas', gasto_generico: 'c-gasto',
  gastos_financieros: 'c-finan',
  '4.3.10.1': 'c-generales',
};
const resolver = { porClave: (k) => ID[k], porCodigo: (c) => ID[c] || ID.gasto_generico };

test('gasto a crédito (devengo): Debe gasto+IVA crédito / Haber proveedores', () => {
  const exp = { id: 'e1', tipo: 'gasto', neto: 10000, iva: 1900, total: 11900, fecha: '2026-06-10', cuenta_sii_codigo: '4.3.10.1', proveedor: 'Sodimac' };
  const a = asientoDeMovimiento(exp, resolver, 'devengo');
  expect(a.tipo_asiento).toBe('devengo');
  expect(a.origen).toBe('expense');
  expect(a.origen_ref).toBe('e1');
  const debe = a.lineas.filter((l) => l.debe > 0);
  const haber = a.lineas.filter((l) => l.haber > 0);
  expect(debe.find((l) => l.cuenta_id === 'c-generales').debe).toBe(10000);
  expect(debe.find((l) => l.cuenta_id === 'c-ivacred').debe).toBe(1900);
  expect(haber.find((l) => l.cuenta_id === 'c-prov').haber).toBe(11900);
  expect(asientoBalanceado(a)).toBe(true);
});

test('pago de gasto: Debe proveedores / Haber banco', () => {
  const exp = { id: 'e1', tipo: 'gasto', total: 11900, fecha: '2026-06-15', proveedor: 'Sodimac' };
  const a = asientoDeMovimiento(exp, resolver, 'pago');
  expect(a.tipo_asiento).toBe('pago');
  expect(a.origen).toBe('pago');
  expect(a.lineas.find((l) => l.cuenta_id === 'c-prov').debe).toBe(11900);
  expect(a.lineas.find((l) => l.cuenta_id === 'c-banco').haber).toBe(11900);
  expect(asientoBalanceado(a)).toBe(true);
});

test('venta (devengo): Debe clientes / Haber ventas+IVA débito', () => {
  const exp = { id: 'i1', tipo: 'ingreso', neto: 20000, iva: 3800, total: 23800, fecha: '2026-06-10', proveedor: 'Cliente X' };
  const a = asientoDeMovimiento(exp, resolver, 'devengo');
  expect(a.lineas.find((l) => l.cuenta_id === 'c-clientes').debe).toBe(23800);
  expect(a.lineas.find((l) => l.cuenta_id === 'c-ventas').haber).toBe(20000);
  expect(a.lineas.find((l) => l.cuenta_id === 'c-ivadeb').haber).toBe(3800);
  expect(asientoBalanceado(a)).toBe(true);
});

test('cobro de venta: Debe banco / Haber clientes', () => {
  const exp = { id: 'i1', tipo: 'ingreso', total: 23800, fecha: '2026-06-20' };
  const a = asientoDeMovimiento(exp, resolver, 'pago');
  expect(a.lineas.find((l) => l.cuenta_id === 'c-banco').debe).toBe(23800);
  expect(a.lineas.find((l) => l.cuenta_id === 'c-clientes').haber).toBe(23800);
  expect(asientoBalanceado(a)).toBe(true);
});

test('gasto sin IVA: solo gasto / proveedores (sin línea de IVA)', () => {
  const exp = { id: 'e2', tipo: 'gasto', neto: 5000, iva: 0, total: 5000, fecha: '2026-06-10', cuenta_sii_codigo: '4.3.10.1' };
  const a = asientoDeMovimiento(exp, resolver, 'devengo');
  expect(a.lineas.some((l) => l.cuenta_id === 'c-ivacred')).toBe(false);
  expect(asientoBalanceado(a)).toBe(true);
});

test('asiento descuadrado lanza error', () => {
  const malo = { tipo_asiento: 'ajuste', origen: 'manual', origen_ref: 'x', fecha: '2026-06-10', glosa: 'malo', lineas: [{ cuenta_id: 'a', debe: 100, haber: 0 }, { cuenta_id: 'b', debe: 0, haber: 90 }] };
  expect(() => asientoBalanceado(malo, { strict: true })).toThrow('asiento_descuadrado');
});

test('lanza si una cuenta no se resuelve', () => {
  const vacio = { porClave: () => null, porCodigo: () => null };
  const exp = { id: 'e9', tipo: 'gasto', neto: 1000, iva: 190, total: 1190, fecha: '2026-06-10', cuenta_sii_codigo: '9.9.9' };
  expect(() => asientoDeMovimiento(exp, vacio, 'devengo')).toThrow('cuenta_no_encontrada');
});
