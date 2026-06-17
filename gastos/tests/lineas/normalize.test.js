// gastos/tests/lineas/normalize.test.js
const { normalizeLineas } = require('../../src/domain/lineas');

test('normaliza descripción, cantidad, unidad y montos', () => {
  const r = normalizeLineas([
    { descripcion: '  Harina de trigo 25kg  ', cantidad: '2', unidad: 'KG', neto: '10000', total: '11900' },
    { descripcion: 'Levadura', cantidad: 1, unidad: '', total: 2380 },
  ]);
  expect(r.length).toBe(2);
  expect(r[0].descripcion).toBe('Harina de trigo 25kg');
  expect(r[0].cantidad).toBe(2);
  expect(r[0].unidad).toBe('kg');
  expect(r[0].neto).toBe(10000);
  expect(r[0].total).toBe(11900);
  expect(r[1].unidad).toBe('un'); // default cuando no viene
  expect(r[1].cantidad).toBe(1);
});

test('descarta líneas sin descripción y sin monto', () => {
  const r = normalizeLineas([
    { descripcion: '', total: 0 },
    { descripcion: 'Queso', total: 5000 },
    null,
  ]);
  expect(r.length).toBe(1);
  expect(r[0].descripcion).toBe('Queso');
});

test('entrada no-array → []', () => {
  expect(normalizeLineas(undefined)).toEqual([]);
  expect(normalizeLineas('x')).toEqual([]);
});
