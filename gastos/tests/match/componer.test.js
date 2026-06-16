// gastos/tests/match/componer.test.js
const { buildPrompt, parseInforme, componerConciliacion } = require('../../src/match/componer');

test('buildPrompt incluye los 5 bloques y la salida JSON estricta', () => {
  const p = buildPrompt({ lineas: [{ fecha: '2026-06-10', glosa: 'COMISION', signo: -1900 }], libroAuxiliar: [], saldoFinalCartola: 88100 });
  expect(p).toMatch(/Controlador Financiero/i);
  expect(p).toMatch(/reconciling_items_in_transit/);
  expect(p).toMatch(/suggested_journal_entries/);
  expect(p).toMatch(/exceptions_for_review/);
});

test('parseInforme tolera fences y campos faltantes', () => {
  const out = parseInforme('```json\n{"reconciliation_status":"ok","matched_transactions":[],"reconciling_items_in_transit":[],"suggested_journal_entries":[{"descripcion":"Comisión","monto":1900}],"exceptions_for_review":[]}\n```');
  expect(out.suggested_journal_entries.length).toBe(1);
  expect(out.matched_transactions).toEqual([]);
});

test('componerConciliacion usa el http inyectado y devuelve el informe parseado', async () => {
  const fakeHttp = { post: async () => ({ data: { choices: [{ message: { content: '{"reconciliation_status":"cuadrado","matched_transactions":[],"reconciling_items_in_transit":[],"suggested_journal_entries":[],"exceptions_for_review":[]}' } }] } }) };
  const r = await componerConciliacion({ lineas: [], libroAuxiliar: [], saldoFinalCartola: 0 }, { http: fakeHttp, apiKey: 'x' });
  expect(r.reconciliation_status).toBe('cuadrado');
});
