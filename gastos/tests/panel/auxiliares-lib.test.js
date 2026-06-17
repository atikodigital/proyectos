const lib = require('../../public/panel/lib');

test('auxiliaresTableHtml lista nombre/naturaleza/unidad y escapa XSS', () => {
  const html = lib.auxiliaresTableHtml([
    { id: 'a1', nombre: 'Harina', naturaleza: 'insumo', unidad_principal: 'kg', estado: 'confirmado' },
    { id: 'a2', nombre: '<script>x</script>', naturaleza: 'insumo', unidad_principal: 'un', estado: 'sugerido' },
  ]);
  expect(html).toContain('Harina');
  expect(html).toContain('kg');
  expect(html).not.toContain('<script>x</script>');
});

test('auxiliaresTableHtml vacío', () => {
  expect(lib.auxiliaresTableHtml([]).toLowerCase()).toContain('sin auxiliares');
});

const fs = require('fs'); const path = require('path');
test('index.html declara la pestaña Auxiliares', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../public/panel/index.html'), 'utf8');
  expect(html).toContain('data-tab="auxiliares"');
});
