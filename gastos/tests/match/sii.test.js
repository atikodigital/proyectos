// gastos/tests/match/sii.test.js
const { conciliarSii } = require('../../src/match/sii');

const docs = [
  { clase: 'compra', tipo_doc: 'factura', rut: '76.111.111-1', folio: '1234', fecha: '2026-06-05', neto: 10000, iva: 1900, total: 11900 },
  { clase: 'compra', tipo_doc: 'factura', rut: '76.999.999-9', folio: '5', fecha: '2026-06-07', neto: 5000, iva: 950, total: 5950 },
  { clase: 'venta', tipo_doc: 'factura', rut: '77.222.222-2', folio: '88', fecha: '2026-06-06', neto: 20000, iva: 3800, total: 23800 },
];
// Contabilidad: tiene la compra 1234 (gasto) y la venta 88 (ingreso); le falta la compra folio 5.
const expenses = [
  { id: 'e1', tipo: 'gasto', rut_emisor: '76.111.111-1', folio: '1234', neto: 10000, iva: 1900, total: 11900 },
  { id: 'i1', tipo: 'ingreso', rut_emisor: '77.222.222-2', folio: '88', neto: 20000, iva: 3800, total: 23800 },
];

test('detecta faltante (en SII no en contabilidad) y matchea el resto', () => {
  const r = conciliarSii(docs, expenses);
  expect(r.clase.compras).toBe(2);
  expect(r.clase.ventas).toBe(1);
  expect(r.faltantes.length).toBe(1);
  expect(r.faltantes[0].folio).toBe('5');
  expect(r.faltantes[0].clase).toBe('compra');
  expect(r.matched.length).toBe(2);
});

test('cuadre de IVA: crédito y débito contable vs SII', () => {
  const r = conciliarSii(docs, expenses);
  // SII: crédito = 1900 + 950 = 2850 ; débito = 3800
  expect(r.iva.creditoSii).toBe(2850);
  expect(r.iva.debitoSii).toBe(3800);
  // Contable: crédito = 1900 (solo la 1234) ; débito = 3800
  expect(r.iva.creditoContable).toBe(1900);
  expect(r.iva.debitoContable).toBe(3800);
  // IVA a pagar SII = 3800 - 2850 = 950 ; contable = 3800 - 1900 = 1900
  expect(r.iva.ivaPagarSii).toBe(950);
  expect(r.iva.ivaPagarContable).toBe(1900);
  expect(r.iva.diferenciaCredito).toBe(950); // crédito que falta registrar
});

test('sobrante: registrado en contabilidad pero no en el SII', () => {
  const r = conciliarSii([], [{ id: 'x', tipo: 'gasto', rut_emisor: '1-9', folio: '999', total: 1000, iva: 0 }]);
  expect(r.sobrantes.length).toBe(1);
  expect(r.sobrantes[0].expenseId).toBe('x');
});
