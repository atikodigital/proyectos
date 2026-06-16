// gastos/tests/match/engine-n2.test.js
const { scoreMatch } = require('../../src/match/engine');

test('tolerancia de redondeo: diferencia <=2 pesos sigue puntuando monto', () => {
  const linea = { tipo: 'cargo', monto: 11900, fecha: '2026-06-10', glosa: '', n_operacion: '' };
  const gasto = { tipo: 'gasto', total: 11899, fecha: '2026-06-10', proveedor: '' };
  const { score, razones } = scoreMatch(linea, gasto, { toleranciaRedondeo: 2 });
  expect(razones).toContain('monto');
  expect(score).toBeGreaterThan(0);
});

test('sin tolerancia, diferencia de 1 peso NO puntua monto (compat actual)', () => {
  const linea = { tipo: 'cargo', monto: 11900, fecha: '2026-06-10', glosa: '', n_operacion: '' };
  const gasto = { tipo: 'gasto', total: 11899, fecha: '2026-06-10', proveedor: '' };
  const { razones } = scoreMatch(linea, gasto);
  expect(razones).not.toContain('monto');
});

test('similitud de glosa por tokens (proveedor multi-palabra)', () => {
  const linea = { tipo: 'cargo', monto: 5000, fecha: '2026-06-10', glosa: 'TRANSF SODIMAC SA CASA MATRIZ', n_operacion: '' };
  const gasto = { tipo: 'gasto', total: 5000, fecha: '2026-06-10', proveedor: 'Sodimac' };
  const { razones } = scoreMatch(linea, gasto);
  expect(razones).toContain('glosa');
});
