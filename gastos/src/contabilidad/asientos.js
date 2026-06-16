// gastos/src/contabilidad/asientos.js
// Motor PURO: convierte un expense en un asiento de partida doble balanceado.
// No toca DB. `resolver` provee ids de cuenta: { porClave(clave), porCodigo(codigoSii) }.
function _int(n) { const v = Math.round(Number(n) || 0); return v > 0 ? v : 0; }

function _req(id, etiqueta) {
  if (!id) { const e = new Error('cuenta_no_encontrada:' + etiqueta); e.code = 'validacion'; throw e; }
  return id;
}

function linea(cuenta_id, debe, haber, glosa) {
  return { cuenta_id, debe: _int(debe), haber: _int(haber), glosa: glosa || null };
}

// Suma debe/haber. Si strict y no cuadra, lanza. Devuelve boolean.
function asientoBalanceado(asiento, { strict = false } = {}) {
  const sumD = (asiento.lineas || []).reduce((a, l) => a + _int(l.debe), 0);
  const sumH = (asiento.lineas || []).reduce((a, l) => a + _int(l.haber), 0);
  const ok = sumD === sumH && sumD > 0;
  if (!ok && strict) { const e = new Error('asiento_descuadrado'); e.code = 'descuadrado'; throw e; }
  return ok;
}

function esGasto(exp) { return String(exp.tipo || 'gasto').toLowerCase() !== 'ingreso'; }

// tipoAsiento: 'devengo' (nace al registrar) | 'pago' (al conciliar/pagar)
function asientoDeMovimiento(exp, resolver, tipoAsiento) {
  const neto = _int(exp.neto);
  const iva = _int(exp.iva);
  const total = _int(exp.total) || (neto + iva);
  const lineas = [];
  let origen;

  if (tipoAsiento === 'devengo') {
    origen = 'expense';
    if (esGasto(exp)) {
      const cGasto = _req(resolver.porCodigo(exp.cuenta_sii_codigo), 'gasto');
      lineas.push(linea(cGasto, neto > 0 ? neto : total, 0, 'Gasto'));
      if (iva > 0) lineas.push(linea(_req(resolver.porClave('iva_credito'), 'iva_credito'), iva, 0, 'IVA crédito'));
      lineas.push(linea(_req(resolver.porClave('proveedores'), 'proveedores'), 0, total, exp.proveedor || 'Proveedor'));
    } else {
      lineas.push(linea(_req(resolver.porClave('clientes'), 'clientes'), total, 0, exp.proveedor || 'Cliente'));
      lineas.push(linea(_req(resolver.porClave('ventas'), 'ventas'), 0, neto > 0 ? neto : total, 'Venta'));
      if (iva > 0) lineas.push(linea(_req(resolver.porClave('iva_debito'), 'iva_debito'), 0, iva, 'IVA débito'));
    }
  } else if (tipoAsiento === 'pago') {
    origen = 'pago';
    if (esGasto(exp)) {
      lineas.push(linea(_req(resolver.porClave('proveedores'), 'proveedores'), total, 0, 'Pago a ' + (exp.proveedor || 'proveedor')));
      lineas.push(linea(_req(resolver.porClave('banco'), 'banco'), 0, total, 'Banco'));
    } else {
      lineas.push(linea(_req(resolver.porClave('banco'), 'banco'), total, 0, 'Banco'));
      lineas.push(linea(_req(resolver.porClave('clientes'), 'clientes'), 0, total, 'Cobro de ' + (exp.proveedor || 'cliente')));
    }
  } else {
    const e = new Error('tipo_asiento_desconocido'); e.code = 'validacion'; throw e;
  }

  const asiento = {
    origen,
    origen_ref: exp.id,
    tipo_asiento: tipoAsiento,
    fecha: exp.fecha || null,
    glosa: (esGasto(exp) ? 'Gasto' : 'Venta') + (exp.proveedor ? ' · ' + exp.proveedor : ''),
    lineas,
  };
  asientoBalanceado(asiento, { strict: true });
  return asiento;
}

module.exports = { asientoDeMovimiento, asientoBalanceado };
