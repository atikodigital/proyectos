// gastos/tests/match/libro-sii-parse.test.js
const { parseLibroSii } = require('../../src/ocr/libro-sii');

test('parseLibroSii normaliza docs de compra y venta', () => {
  const json = JSON.stringify({ documentos: [
    { clase: 'compra', tipo_doc: 'factura', rut: '76.111.111-1', folio: '1234', fecha: '05/06/2026', neto: '10000', iva: '1900', total: '11900' },
    { clase: 'venta', tipo_doc: 'factura', rut: '77.222.222-2', folio: '88', fecha: '06/06/2026', neto: '20000', iva: '3800', total: '23800' },
  ] });
  const docs = parseLibroSii(json);
  expect(docs.length).toBe(2);
  expect(docs[0].clase).toBe('compra');
  expect(docs[0].folio).toBe('1234');
  expect(docs[0].neto).toBe(10000);
  expect(docs[0].iva).toBe(1900);
  expect(docs[1].clase).toBe('venta');
});

test('parseLibroSii descarta filas sin folio o sin monto', () => {
  const docs = parseLibroSii(JSON.stringify({ documentos: [
    { clase: 'compra', folio: '', total: '1000' },
    { clase: 'compra', folio: '9', total: '0' },
    { clase: 'compra', folio: '10', neto: '5000', iva: '950', total: '5950' },
  ] }));
  expect(docs.length).toBe(1);
  expect(docs[0].folio).toBe('10');
});
