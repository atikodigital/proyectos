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
