// Motor de conciliación (Match): cruza líneas de cartola/voucher con gastos/ingresos registrados.
const { normalizeRut, parseFecha } = require('../domain/normalize');

function normText(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function soloDigitos(s) { return String(s || '').replace(/\D/g, ''); }
function toDate(s) {
  const f = parseFecha(s) || (/^\d{4}-\d{2}-\d{2}/.test(String(s)) ? String(s).slice(0, 10) : null);
  if (!f) return null;
  const [y, m, d] = f.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function diasAbs(a, b) {
  const da = toDate(a); const db = toDate(b);
  if (!da || !db) return null;
  return Math.abs(Math.round((db - da) / 86400000));
}
function diasGastoAntesDelPago(gastoFecha, pagoFecha) {
  const dg = toDate(gastoFecha); const dp = toDate(pagoFecha);
  if (!dg || !dp) return null;
  return Math.round((dp - dg) / 86400000);
}

function esGasto(mov) { return (mov.tipo || 'gasto') !== 'ingreso'; }

function direccionOk(linea, mov) {
  if (linea.tipo === 'cargo') return esGasto(mov);
  if (linea.tipo === 'abono') return !esGasto(mov);
  return true;
}

function mismoProveedor(linea, gasto) {
  if (linea.rut && gasto.rut_emisor && normalizeRut(linea.rut) === normalizeRut(gasto.rut_emisor)) return true;
  const prov = normText(gasto.proveedor);
  if (prov.length >= 3 && normText(linea.glosa).includes(prov)) return true;
  return false;
}

function glosaMatch(glosa, proveedor) {
  const g = normText(glosa); const p = normText(proveedor);
  if (p.length >= 3 && g.includes(p)) return true;
  // similitud por tokens: algún token significativo del proveedor aparece en la glosa
  const ptoks = p.split(' ').filter((t) => t.length >= 4);
  return ptoks.some((t) => g.includes(t));
}

function scoreMatch(linea, gasto, opts = {}) {
  if (!direccionOk(linea, gasto)) return { score: 0, razones: [] };
  const tolR = opts.toleranciaRedondeo != null ? opts.toleranciaRedondeo : 0;
  let score = 0; const razones = [];
  const op1 = soloDigitos(linea.n_operacion); const op2 = soloDigitos(gasto.nro_operacion);
  if (op1 && op2 && op1 === op2) { score += 100; razones.push('n_operacion'); }
  const dm = Math.abs(Number(linea.monto) - Number(gasto.total));
  if (Number(linea.monto) > 0 && dm <= tolR) { score += 40; razones.push('monto'); }
  const d = diasAbs(linea.fecha, gasto.fecha);
  if (d !== null && d <= 3) { score += 20; razones.push('fecha'); }
  if (glosaMatch(linea.glosa, gasto.proveedor)) { score += 25; razones.push('glosa'); }
  if (linea.rut && gasto.rut_emisor && normalizeRut(linea.rut) === normalizeRut(gasto.rut_emisor)) { score += 25; razones.push('rut'); }
  return { score, razones };
}

function matchLine(linea, candidatos, opts = {}) {
  const umbralAuto = opts.umbralAuto != null ? opts.umbralAuto : 90;
  const umbralMin = opts.umbralSugerencia != null ? opts.umbralSugerencia : 50;
  const scored = candidatos
    .map((g) => ({ gasto: g, ...scoreMatch(linea, g, opts) }))
    .filter((s) => s.score >= umbralMin)
    .sort((a, b) => b.score - a.score);
  const best = scored[0] || null;
  const unico = best && (!scored[1] || scored[1].score < best.score);
  if (best && best.score >= umbralAuto && unico) {
    return { auto: best.gasto, score: best.score, sugerencias: scored.slice(1).map((s) => s.gasto) };
  }
  return { auto: null, sugerencias: scored.map((s) => s.gasto) };
}

function subsetsThatSum(items, objetivo, tol, maxK) {
  const res = [];
  const n = items.length;
  function dfs(start, chosen, suma) {
    if (suma - objetivo > tol) return; // sobrepasó (montos positivos) → podar
    if (chosen.length > 0 && Math.abs(suma - objetivo) <= tol) res.push(chosen.slice());
    if (chosen.length >= maxK || res.length > 50) return;
    for (let i = start; i < n; i++) {
      chosen.push(items[i]);
      dfs(i + 1, chosen, suma + Number(items[i].total));
      chosen.pop();
    }
  }
  dfs(0, [], 0);
  return res;
}

function matchBulkPayment(linea, candidatos, opts = {}) {
  const tolPct = opts.toleranciaPct != null ? opts.toleranciaPct : 0;
  const tolAbs = opts.toleranciaAbs != null ? opts.toleranciaAbs : 0;
  const ventanaDias = opts.ventanaDias != null ? opts.ventanaDias : 90;
  const maxFacturas = opts.maxFacturas != null ? opts.maxFacturas : 8;
  const objetivo = Number(linea.monto) || 0;
  const tol = Math.max(tolAbs, Math.round(objetivo * tolPct));

  const pendientes = candidatos.filter((g) => {
    if (!esGasto(g)) return false;
    if (g.estado_pago === 'conciliado' || g.estado_pago === 'pagado') return false;
    if (!mismoProveedor(linea, g)) return false;
    const d = diasGastoAntesDelPago(g.fecha, linea.fecha);
    if (d === null || d < 0 || d > ventanaDias) return false;
    return true;
  });
  if (pendientes.length === 0) return { grupo: null, confianza: 'ninguna' };

  const dentro = (suma) => Math.abs(suma - objetivo) <= tol;

  const sumaTodas = pendientes.reduce((a, g) => a + Number(g.total), 0);
  if (dentro(sumaTodas)) return { grupo: pendientes, confianza: 'alta', ambiguo: false, motivo: 'todas_pendientes' };

  const orden = [...pendientes].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const soluciones = subsetsThatSum(orden, objetivo, tol, maxFacturas);
  if (soluciones.length === 0) return { grupo: null, confianza: 'ninguna' };

  soluciones.sort((a, b) => a.length - b.length);
  const grupo = soluciones[0];
  const ambiguo = soluciones.length > 1;
  return { grupo, confianza: ambiguo ? 'media' : 'alta', ambiguo, alternativas: soluciones.length };
}

module.exports = { scoreMatch, matchLine, matchBulkPayment };
