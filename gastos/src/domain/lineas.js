// gastos/src/domain/lineas.js
// Normaliza las líneas crudas que devuelve el OCR. PURO (sin DB).
function _int(n) { const v = Math.round(Number(n) || 0); return v > 0 ? v : 0; }
function _num(n) { const v = Number(n); return Number.isFinite(v) && v > 0 ? v : 0; }

// Unidades reconocidas (canónicas). Lo demás cae a 'un'.
const UNIDADES = ['kg', 'g', 'l', 'ml', 'kwh', 'm3', 'm2', 'un', 'hora', 'fijo'];
function _unidad(u) {
  const s = String(u || '').trim().toLowerCase().replace(/\./g, '');
  if (s === 'm³') return 'm3';
  if (s === 'm²') return 'm2';
  if (s === 'lt' || s === 'lts' || s === 'litro' || s === 'litros') return 'l';
  if (s === 'kgs' || s === 'kilo' || s === 'kilos') return 'kg';
  if (s === 'kw' || s === 'kw/h' || s === 'kwh') return 'kwh';
  if (UNIDADES.includes(s)) return s;
  return 'un';
}

function normalizeLineas(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const l of raw) {
    if (!l || typeof l !== 'object') continue;
    const descripcion = String(l.descripcion || l.detalle || l.glosa || '').trim().slice(0, 200);
    const neto = _int(l.neto);
    const total = _int(l.total) || (neto + _int(l.iva));
    if (!descripcion && total <= 0) continue;
    out.push({
      descripcion,
      cantidad: _num(l.cantidad != null ? l.cantidad : 1) || 1,
      unidad: _unidad(l.unidad),
      neto,
      iva: _int(l.iva),
      total,
    });
  }
  return out;
}

module.exports = { normalizeLineas, UNIDADES };
