jest.mock('../src/ocr/preprocess', () => ({ preprocessForOcr: async (b) => b }));
jest.mock('../src/ocr/documentai', () => ({ documentAiExtract: async () => ({}) }));
jest.mock('../src/ocr/gemini', () => ({ geminiExtract: jest.fn() }));

const { geminiExtract } = require('../src/ocr/gemini');
const { extractExpense } = require('../src/ocr/extract');

test('ingreso: tipo ingreso + nro_operacion + categoría Ingreso', async () => {
  geminiExtract.mockResolvedValue({
    tipo: 'ingreso', nro_operacion: 'OP-555', proveedor: 'Juan Pérez',
    fecha: '01/06/2026', total: 50000,
  });
  const r = await extractExpense({ imageBuffer: Buffer.from('x') });
  expect(r.tipo).toBe('ingreso');
  expect(r.nro_operacion).toBe('OP-555');
  expect(r.categoria).toBe('Ingreso');
  expect(r.cuenta_sii_codigo).toBe('');
});

test('gasto: tipo gasto por defecto y categoría SII', async () => {
  geminiExtract.mockResolvedValue({
    tipo: 'gasto', proveedor: 'Sodimac', fecha: '02/06/2026', total: 12000,
    categoria: 'Materiales y suministros',
  });
  const r = await extractExpense({ imageBuffer: Buffer.from('x') });
  expect(r.tipo).toBe('gasto');
  expect(r.nro_operacion).toBe('');
});

test('tipo desconocido → gasto', async () => {
  geminiExtract.mockResolvedValue({ proveedor: 'X', total: 1000 });
  const r = await extractExpense({ imageBuffer: Buffer.from('x') });
  expect(r.tipo).toBe('gasto');
});
