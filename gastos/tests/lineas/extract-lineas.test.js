// gastos/tests/lineas/extract-lineas.test.js
// Adapatación: extractExpense NO acepta un parámetro 'gemini' inyectable;
// llama internamente a geminiExtract (módulo). Inyectamos el fake con jest.mock.

jest.mock('../../src/ocr/gemini', () => ({
  geminiExtract: jest.fn().mockResolvedValue({
    tipo: 'gasto', tipo_documento: 'factura', proveedor: 'Distribuidora', fecha: '10/06/2026',
    neto: 15000, iva: 2850, total: 17850, categoria: 'Mercadería e insumos del giro', glosa: 'compra',
    lineas: [
      { descripcion: 'Harina 25kg', cantidad: 2, unidad: 'kg', neto: 10000, total: 11900 },
      { descripcion: 'Levadura', cantidad: 1, unidad: 'un', neto: 5000, total: 5950 },
    ],
  }),
  parseJsonLoose: (t) => JSON.parse(t),
}));

// documentAiExtract puede fallar en test (sin credenciales) — se captura con .catch(() => ({}))
jest.mock('../../src/ocr/documentai', () => ({
  documentAiExtract: jest.fn().mockRejectedValue(new Error('no docai in test')),
}));

// preprocessForOcr: devolver el buffer sin cambios
jest.mock('../../src/ocr/preprocess', () => ({
  preprocessForOcr: jest.fn().mockImplementation((buf) => Promise.resolve(buf)),
}));

const { extractExpense } = require('../../src/ocr/extract');

test('extractExpense incluye lineas normalizadas desde el OCR', async () => {
  const r = await extractExpense({ imageBuffer: Buffer.from('x'), mimeType: 'image/jpeg' });
  expect(Array.isArray(r.lineas)).toBe(true);
  expect(r.lineas.length).toBe(2);
  expect(r.lineas[0].descripcion).toBe('Harina 25kg');
  expect(r.lineas[0].cantidad).toBe(2);
  expect(r.lineas[0].unidad).toBe('kg');
});
