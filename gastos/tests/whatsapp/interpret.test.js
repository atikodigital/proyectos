const { interpretText } = require('../../src/whatsapp/interpret');

test('confirmaciones', () => {
  for (const t of ['sí', 'si', 'SI', 'ok', 'dale', 'correcto', 'confirmar']) {
    expect(interpretText(t).kind).toBe('confirm');
  }
});

test('cancelaciones', () => {
  for (const t of ['no', 'NO', 'cancelar', 'descartar']) {
    expect(interpretText(t).kind).toBe('cancel');
  }
});

test('resumen con y sin periodo', () => {
  expect(interpretText('resumen')).toEqual({ kind: 'summary', period: '' });
  expect(interpretText('resumen mes')).toEqual({ kind: 'summary', period: 'mes' });
});

test('correccion de montos a entero', () => {
  expect(interpretText('monto 30000')).toEqual({ kind: 'correction', field: 'total', value: 30000 });
  expect(interpretText('total $30.000')).toEqual({ kind: 'correction', field: 'total', value: 30000 });
  expect(interpretText('neto 21008')).toEqual({ kind: 'correction', field: 'neto', value: 21008 });
  expect(interpretText('iva 3992')).toEqual({ kind: 'correction', field: 'iva', value: 3992 });
});

test('correccion de texto', () => {
  expect(interpretText('categoria Honorarios')).toEqual({ kind: 'correction', field: 'categoria', value: 'Honorarios' });
  expect(interpretText('proveedor Lider')).toEqual({ kind: 'correction', field: 'proveedor', value: 'Lider' });
  expect(interpretText('folio 123')).toEqual({ kind: 'correction', field: 'folio', value: '123' });
});

test('desconocido', () => {
  expect(interpretText('cualquier cosa rara').kind).toBe('unknown');
});
