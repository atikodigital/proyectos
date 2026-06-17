// gastos/tests/panel/manual-lib.test.js
const lib = require('../../public/panel/lib');

test('cuadreManual suma debe/haber y marca cuadrado', () => {
  expect(lib.cuadreManual([{ debe: 1000, haber: 0 }, { debe: 0, haber: 1000 }])).toEqual({ sumD: 1000, sumH: 1000, cuadrado: true });
  expect(lib.cuadreManual([{ debe: 1000, haber: 0 }, { debe: 0, haber: 900 }]).cuadrado).toBe(false);
  expect(lib.cuadreManual([]).cuadrado).toBe(false);
});

test('diarioTableHtml incluye botón Anular con el id del asiento', () => {
  const html = lib.diarioTableHtml([{ id: 'as1', fecha: '2026-06-10', glosa: 'Ajuste', lineas: [{ cuenta_nombre: 'Banco', debe: 1000, haber: 0 }] }]);
  expect(html).toContain('data-anular="as1"');
});
