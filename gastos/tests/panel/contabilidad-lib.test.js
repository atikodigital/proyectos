// gastos/tests/panel/contabilidad-lib.test.js
const lib = require('../../public/panel/lib');

test('diarioTableHtml rinde una fila por línea con cuenta y montos', () => {
  const html = lib.diarioTableHtml([
    { fecha: '2026-06-10', glosa: 'Gasto · Sodimac', lineas: [
      { codigo: '4.3.10.1', cuenta_nombre: 'Gastos Generales', debe: 10000, haber: 0 },
      { codigo: '2.1.10.1', cuenta_nombre: 'Proveedores', debe: 0, haber: 11900 },
    ] },
  ]);
  expect(html).toContain('Gastos Generales');
  expect(html).toContain('Proveedores');
  expect(html).toContain('Sodimac');
});

test('balanceTableHtml muestra totales y badge de cuadre', () => {
  const ok = lib.balanceTableHtml({ cuentas: [{ codigo: '1', nombre: 'Banco', deudor: 0, acreedor: 100 }], totalDebe: 100, totalHaber: 100, cuadrado: true });
  expect(ok).toContain('TOTALES');
  expect(ok.toLowerCase()).toContain('cuadrado');
  const no = lib.balanceTableHtml({ cuentas: [], totalDebe: 100, totalHaber: 90, cuadrado: false });
  expect(no.toLowerCase()).toContain('descuadr');
});

test('mayorTableHtml y flujoTableHtml renderizan filas', () => {
  expect(lib.mayorTableHtml([{ codigo: '1.1.10.2', nombre: 'Banco', debe: 0, haber: 11900, saldo: -11900 }])).toContain('Banco');
  const f = lib.flujoTableHtml({ entradas: 0, salidas: 11900, neto: -11900, movimientos: [{ fecha: '2026-06-15', glosa: 'Pago', entrada: 0, salida: 11900 }] });
  expect(f).toContain('Pago');
  expect(f.toLowerCase()).toContain('neto');
});

test('los helpers escapan HTML (anti-XSS)', () => {
  const html = lib.mayorTableHtml([{ codigo: 'x', nombre: '<script>alert(1)</script>', debe: 0, haber: 0, saldo: 0 }]);
  expect(html).not.toContain('<script>alert(1)</script>');
});

const fs = require('fs');
const path = require('path');
test('index.html declara la pestaña Contabilidad y el contenedor', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../public/panel/index.html'), 'utf8');
  expect(html).toContain('data-tab="contabilidad"');
  expect(html).toContain('id="cContenido"');
});
