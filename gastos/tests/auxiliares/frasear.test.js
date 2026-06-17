// gastos/tests/auxiliares/frasear.test.js
const { frasearConsumo } = require('../../src/auxiliares/reportes');

test('arma una frase legible con cantidad por unidad y monto', () => {
  const f = frasearConsumo({ auxiliar: { nombre: 'Harina' }, cantidadPorUnidad: { kg: 70 }, monto: 35700, serie: [] }, 'Harina');
  expect(f).toMatch(/70\s*kg/i);
  expect(f).toMatch(/Harina/);
  expect(f).toMatch(/\$35\.?700/);
});

test('sin auxiliar → frase de no encontrado', () => {
  const f = frasearConsumo({ auxiliar: null, cantidadPorUnidad: {}, monto: 0, serie: [] }, 'plutonio');
  expect(f.toLowerCase()).toContain('no');
  expect(f).toMatch(/plutonio/);
});
