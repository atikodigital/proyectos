// gastos/tests/varas/gemini.test.js
const { geminiChat, buildPromptChat, parseSalida } = require('../../src/varas/gemini');
const { TOOL_DECLARATIONS } = require('../../src/varas/tools');

test('buildPromptChat incluye system, las tools y el transcript', () => {
  const p = buildPromptChat({ systemPrompt: 'Eres VARAS.', tools: TOOL_DECLARATIONS, messages: [{ role: 'user', text: '¿cuánto debo?' }] });
  expect(p).toMatch(/VARAS/);
  expect(p).toMatch(/deudas/);          // alguna tool aparece
  expect(p).toMatch(/cuánto debo/);
});

test('parseSalida detecta tool-call JSON vs texto', () => {
  expect(parseSalida('{"tool":"deudas","args":{}}')).toEqual({ tool: { name: 'deudas', args: {} } });
  expect(parseSalida('```json\n{"tool":"consumo_insumo","args":{"nombre":"harina"}}\n```').tool.name).toBe('consumo_insumo');
  expect(parseSalida('Tu balance cuadra.')).toEqual({ text: 'Tu balance cuadra.' });
});

test('geminiChat usa el http inyectado y devuelve {tool} o {text}', async () => {
  const httpTool = { post: async () => ({ data: { choices: [{ message: { content: '{"tool":"balance","args":{}}' } }] } }) };
  const r1 = await geminiChat({ systemPrompt: 'x', tools: TOOL_DECLARATIONS, messages: [{ role: 'user', text: 'balance?' }] }, { http: httpTool, apiKey: 'k' });
  expect(r1.tool.name).toBe('balance');
  const httpText = { post: async () => ({ data: { choices: [{ message: { content: 'Hola' } }] } }) };
  const r2 = await geminiChat({ systemPrompt: 'x', tools: [], messages: [] }, { http: httpText, apiKey: 'k' });
  expect(r2.text).toBe('Hola');
});
