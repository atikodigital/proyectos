jest.mock('../../src/ocr/documentai');
jest.mock('../../src/ocr/gemini');
jest.mock('../../src/ocr/preprocess');

const { documentAiExtract } = require('../../src/ocr/documentai');
const { geminiExtract } = require('../../src/ocr/gemini');
const { preprocessForOcr } = require('../../src/ocr/preprocess');
const { extractExpense } = require('../../src/ocr/extract');

beforeEach(() => {
  preprocessForOcr.mockResolvedValue(Buffer.from('img'));
});

test('mezcla DocAI (montos/fecha) + Gemini (campos CL) y mapea SII', async () => {
  documentAiExtract.mockResolvedValue({ total: 25000, proveedor: 'Copec', fecha: '12/06/2026' });
  geminiExtract.mockResolvedValue({
    tipo_documento: 'boleta', rut_emisor: '76.086.428-5', folio: '123',
    direccion_emisor: 'Av 1', categoria: 'Combustible y transporte', glosa: 'bencina',
    proveedor: 'COPEC SA',
  });

  const r = await extractExpense({ imageBuffer: Buffer.from('x'), mimeType: 'image/jpeg' });

  expect(r.proveedor).toBe('Copec');           // DocAI manda en proveedor cuando existe
  expect(r.fecha).toBe('2026-06-12');          // normalizada a ISO
  expect(r.rut_emisor).toBe('76086428-5');     // normalizado
  expect(r.folio).toBe('123');
  expect(r.tipo_documento).toBe('boleta');
  expect(r.categoria).toBe('Combustible y transporte');
  expect(r.cuenta_sii_codigo).toBe('4.3.150.1');
  expect(r).toMatchObject({ neto: 21008, iva: 3992, total: 25000 });
  expect(r.confianza).toBeGreaterThan(0);
});

test('categoría inválida del modelo cae en Otros gastos', async () => {
  documentAiExtract.mockResolvedValue({ total: 1000 });
  geminiExtract.mockResolvedValue({ categoria: 'inventada' });
  const r = await extractExpense({ imageBuffer: Buffer.from('x') });
  expect(r.categoria).toBe('Otros gastos');
  expect(r.cuenta_sii_codigo).toBe('4.3.150.1');
});

test('nota de crédito invierte el signo (resta en la contabilidad)', async () => {
  documentAiExtract.mockResolvedValue({ neto: 80000, total: 95200 });
  geminiExtract.mockResolvedValue({ tipo_documento: 'nota de crédito', rut_emisor: '90.876.000-K', proveedor: 'Soprole' });
  const r = await extractExpense({ imageBuffer: Buffer.from('x') });
  expect(r.es_nota_credito).toBe(true);
  expect(r.neto).toBe(-80000);
  expect(r.total).toBe(-95200);
});

test('marca rut_valido=false cuando el DV no cuadra', async () => {
  documentAiExtract.mockResolvedValue({ total: 10000 });
  geminiExtract.mockResolvedValue({ tipo_documento: 'factura', rut_emisor: '78.901.234-5' }); // DV correcto es 2
  const r = await extractExpense({ imageBuffer: Buffer.from('x') });
  expect(r.rut_valido).toBe(false);
});

test('factura exenta no inventa IVA', async () => {
  documentAiExtract.mockResolvedValue({ total: 300000 });
  geminiExtract.mockResolvedValue({ tipo_documento: 'factura exenta', rut_emisor: '76.086.428-5' });
  const r = await extractExpense({ imageBuffer: Buffer.from('x') });
  expect(r.exento).toBe(true);
  expect(r.iva).toBe(0);
  expect(r.total).toBe(300000);
});
