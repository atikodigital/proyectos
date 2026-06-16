// gastos/src/match/componer.js
// Capa IA "revisa todo": manda TODA la cartola + el libro auxiliar de banco a Gemini
// (1 llamada) con el system prompt de 5 bloques y devuelve el informe JSON.
const axios = require('axios');
const BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

function buildPrompt({ lineas = [], libroAuxiliar = [], saldoInicial = null, saldoFinalCartola = null, bancoContable = null } = {}) {
  return [
    '# BLOQUE 1 — IDENTIDAD',
    'Actúas exclusivamente como Controlador Financiero Autónomo. Función analítica y determinística. Cero conjeturas: si no hay evidencia, va a exceptions_for_review.',
    '# BLOQUE 2 — DATOS',
    'Recibes el Libro_Auxiliar_Empresa (movimientos contables de la cuenta Banco) y la Cartola_Bancaria_Externa (líneas del banco). Trabaja con montos en CLP entero y signo (+ abono / − cargo).',
    'Cartola_Bancaria_Externa: ' + JSON.stringify(lineas),
    'Libro_Auxiliar_Empresa: ' + JSON.stringify(libroAuxiliar),
    'Saldos: inicial=' + JSON.stringify(saldoInicial) + ' final_cartola=' + JSON.stringify(saldoFinalCartola) + ' banco_contable=' + JSON.stringify(bancoContable),
    '# BLOQUE 3 — ALGORITMO Y TOLERANCIAS',
    'Cruce determinístico exacto → tolerancia temporal ±3 días → tolerancia de redondeo (pocos pesos) → consolidación N:1 (un cargo = varias facturas) → identificar partidas en tránsito (cheques girados no cobrados, depósitos en tránsito) y cargos/abonos del banco no registrados (notas de débito/crédito) y errores.',
    '# BLOQUE 4 — MODELO',
    'Valida convergencia Saldo Contable Ajustado == Saldo Bancario Ajustado. Clasifica cada partida con tipo ∈ {nota_debito, nota_credito, deposito_transito, cheque_no_cobrado, error_empresa_mas, error_empresa_menos, error_banco_mas, error_banco_menos}.',
    '# BLOQUE 5 — SALIDA (responde SOLO este JSON)',
    '{ "reconciliation_status": "...", "matched_transactions": [{"linea_idx":0,"expenseId":"..."}], "reconciling_items_in_transit": [{"tipo":"deposito_transito","glosa":"...","monto":0,"fecha":"YYYY-MM-DD"}], "suggested_journal_entries": [{"descripcion":"...","tipo":"nota_debito","monto":0,"fecha":"YYYY-MM-DD","cuentaClaveDebe":"gastos_financieros","cuentaClaveHaber":"banco"}], "exceptions_for_review": [{"glosa":"...","monto":0,"motivo":"..."}] }',
  ].join('\n');
}

function parseInforme(content) {
  let obj = {};
  const s = String(content || '');
  const fenced = s.replace(/```json/gi, '```').split('```');
  for (const c of [s, ...fenced]) {
    const a = c.indexOf('{'); const b = c.lastIndexOf('}');
    if (a >= 0 && b > a) { try { obj = JSON.parse(c.slice(a, b + 1)); break; } catch { /* sigue */ } }
  }
  return {
    reconciliation_status: obj.reconciliation_status || 'desconocido',
    matched_transactions: Array.isArray(obj.matched_transactions) ? obj.matched_transactions : [],
    reconciling_items_in_transit: Array.isArray(obj.reconciling_items_in_transit) ? obj.reconciling_items_in_transit : [],
    suggested_journal_entries: Array.isArray(obj.suggested_journal_entries) ? obj.suggested_journal_entries : [],
    exceptions_for_review: Array.isArray(obj.exceptions_for_review) ? obj.exceptions_for_review : [],
  };
}

async function componerConciliacion(payload, { http = axios, apiKey = process.env.GEMINI_API_KEY, model } = {}) {
  const m = model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const body = {
    model: m,
    messages: [{ role: 'user', content: buildPrompt(payload) }],
    temperature: 0.1,
  };
  const res = await http.post(BASE, body, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 60000 });
  const content = res && res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message && res.data.choices[0].message.content || '';
  return parseInforme(content);
}

module.exports = { buildPrompt, parseInforme, componerConciliacion };
