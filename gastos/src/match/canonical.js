// gastos/src/match/canonical.js
// Capa 1 del pipeline de conciliación: estandarización canónica + saneo anti-inyección.
const { parseFecha } = require('../domain/normalize');

const INYECCION = /(ignore|disregard|olvida|ignora)\s+(all|todas?|previous|las anteriores)|system prompt|act as|actúa como/gi;

function sanitizeGlosa(s) {
  return String(s || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(INYECCION, '[glosa]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

function signo(linea) {
  const m = Math.abs(Math.round(Number(linea && linea.monto) || 0));
  return (linea && linea.tipo === 'abono') ? m : -m;
}

function canonLinea(linea) {
  const fecha = parseFecha(linea && linea.fecha) || (/^\d{4}-\d{2}-\d{2}/.test(String(linea && linea.fecha)) ? String(linea.fecha).slice(0, 10) : null);
  return {
    fecha,
    tipo: (linea && linea.tipo) || 'cargo',
    monto: Math.abs(Math.round(Number(linea && linea.monto) || 0)),
    signo: signo(linea),
    glosa: sanitizeGlosa(linea && linea.glosa),
    n_operacion: String((linea && linea.n_operacion) || ''),
    rut: (linea && linea.rut) || '',
  };
}

module.exports = { canonLinea, sanitizeGlosa, signo };
