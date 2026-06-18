(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PanelLib = api;
})(typeof window !== 'undefined' ? window : null, function () {
  function fmtClp(n) {
    return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildQuery(filtros) {
    const f = filtros || {};
    const parts = [];
    for (const k of Object.keys(f)) {
      const v = f[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
      }
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function totalsFromRows(rows) {
    const acc = { neto: 0, iva: 0, total: 0 };
    for (const r of rows || []) {
      acc.neto += Number(r.neto) || 0;
      acc.iva += Number(r.iva) || 0;
      acc.total += Number(r.total) || 0;
    }
    return acc;
  }

  const COLS = [
    ['Tipo', 'tipo'], ['Fecha', 'fecha'], ['Empleado', 'empleado_nombre'], ['Proveedor', 'proveedor'],
    ['RUT', 'rut_emisor'], ['Folio', 'folio'], ['N° oper.', 'nro_operacion'], ['Categoría', 'categoria'],
  ];
  const MONEY = [['Neto', 'neto'], ['IVA', 'iva'], ['Total', 'total']];

  function cashflowFromRows(rows) {
    const acc = { gastos: 0, ingresos: 0, saldo: 0, countGastos: 0, countIngresos: 0 };
    for (const r of rows || []) {
      const total = Number(r.total) || 0;
      if (r.tipo === 'ingreso') { acc.ingresos += total; acc.countIngresos += 1; }
      else { acc.gastos += total; acc.countGastos += 1; }
    }
    acc.saldo = acc.ingresos - acc.gastos;
    return acc;
  }

  function pagoCell(r) {
    if (r.tipo === 'ingreso') return '—';
    if (r.estado_pago === 'pagada') return '✅ Pagada';
    return '<button class="btn-ghost btn-pay" data-pay="' + escapeHtml(r.id) + '">Marcar pagada</button>';
  }

  function expensesTableHtml(rows) {
    const list = rows || [];
    const thead = '<thead><tr>'
      + COLS.map(function (c) { return '<th>' + c[0] + '</th>'; }).join('')
      + MONEY.map(function (c) { return '<th class="num">' + c[0] + '</th>'; }).join('')
      + '<th>Estado</th><th>Pago</th></tr></thead>';
    const body = list.map(function (r) {
      const cells = COLS.map(function (c) { return '<td>' + escapeHtml(r[c[1]]) + '</td>'; }).join('')
        + MONEY.map(function (c) { return '<td class="num">' + fmtClp(r[c[1]]) + '</td>'; }).join('')
        + '<td>' + escapeHtml(r.estado) + '</td>'
        + '<td>' + pagoCell(r) + '</td>';
      return '<tr class="exp-row" data-id="' + escapeHtml(r.id) + '">' + cells + '</tr>';
    }).join('');
    const t = totalsFromRows(list);
    const foot = '<tfoot><tr><td colspan="8" class="num"><b>Totales</b></td>'
      + '<td class="num"><b>' + fmtClp(t.neto) + '</b></td>'
      + '<td class="num"><b>' + fmtClp(t.iva) + '</b></td>'
      + '<td class="num"><b>' + fmtClp(t.total) + '</b></td><td></td><td></td></tr></tfoot>';
    return '<table class="exp">' + thead + '<tbody>' + body + '</tbody>' + foot + '</table>';
  }

  function carCard(r) {
    var esIngreso = r.tipo === 'ingreso';
    return '<div class="movcard" data-id="' + escapeHtml(r.id) + '">'
      + '<div class="movtipo" style="color:' + (esIngreso ? '#7CFC9B' : '#ff8a8a') + '">' + (esIngreso ? 'INGRESO' : 'GASTO') + '</div>'
      + '<div class="movprov">' + escapeHtml(r.proveedor || (esIngreso ? 'Sin pagador' : 'Sin proveedor')) + '</div>'
      + '<div class="movtotal">' + (esIngreso ? '+' : '−') + fmtClp(r.total) + '</div>'
      + '<div class="movmeta">' + escapeHtml(r.fecha || 's/fecha') + ' · ' + escapeHtml(esIngreso ? 'Ingreso' : (r.categoria || 'Otros gastos')) + '</div>'
      + '<div class="movmeta">' + escapeHtml(r.estado || '') + (r.estado_pago ? ' · ' + escapeHtml(r.estado_pago) : '') + '</div>'
      + '<div class="movpago">' + pagoCell(r) + '</div>'
      + '</div>';
  }

  function expensesCarouselHtml(rows) {
    var list = rows || [];
    if (!list.length) return '<p class="muted" style="padding:16px">Sin movimientos para esos filtros.</p>';
    return '<div class="carousel">' + list.map(carCard).join('') + '</div>';
  }

  function detalleRows(e) {
    var esIngreso = e.tipo === 'ingreso';
    return [
      ['Tipo', esIngreso ? 'Ingreso' : 'Gasto'],
      [esIngreso ? 'Pagador / origen' : 'Proveedor', e.proveedor],
      ['Total', fmtClp(e.total)],
      ['Neto', e.neto ? fmtClp(e.neto) : ''],
      ['IVA', e.iva ? fmtClp(e.iva) : ''],
      ['RUT', e.rut_emisor],
      ['Folio (N° doc)', e.folio],
      ['N° operación (voucher)', e.nro_operacion],
      ['Documento', e.tipo_documento],
      ['Categoría', esIngreso ? '' : e.categoria],
      ['Cuenta SII', e.cuenta_sii_codigo ? (e.cuenta_sii_codigo + ' ' + (e.cuenta_sii_nombre || '')) : ''],
      ['Fecha emisión', e.fecha],
      ['Fecha de carga', e.created_at ? String(e.created_at).slice(0, 10) : ''],
      ['Empleado', e.empleado_nombre],
      ['Dirección', e.direccion_emisor],
      ['Glosa', e.glosa],
      ['Enviado por (WhatsApp)', [e.wa_sender_name, e.wa_sender_phone].filter(Boolean).join(' · ')],
      ['Canal', e.canal],
      ['Estado', e.estado],
      ['Estado de pago', e.estado_pago],
    ].filter(function (f) { return f[1] !== undefined && f[1] !== null && String(f[1]).trim() !== ''; });
  }

  function detalleHtml(e) {
    return detalleRows(e || {}).map(function (f) {
      return '<div class="detrow"><span class="detk">' + escapeHtml(f[0]) + '</span><span class="detv">' + escapeHtml(f[1]) + '</span></div>';
    }).join('');
  }

  function cuadreManual(lineas) {
    var sumD = 0, sumH = 0;
    (lineas || []).forEach(function (l) { sumD += Math.round(Number(l.debe) || 0); sumH += Math.round(Number(l.haber) || 0); });
    return { sumD: sumD, sumH: sumH, cuadrado: sumD > 0 && sumD === sumH };
  }

  function diarioTableHtml(asientos) {
    const rows = (asientos || []).map(function (a) {
      return (a.lineas || []).map(function (l, i) {
        return '<tr>'
          + '<td>' + (i === 0 ? escapeHtml(a.fecha) : '') + '</td>'
          + '<td>' + (i === 0 ? escapeHtml(a.glosa) : '') + (i === 0 && a.id ? ' <button class="btn-ghost aux-del" data-anular="' + escapeHtml(a.id) + '">Anular</button>' : '') + '</td>'
          + '<td>' + escapeHtml(l.cuenta_nombre || l.codigo) + '</td>'
          + '<td class="num">' + (Number(l.debe) ? fmtClp(l.debe) : '') + '</td>'
          + '<td class="num">' + (Number(l.haber) ? fmtClp(l.haber) : '') + '</td>'
          + '</tr>';
      }).join('');
    }).join('');
    return '<table class="tbl"><thead><tr><th>Fecha</th><th>Glosa</th><th>Cuenta</th><th class="num">Debe</th><th class="num">Haber</th></tr></thead><tbody>'
      + (rows || '<tr><td colspan="5">Sin asientos en el período.</td></tr>') + '</tbody></table>';
  }

  function mayorTableHtml(cuentas) {
    const rows = (cuentas || []).map(function (c) {
      return '<tr><td>' + escapeHtml(c.codigo) + '</td><td>' + escapeHtml(c.nombre)
        + '</td><td class="num">' + fmtClp(c.debe) + '</td><td class="num">' + fmtClp(c.haber)
        + '</td><td class="num">' + fmtClp(c.saldo) + '</td></tr>';
    }).join('');
    return '<table class="tbl"><thead><tr><th>Código</th><th>Cuenta</th><th class="num">Debe</th><th class="num">Haber</th><th class="num">Saldo</th></tr></thead><tbody>'
      + (rows || '<tr><td colspan="5">Sin movimientos.</td></tr>') + '</tbody></table>';
  }

  function balanceTableHtml(bal) {
    bal = bal || {};
    const rows = (bal.cuentas || []).map(function (c) {
      return '<tr><td>' + escapeHtml(c.codigo) + '</td><td>' + escapeHtml(c.nombre)
        + '</td><td class="num">' + fmtClp(c.deudor) + '</td><td class="num">' + fmtClp(c.acreedor) + '</td></tr>';
    }).join('');
    const badge = bal.cuadrado ? '<span class="badge-ok">✓ Cuadrado</span>' : '<span class="badge-no">⚠ Descuadrado</span>';
    return badge + '<table class="tbl"><thead><tr><th>Código</th><th>Cuenta</th><th class="num">Deudor</th><th class="num">Acreedor</th></tr></thead><tbody>'
      + (rows || '<tr><td colspan="4">Sin cuentas.</td></tr>')
      + '<tr class="tot"><td colspan="2"><b>TOTALES</b></td><td class="num"><b>' + fmtClp(bal.totalDebe) + '</b></td><td class="num"><b>' + fmtClp(bal.totalHaber) + '</b></td></tr>'
      + '</tbody></table>';
  }

  function flujoTableHtml(flujo) {
    flujo = flujo || {};
    const rows = (flujo.movimientos || []).map(function (m) {
      return '<tr><td>' + escapeHtml(m.fecha) + '</td><td>' + escapeHtml(m.glosa)
        + '</td><td class="num">' + (Number(m.entrada) ? fmtClp(m.entrada) : '') + '</td><td class="num">' + (Number(m.salida) ? fmtClp(m.salida) : '') + '</td></tr>';
    }).join('');
    return '<div class="flujo-tot">Entradas: <b>' + fmtClp(flujo.entradas) + '</b> · Salidas: <b>' + fmtClp(flujo.salidas) + '</b> · Neto: <b>' + fmtClp(flujo.neto) + '</b></div>'
      + '<table class="tbl"><thead><tr><th>Fecha</th><th>Glosa</th><th class="num">Entrada</th><th class="num">Salida</th></tr></thead><tbody>'
      + (rows || '<tr><td colspan="4">Sin movimientos de caja/banco.</td></tr>') + '</tbody></table>';
  }

  function conciliacionHtml(inf) {
    if (!inf || inf.conciliacion === null) {
      return '<p class="muted" style="padding:16px">Sin conciliación disponible. Carga una cartola bancaria para generar el workpaper.</p>';
    }
    var cuadrado = inf.cuadrado;
    var badge = cuadrado
      ? '<span class="badge-ok">✓ Cuadrado</span>'
      : '<span class="badge-no">⚠ Descuadrado</span>';
    var filas = (inf.partidas || []).map(function (p) {
      return '<tr><td>' + escapeHtml(p.tipo) + '</td><td class="num">' + fmtClp(p.monto) + '</td></tr>';
    }).join('');
    return badge
      + '<table class="tbl" style="margin-top:10px">'
      + '<thead><tr><th>Campo</th><th class="num">Monto</th></tr></thead>'
      + '<tbody>'
      + '<tr><td>Saldo cartola</td><td class="num">' + fmtClp(inf.saldoFinalCartola != null ? inf.saldoFinalCartola : inf.saldo_final_cartola) + '</td></tr>'
      + '<tr><td>Banco contable</td><td class="num">' + fmtClp(inf.bancoContable != null ? inf.bancoContable : inf.banco_contable) + '</td></tr>'
      + '<tr><td>SCA (ajustado cartola)</td><td class="num">' + fmtClp(inf.sca) + '</td></tr>'
      + '<tr><td>SBA (ajustado banco)</td><td class="num">' + fmtClp(inf.sba) + '</td></tr>'
      + '</tbody></table>'
      + (filas ? '<h4 style="margin:12px 0 6px;color:var(--gold)">Partidas de conciliación</h4>'
          + '<table class="tbl"><thead><tr><th>Tipo</th><th class="num">Monto</th></tr></thead><tbody>'
          + filas + '</tbody></table>' : '');
  }

  function ivaResumenHtml(inf) {
    if (!inf) return '<p class="muted" style="padding:8px">Sin conciliación SII todavía.</p>';
    return '<div class="flujo-tot">IVA a pagar (contable): <b>' + fmtClp(inf.sca) + '</b> · IVA a pagar (SII): <b>' + fmtClp(inf.sba) + '</b></div>';
  }

  function desdePriceLib(p) {
    var base = Math.max(0, Math.round(Number(p && p.precio_base) || 0));
    var vs = (p && p.variantes) || [];
    for (var i = 0; i < vs.length; i++) {
      var ds = ((vs[i].opciones) || []).map(function (o) { return Math.round(Number(o.delta) || 0); });
      base += ds.length ? Math.min.apply(null, ds) : 0;
    }
    return base;
  }
  function productosListHtml(products, fmt) {
    return (products || []).map(function (p) {
      var nombre = escapeHtml(p.nombre);
      var tipo = p.tipo === 'servicio'
        ? ' <span style="font-size:9px;background:#3a2f5a;color:#dccfff;padding:1px 5px;border-radius:5px;">servicio</span>' : '';
      var precio = (p.tipo === 'servicio')
        ? fmt(p.precio_base) + ' / ' + escapeHtml(p.unidad || 'unidad')
        : 'desde ' + fmt(desdePriceLib(p));
      var stock = (p.stock === null || p.stock === undefined) ? '' : ' · 📦 ' + p.stock;
      var estado = p.activo ? '●' : '○';
      return '<div class="emp" data-prod="' + escapeHtml(p.id) + '" style="cursor:pointer">'
        + '<div><b>' + nombre + '</b>' + tipo + '<br><span class="muted" style="font-size:12px">' + precio + stock + '</span></div>'
        + '<span>' + estado + '</span></div>';
    }).join('');
  }

  function auxiliaresTableHtml(auxiliares) {
    var rows = (auxiliares || []).map(function (a) {
      return '<tr data-aux="' + escapeHtml(a.id) + '" data-nombre="' + escapeHtml(a.nombre) + '">'
        + '<td>' + escapeHtml(a.nombre) + '</td>'
        + '<td>' + escapeHtml(a.naturaleza || '') + '</td>'
        + '<td>' + escapeHtml(a.unidad_principal || '') + '</td>'
        + '<td>' + escapeHtml(a.estado || '') + '</td>'
        + '<td><button class="btn-ghost aux-del" data-aux="' + escapeHtml(a.id) + '">Borrar</button></td>'
        + '</tr>';
    }).join('');
    return '<table class="tbl"><thead><tr><th>Insumo</th><th>Tipo</th><th>Unidad</th><th>Estado</th><th></th></tr></thead><tbody>'
      + (rows || '<tr><td colspan="5">Sin auxiliares. Setea el giro y pulsa "Sembrar".</td></tr>') + '</tbody></table>';
  }

  function consumoHtml(c, nombre) {
    c = c || {};
    var unidades = Object.keys(c.cantidadPorUnidad || {});
    if (!unidades.length && !(c.serie || []).length) {
      return '<p class="muted" style="padding:8px">Sin consumo registrado para ' + escapeHtml(nombre || '') + '.</p>';
    }
    var cant = unidades.map(function (u) {
      return '<b>' + escapeHtml(String(c.cantidadPorUnidad[u])) + ' ' + escapeHtml(u) + '</b>';
    }).join(' + ') || '—';
    var filas = (c.serie || []).map(function (s) {
      return '<tr><td>' + escapeHtml(s.ym) + '</td><td class="num">' + escapeHtml(String(s.cantidad)) + '</td><td class="num">' + fmtClp(s.monto) + '</td></tr>';
    }).join('');
    return '<div class="flujo-tot">' + escapeHtml(nombre || 'Insumo') + ': ' + cant + ' · total <b>' + fmtClp(c.monto) + '</b></div>'
      + '<table class="tbl"><thead><tr><th>Mes</th><th class="num">Cantidad</th><th class="num">Monto</th></tr></thead><tbody>'
      + (filas || '<tr><td colspan="3">Sin evolución.</td></tr>') + '</tbody></table>';
  }

  function varasChatHtml(mensajes, accion) {
    var oro = '#C9A24B';
    var burbujas = (mensajes || []).map(function (m) {
      var esUser = m.role === 'user';
      var cls = esUser ? 'varas-bubble-user' : 'varas-bubble-varas';
      var align = esUser ? 'flex-end' : 'flex-start';
      var bg = esUser ? 'rgba(201,162,75,0.13)' : 'rgba(255,255,255,0.06)';
      var col = esUser ? '#f0e2bf' : '#e8e8ee';
      return '<div style="display:flex;justify-content:' + align + ';margin:4px 0">'
        + '<div class="' + cls + '" style="max-width:80%;border-radius:14px;padding:8px 12px;font-size:13px;white-space:pre-wrap;background:' + bg + ';color:' + col + '">'
        + escapeHtml(m.text) + '</div></div>';
    }).join('');
    var tarjeta = '';
    if (accion) {
      tarjeta = '<div id="varasAccionCard" style="border:1px solid ' + oro + ';border-radius:14px;padding:12px;margin:8px 0;font-size:13px">'
        + '<div style="font-weight:900;color:' + oro + ';margin-bottom:8px">' + escapeHtml(accion.descripcion) + '</div>'
        + '<div style="display:flex;gap:8px">'
        + '<button id="varas-confirmar" class="btn-gold" style="font-size:12px;padding:5px 14px">Confirmar</button>'
        + '<button id="varas-cancelar" class="btn-ghost" style="font-size:12px;padding:5px 14px">Cancelar</button>'
        + '</div></div>';
    }
    return '<div id="varasMensajes" style="display:flex;flex-direction:column">' + burbujas + tarjeta + '</div>';
  }

  return { fmtClp, escapeHtml, buildQuery, totalsFromRows, cashflowFromRows, expensesTableHtml, expensesCarouselHtml, detalleRows, detalleHtml, desdePriceLib: desdePriceLib, productosListHtml: productosListHtml, cuadreManual: cuadreManual, diarioTableHtml: diarioTableHtml, mayorTableHtml: mayorTableHtml, balanceTableHtml: balanceTableHtml, flujoTableHtml: flujoTableHtml, conciliacionHtml: conciliacionHtml, ivaResumenHtml: ivaResumenHtml, auxiliaresTableHtml: auxiliaresTableHtml, consumoHtml: consumoHtml, varasChatHtml: varasChatHtml };
});
