const IVA_PCT = 0.19;

function toInt(n) {
  const v = Math.round(Number(n) || 0);
  return v > 0 ? v : 0;
}

// Reconcilia neto/iva/total en CLP entero. neto manda sobre iva cuando ambos + total existen.
// `exento`: documento sin IVA (factura/boleta exenta) → IVA = 0, total = neto, sin inventar 19%.
function computeTotals({ neto, iva, total, exento = false } = {}) {
  let n = toInt(neto);
  let t = toInt(total);

  if (exento) {
    const base = t > 0 ? t : n;
    return { neto: base, iva: 0, total: base };
  }

  if (n > 0 && t > 0) {
    return { neto: n, iva: Math.max(0, t - n), total: t };
  }
  if (t > 0) {
    n = Math.round(t / (1 + IVA_PCT));
    return { neto: n, iva: t - n, total: t };
  }
  if (n > 0) {
    const i = Math.round(n * IVA_PCT);
    return { neto: n, iva: i, total: n + i };
  }
  const i = toInt(iva);
  if (i > 0) {
    return { neto: 0, iva: i, total: i };
  }
  return { neto: 0, iva: 0, total: 0 };
}

module.exports = { computeTotals, IVA_PCT };
