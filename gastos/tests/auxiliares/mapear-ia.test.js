// gastos/tests/auxiliares/mapear-ia.test.js
const { buildPromptMapeo, parseMapeo, componerMapeo } = require('../../src/auxiliares/mapear');

test('buildPromptMapeo incluye líneas, catálogo y giro, y pide JSON por índice', () => {
  const p = buildPromptMapeo({
    lineas: [{ idx: 0, descripcion: 'Mantequilla sin sal 1kg' }],
    auxiliares: [{ nombre: 'Harina' }],
    giro: 'pizzería',
  });
  expect(p).toMatch(/pizzer/i);
  expect(p).toMatch(/Mantequilla/);
  expect(p).toMatch(/Harina/);
  expect(p).toMatch(/idx/);
});

test('parseMapeo tolera fences y normaliza', () => {
  const out = parseMapeo('```json\n{"mapeos":[{"idx":0,"auxiliar":"Mantequilla","existe":false,"naturaleza":"insumo","unidad":"kg"}]}\n```');
  expect(out.length).toBe(1);
  expect(out[0].auxiliar).toBe('Mantequilla');
  expect(out[0].existe).toBe(false);
});

test('componerMapeo usa el http inyectado', async () => {
  const fakeHttp = { post: async () => ({ data: { choices: [{ message: { content: '{"mapeos":[{"idx":0,"auxiliar":"Mantequilla","existe":false,"naturaleza":"insumo","unidad":"kg"}]}' } }] } }) };
  const r = await componerMapeo({ lineas: [{ idx: 0, descripcion: 'Mantequilla' }], auxiliares: [], giro: '' }, { http: fakeHttp, apiKey: 'x' });
  expect(r[0].auxiliar).toBe('Mantequilla');
});
