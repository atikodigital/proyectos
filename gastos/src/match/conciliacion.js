// gastos/src/match/conciliacion.js
// Orquestador del informe de conciliación bancaria (F2).
const crypto = require('crypto');
const { canonLinea } = require('./canonical');
const { conciliarCartola } = require('./service');
const { calcularSaldos } = require('./saldos');
const { componerConciliacion } = require('./componer');

const TIPOS_PARTIDA = ['nota_debito', 'nota_credito', 'deposito_transito', 'cheque_no_cobrado', 'error_empresa_mas', 'error_empresa_menos', 'error_banco_mas', 'error_banco_menos'];

function _id() { return crypto.randomUUID().slice(0, 8); }

async function construirInforme({ cartola, libroAuxiliar = [], bancoContable = 0 }, { componer } = {}) {
  const lineas = (cartola && cartola.lineas ? cartola.lineas : []).map(canonLinea);
  const saldoFinalCartola = (cartola && cartola.saldoFinal != null) ? cartola.saldoFinal : 0;
  const saldoInicial = (cartola && cartola.saldoInicial != null) ? cartola.saldoInicial : null;

  // Conjunto de ids válidos del libro auxiliar de esta empresa
  const auxIds = new Set((libroAuxiliar || []).map((e) => String(e.id)));

  // Normalizador: forma uniforme {expenseId, score, lineaIdx} y filtra ids ajenos
  function _normMatched(arr) {
    return (arr || [])
      .map((m) => ({ expenseId: String(m.expenseId || ''), score: m.score != null ? m.score : 100, lineaIdx: m.linea_idx != null ? m.linea_idx : null }))
      .filter((m) => auxIds.has(m.expenseId));
  }

  // Capa determinística (pre-proceso / red de seguridad)
  const det = conciliarCartola(lineas, libroAuxiliar);
  const matchedDet = (det.conciliadas || []).map((c) => ({ expenseId: String(c.gasto.id), score: 100, linea_idx: null }));

  const _componer = componer || ((payload) => componerConciliacion(payload, {}));
  let fuente = 'ia';
  let ia;
  try {
    ia = await _componer({ lineas, libroAuxiliar, saldoInicial, saldoFinalCartola, bancoContable });
  } catch (e) {
    fuente = 'deterministico';
    ia = { matched_transactions: matchedDet, reconciling_items_in_transit: [], suggested_journal_entries: [], exceptions_for_review: [] };
  }

  const partidas = []
    .concat((ia.reconciling_items_in_transit || []).map((p) => ({ tipo: p.tipo, glosa: p.glosa, monto: Math.round(Number(p.monto) || 0), fecha: p.fecha || null })))
    .concat((ia.suggested_journal_entries || []).filter((s) => TIPOS_PARTIDA.includes(s.tipo)).map((s) => ({ tipo: s.tipo, glosa: s.descripcion, monto: Math.round(Number(s.monto) || 0), fecha: s.fecha || null })));

  const suggested = (ia.suggested_journal_entries || []).map((s) => ({
    id: _id(),
    descripcion: s.descripcion || 'Asiento sugerido',
    tipo: s.tipo || null,
    monto: Math.round(Number(s.monto) || 0),
    fecha: s.fecha || null,
    cuentaClaveDebe: s.cuentaClaveDebe || null,
    cuentaClaveHaber: s.cuentaClaveHaber || null,
  }));

  const { sca, sba, cuadrado, brecha } = calcularSaldos({ bancoContable, saldoFinalCartola, partidas });

  return {
    saldoInicial, saldoFinalCartola, bancoContable,
    sca, sba, cuadrado, brecha,
    matched: _normMatched((ia.matched_transactions && ia.matched_transactions.length) ? ia.matched_transactions : matchedDet),
    partidas,
    suggested,
    exceptions: ia.exceptions_for_review || [],
    fuente,
  };
}

module.exports = { construirInforme, TIPOS_PARTIDA };
