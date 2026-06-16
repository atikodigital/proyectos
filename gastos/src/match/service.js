// M4 — Orquesta la conciliación: toma las líneas de la cartola y los gastos/ingresos
// del usuario, y los agrupa en conciliadas / sugeridas / pagos masivos / sin match.
const { matchLine, matchBulkPayment } = require('./engine');

function conciliarCartola(lineas, expenses, opts = {}) {
  const conciliadas = []; const sugeridas = []; const pagosMasivos = []; const sinMatch = [];
  const usados = new Set();
  for (const linea of (lineas || [])) {
    const disponibles = (expenses || []).filter((e) => !usados.has(e.id));

    const m = matchLine(linea, disponibles, opts);
    if (m.auto) { usados.add(m.auto.id); conciliadas.push({ linea, gasto: m.auto }); continue; }

    const bulk = matchBulkPayment(linea, disponibles, opts);
    if (bulk.grupo && bulk.grupo.length > 1) {
      bulk.grupo.forEach((g) => usados.add(g.id));
      pagosMasivos.push({ linea, grupo: bulk.grupo, confianza: bulk.confianza, ambiguo: !!bulk.ambiguo });
      continue;
    }

    if (m.sugerencias && m.sugerencias.length) { sugeridas.push({ linea, candidatos: m.sugerencias }); continue; }
    sinMatch.push(linea);
  }
  return { conciliadas, sugeridas, pagosMasivos, sinMatch };
}

module.exports = { conciliarCartola };
