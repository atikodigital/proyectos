// gastos/tests/panel/conciliacion-lib.test.js
const lib = require('../../public/panel/lib');
const fs = require('fs');
const path = require('path');

test('conciliacionHtml con null muestra mensaje vacío', () => {
  const html = lib.conciliacionHtml(null);
  expect(html).toContain('Sin conciliación');
});

test('conciliacionHtml rinde saldos SCA/SBA y partidas (XSS-safe)', () => {
  const inf = {
    cuadrado: true,
    sca: 88100,
    sba: 88100,
    saldoFinalCartola: 88100,
    bancoContable: 90000,
    partidas: [
      { tipo: '<script>xss</script>', monto: 1900 },
    ],
  };
  const html = lib.conciliacionHtml(inf);
  expect(html).toContain('88');
  expect(html).not.toContain('<script>xss</script>');
  expect(html).toContain('1.900');
});

test('conciliacionHtml se exporta en PanelLib', () => {
  expect(typeof lib.conciliacionHtml).toBe('function');
});

test('conciliacionHtml lee saldo_final_cartola/banco_contable (snake_case de la DB)', () => {
  const html = lib.conciliacionHtml({ sca: 88100, sba: 88100, cuadrado: true, partidas: [], saldo_final_cartola: 86200, banco_contable: 90000 });
  expect(html).toContain(lib.fmtClp(86200));
  expect(html).toContain(lib.fmtClp(90000));
});

test('index.html declara el sub-botón Conciliación', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../public/panel/index.html'), 'utf8');
  expect(html).toContain('data-libro="conciliacion"');
});
