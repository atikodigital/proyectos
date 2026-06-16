// Espejo (vista previa) de la lógica de precio/descr del backend. El servidor es autoritativo al generar.
function _int(v) { const n = Math.round(Number(v) || 0); return Number.isFinite(n) ? n : 0; }

export function linePrice(product, sel = {}) {
  let total = Math.max(0, _int(product && product.precio_base));
  const op = (sel && sel.opciones) || {};
  for (const g of (product && product.variantes ? product.variantes : [])) {
    const o = (g.opciones || []).find((x) => x.id === op[g.id]);
    if (o) total += _int(o.delta);
  }
  const ex = new Set(Array.isArray(sel && sel.extras) ? sel.extras : []);
  for (const e of (product && product.extras ? product.extras : [])) {
    if (ex.has(e.id)) total += Math.max(0, _int(e.precio));
  }
  return total;
}

export function lineLabel(product, sel = {}) {
  const nombre = String((product && product.nombre) || 'Producto').trim();
  const op = (sel && sel.opciones) || {};
  const partes = [];
  for (const g of (product && product.variantes ? product.variantes : [])) {
    const o = (g.opciones || []).find((x) => x.id === op[g.id]);
    if (o) partes.push(o.nombre);
  }
  const ex = new Set(Array.isArray(sel && sel.extras) ? sel.extras : []);
  const extras = (product && product.extras ? product.extras : []).filter((e) => ex.has(e.id)).map((e) => e.nombre);
  let txt = nombre;
  if (partes.length) txt += ' (' + partes.join(', ') + ')';
  if (extras.length) txt += ' + ' + extras.join(', ');
  return txt;
}

export function cartTotal(lineas, cfg = {}) {
  const sub = (lineas || []).reduce((s, l) => s + linePrice(l.product, l.sel) * Math.max(1, _int(l.cantidad) || 1), 0);
  return cfg.iva_incluido === false ? sub + Math.round(sub * 0.19) : sub;
}

function _normC(s) { return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/g, 'n'); }
export function costoEnvioLocal(delivery, comuna, subtotal) {
  const cfg = delivery || {};
  const zonas = Array.isArray(cfg.zonas) ? cfg.zonas : [];
  const target = _normC(comuna);
  const zona = zonas.find((z) => (z.comunas || []).some((c) => _normC(c) === target));
  if (!zona) return { ok: false };
  if (cfg.gratis_desde != null && Number(subtotal) >= Number(cfg.gratis_desde)) return { ok: true, costo: 0, gratis: true, zona };
  return { ok: true, costo: Math.max(0, Math.round(Number(zona.costo) || 0)), gratis: false, zona };
}
