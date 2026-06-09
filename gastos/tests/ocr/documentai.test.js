const { mapDocAiEntities, documentAiExtract } = require('../../src/ocr/documentai');

test('mapea entidades del Expense parser', () => {
  const entities = [
    { type: 'total_amount', mentionText: '$25.000' },
    { type: 'net_amount', mentionText: '21.008' },
    { type: 'total_tax_amount', mentionText: '3.992' },
    { type: 'supplier_name', mentionText: 'Copec' },
    { type: 'receipt_date', mentionText: '12/06/2026' },
    { type: 'supplier_address', mentionText: 'Av Siempre Viva 1' },
  ];
  expect(mapDocAiEntities(entities)).toEqual({
    total: 25000, neto: 21008, iva: 3992,
    proveedor: 'Copec', fecha: '12/06/2026', direccion_emisor: 'Av Siempre Viva 1',
  });
});

test('documentAiExtract usa el cliente inyectado y devuelve campos mapeados', async () => {
  const fakeClient = {
    processorPath: () => 'proj/loc/proc',
    processDocument: async () => ([{ document: { entities: [
      { type: 'supplier_name', mentionText: 'Lider' },
      { type: 'total_amount', mentionText: '$9.990' },
    ] } }]),
  };
  const out = await documentAiExtract(Buffer.from('x'), 'image/jpeg', fakeClient);
  expect(out.proveedor).toBe('Lider');
  expect(out.total).toBe(9990);
});
