const PanelLib = require('../../public/panel/lib.js');

test('fmtClp formatea pesos chilenos', () => {
  expect(PanelLib.fmtClp(25000)).toBe('$25.000');
  expect(PanelLib.fmtClp(0)).toBe('$0');
  expect(PanelLib.fmtClp('1011500')).toBe('$1.011.500');
});

test('buildQuery arma solo los filtros no vacíos', () => {
  expect(PanelLib.buildQuery({ from: '2026-06-01', to: '', estado: 'confirmado', proveedor: '' }))
    .toBe('?from=2026-06-01&estado=confirmado');
  expect(PanelLib.buildQuery({})).toBe('');
  expect(PanelLib.buildQuery({ proveedor: 'a b' })).toBe('?proveedor=a%20b');
});

test('escapeHtml neutraliza tags', () => {
  expect(PanelLib.escapeHtml('<b>x</b>&"\'')).toBe('&lt;b&gt;x&lt;/b&gt;&amp;&quot;&#39;');
});

test('totalsFromRows suma neto/iva/total', () => {
  const rows = [{ neto: 100, iva: 19, total: 119 }, { neto: '200', iva: '38', total: '238' }];
  expect(PanelLib.totalsFromRows(rows)).toEqual({ neto: 300, iva: 57, total: 357 });
});

test('expensesTableHtml arma header + una fila por gasto y escapa', () => {
  const html = PanelLib.expensesTableHtml([
    { fecha: '2026-06-05', employee_id: 'e1', proveedor: '<Copec>', rut_emisor: '76086428-5', folio: '123',
      tipo_documento: 'boleta', categoria: 'Combustible y transporte', cuenta_sii_codigo: '4.3.150.1',
      neto: 21008, iva: 3992, total: 25000, estado: 'confirmado' },
  ]);
  expect(html).toContain('<table');
  expect(html).toContain('Proveedor');
  expect(html).toContain('&lt;Copec&gt;');
  expect(html).toContain('$25.000');
  expect(html).toContain('4.3.150.1');
});
