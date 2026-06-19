const { computeTotals } = require('../../src/domain/money');

test('desde total deriva neto e iva (19%)', () => {
  expect(computeTotals({ total: 25000 })).toEqual({ neto: 21008, iva: 3992, total: 25000 });
});

test('desde neto deriva iva y total', () => {
  expect(computeTotals({ neto: 21008 })).toEqual({ neto: 21008, iva: 3992, total: 25000 });
});

test('con neto y total, iva = total - neto', () => {
  expect(computeTotals({ neto: 20000, total: 25000 })).toEqual({ neto: 20000, iva: 5000, total: 25000 });
});

test('iva 0 cuando no hay datos', () => {
  expect(computeTotals({})).toEqual({ neto: 0, iva: 0, total: 0 });
});

test('redondea a entero y nunca negativo', () => {
  const r = computeTotals({ total: 1000 });
  expect(Number.isInteger(r.neto)).toBe(true);
  expect(r.iva).toBeGreaterThanOrEqual(0);
});

test('factura exenta: IVA 0 y total = neto (no inventa 19%)', () => {
  expect(computeTotals({ total: 300000, exento: true })).toEqual({ neto: 300000, iva: 0, total: 300000 });
  expect(computeTotals({ neto: 185000, exento: true })).toEqual({ neto: 185000, iva: 0, total: 185000 });
});
