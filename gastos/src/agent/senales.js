// Señales proactivas (M5): a partir del contexto (resumen + memorias) arma
// frases cortas y priorizadas que KALY puede mencionar al saludar. Función pura.
function tieneTema(memorias, re) {
  return (Array.isArray(memorias) ? memorias : []).some((m) => m && re.test(String(m.contenido || '')));
}

function construirSenales(context = {}) {
  const resumen = context.resumen || {};
  const memorias = Array.isArray(context.memorias) ? context.memorias : [];
  const out = [];

  // 1) Plata (prioridad alta)
  if (Number(resumen.saldo) < 0) {
    out.push('este mes vas con saldo negativo (gastaste más de lo que ingresó)');
  }
  if (Number(resumen.pendientesPago) > 0) {
    const n = Number(resumen.pendientesPago);
    out.push(`tienes ${n} gasto${n === 1 ? '' : 's'} confirmado${n === 1 ? '' : 's'} sin marcar como pagado${n === 1 ? '' : 's'}`);
  }
  if (Number(resumen.countGastos || 0) === 0 && Number(resumen.countIngresos || 0) === 0) {
    out.push('este mes aún no registras movimientos');
  }

  // 2) Huecos de memoria
  if (memorias.length === 0) {
    out.push('todavía sé poco de tu negocio, cuéntame algo para ayudarte mejor');
  } else {
    if (!tieneTema(memorias, /horari|abre|cierra|atiend|lunes|s[áa]bado|domingo/i)) out.push('no me has contado tu horario de atención');
    if (!tieneTema(memorias, /direcci|ubica|queda en|local en|calle|avenida/i)) out.push('no sé bien dónde queda tu negocio');
    if (!tieneTema(memorias, /pago|transfer|efectivo|tarjeta|débito|crédito/i)) out.push('no sé qué formas de pago aceptas');
  }

  return out;
}

module.exports = { construirSenales };
