const lib = require('../../public/panel/lib');

test('ivaResumenHtml muestra crédito/débito y IVA a pagar', () => {
  const html = lib.ivaResumenHtml({ sca: 1900, sba: 950 }); // sca=ivaPagarContable, sba=ivaPagarSii (como se persiste)
  expect(html.toLowerCase()).toContain('iva');
  expect(html).toContain(lib.fmtClp(950));
});

test('ivaResumenHtml con null', () => {
  expect(lib.ivaResumenHtml(null).toLowerCase()).toContain('sin');
});
