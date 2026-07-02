(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PanelLib = api;
})(typeof window !== 'undefined' ? window : null, function () {
  var LIB_I18N = {
    es: {
      'tab.canal': 'Canal',
      'tab.categoria': 'Categoría',
      'tab.clasificacion': 'Clasificación',
      'tab.direccion': 'Dirección',
      'tab.documento': 'Documento',
      'tab.empleado': 'Empleado',
      'tab.estado_pago': 'Estado de pago',
      'tab.estado': 'Estado',
      'tab.fecha_carga': 'Fecha carga',
      'tab.fecha_de_carga': 'Fecha de carga',
      'tab.fecha_emision': 'Fecha emisión',
      'tab.fecha': 'Fecha',
      'tab.folio': 'Folio',
      'tab.folio_ndoc': 'Folio (N° doc)',
      'tab.gasto': 'Gasto',
      'tab.glosa': 'Glosa',
      'tab.ingreso': 'Ingreso',
      'tab.insumo': 'Insumo',
      'tab.monto': 'Monto',
      'tab.neto': 'Neto',
      'tab.otros_gastos': 'Otros gastos',
      'tab.proveedor': 'Proveedor',
      'tab.pagador': 'Pagador',
      'tab.pagador_origen': 'Pagador / origen',
      'tab.rut': 'RUT',
      'tab.tipo': 'Tipo',
      'tab.tipo_doc': 'Tipo doc',
      'tab.total': 'Total',
      'tab.iva': 'IVA',
      'tab.nro_oper': 'N° oper.',
      'tab.nro_operacion': 'N° operación',
      'tab.nro_operacion_voucher': 'N° operación (voucher)',
      'tab.cuenta_sii': 'Cuenta SII',
      'tab.pago': 'Pago',
      'tab.pagado': 'Pagado',
      'tab.por_pagar': 'Por pagar',
      'tab.totales': 'Totales',
      'tab.totales_up': 'TOTALES',
      'tab.sin_pagador': 'Sin pagador',
      'tab.sin_proveedor': 'Sin proveedor',
      'tab.sin_fecha': 's/fecha',
      'tab.ingreso_up': 'INGRESO',
      'tab.gasto_up': 'GASTO',
      'tab.sin_movimientos_filtros': 'Sin movimientos para esos filtros.',
      'tab.whatsapp': 'WhatsApp',
      'tab.enviado_por_wa': 'Enviado por (WhatsApp)',
      'tab.cuenta': 'Cuenta',
      'tab.debe': 'Debe',
      'tab.haber': 'Haber',
      'tab.anular': 'Anular',
      'tab.sin_asientos': 'Sin asientos en el período.',
      'tab.codigo': 'Código',
      'tab.saldo': 'Saldo',
      'tab.sin_movimientos': 'Sin movimientos.',
      'tab.deudor': 'Deudor',
      'tab.acreedor': 'Acreedor',
      'tab.cuadrado': '✓ Cuadrado',
      'tab.descuadrado': '⚠ Descuadrado',
      'tab.sin_cuentas': 'Sin cuentas.',
      'tab.entrada': 'Entrada',
      'tab.salida': 'Salida',
      'tab.entradas': 'Entradas',
      'tab.salidas': 'Salidas',
      'tab.sin_mov_caja': 'Sin movimientos de caja/banco.',
      'tab.sin_concil_disp': 'Sin conciliación disponible. Carga una cartola bancaria para generar el workpaper.',
      'tab.campo': 'Campo',
      'tab.saldo_cartola': 'Saldo cartola',
      'tab.banco_contable': 'Banco contable',
      'tab.sca': 'SCA (ajustado cartola)',
      'tab.sba': 'SBA (ajustado banco)',
      'tab.partidas_concil': 'Partidas de conciliación',
      'tab.sin_concil_sii': 'Sin conciliación SII todavía.',
      'tab.iva_pagar_contable': 'IVA a pagar (contable)',
      'tab.iva_pagar_sii': 'IVA a pagar (SII)',
      'tab.si': 'Sí',
      'tab.no': 'No',
      'tab.activo': 'Activo',
      'tab.inactivo': 'Inactivo',
      'tab.editar': 'Editar',
      'tab.desactivar': 'Desactivar',
      'tab.nombre': 'Nombre',
      'tab.imputable': 'Imputable',
      'tab.acciones': 'Acciones',
      'tab.sin_cuentas_contables': 'Sin cuentas contables.',
      'tab.servicio': 'servicio',
      'tab.unidad': 'unidad',
      'tab.desde': 'desde',
      'tab.unidad_col': 'Unidad',
      'tab.borrar': 'Borrar',
      'tab.sin_auxiliares': 'Sin auxiliares. Setea el giro y pulsa "Sembrar".',
      'tab.sin_consumo': 'Sin consumo registrado para',
      'tab.mes': 'Mes',
      'tab.cantidad': 'Cantidad',
      'tab.sin_evolucion': 'Sin evolución.',
      'tab.total_lc': 'total',
      'tab.varas_analizando': 'VARAS está analizando...',
      'tab.accion_sugerida': '✨ Acción sugerida',
      'tab.confirmar': 'Confirmar',
      'tab.cancelar': 'Cancelar',
      'tab.productos': 'Productos'
    },
    en: {
      'tab.canal': 'Channel',
      'tab.categoria': 'Category',
      'tab.clasificacion': 'Classification',
      'tab.direccion': 'Address',
      'tab.documento': 'Document',
      'tab.empleado': 'Employee',
      'tab.estado_pago': 'Payment status',
      'tab.estado': 'Status',
      'tab.fecha_carga': 'Upload date',
      'tab.fecha_de_carga': 'Upload date',
      'tab.fecha_emision': 'Issue date',
      'tab.fecha': 'Date',
      'tab.folio': 'Folio',
      'tab.folio_ndoc': 'Folio (doc no.)',
      'tab.gasto': 'Expense',
      'tab.glosa': 'Description',
      'tab.ingreso': 'Income',
      'tab.insumo': 'Item',
      'tab.monto': 'Amount',
      'tab.neto': 'Net',
      'tab.otros_gastos': 'Other expenses',
      'tab.proveedor': 'Supplier',
      'tab.pagador': 'Payer',
      'tab.pagador_origen': 'Payer / origin',
      'tab.rut': 'Tax ID',
      'tab.tipo': 'Type',
      'tab.tipo_doc': 'Doc type',
      'tab.total': 'Total',
      'tab.iva': 'VAT',
      'tab.nro_oper': 'Oper. no.',
      'tab.nro_operacion': 'Operation no.',
      'tab.nro_operacion_voucher': 'Operation no. (voucher)',
      'tab.cuenta_sii': 'Tax account',
      'tab.pago': 'Payment',
      'tab.pagado': 'Paid',
      'tab.por_pagar': 'To pay',
      'tab.totales': 'Totals',
      'tab.totales_up': 'TOTALS',
      'tab.sin_pagador': 'No payer',
      'tab.sin_proveedor': 'No supplier',
      'tab.sin_fecha': 'no date',
      'tab.ingreso_up': 'INCOME',
      'tab.gasto_up': 'EXPENSE',
      'tab.sin_movimientos_filtros': 'No transactions for those filters.',
      'tab.whatsapp': 'WhatsApp',
      'tab.enviado_por_wa': 'Sent by (WhatsApp)',
      'tab.cuenta': 'Account',
      'tab.debe': 'Debit',
      'tab.haber': 'Credit',
      'tab.anular': 'Void',
      'tab.sin_asientos': 'No entries in the period.',
      'tab.codigo': 'Code',
      'tab.saldo': 'Balance',
      'tab.sin_movimientos': 'No transactions.',
      'tab.deudor': 'Debit',
      'tab.acreedor': 'Credit',
      'tab.cuadrado': '✓ Balanced',
      'tab.descuadrado': '⚠ Unbalanced',
      'tab.sin_cuentas': 'No accounts.',
      'tab.entrada': 'Inflow',
      'tab.salida': 'Outflow',
      'tab.entradas': 'Inflows',
      'tab.salidas': 'Outflows',
      'tab.sin_mov_caja': 'No cash/bank transactions.',
      'tab.sin_concil_disp': 'No reconciliation available. Upload a bank statement to generate the workpaper.',
      'tab.campo': 'Field',
      'tab.saldo_cartola': 'Statement balance',
      'tab.banco_contable': 'Book bank balance',
      'tab.sca': 'ASB (adjusted statement)',
      'tab.sba': 'ABB (adjusted bank)',
      'tab.partidas_concil': 'Reconciliation items',
      'tab.sin_concil_sii': 'No tax reconciliation yet.',
      'tab.iva_pagar_contable': 'VAT payable (book)',
      'tab.iva_pagar_sii': 'VAT payable (tax authority)',
      'tab.si': 'Yes',
      'tab.no': 'No',
      'tab.activo': 'Active',
      'tab.inactivo': 'Inactive',
      'tab.editar': 'Edit',
      'tab.desactivar': 'Deactivate',
      'tab.nombre': 'Name',
      'tab.imputable': 'Chargeable',
      'tab.acciones': 'Actions',
      'tab.sin_cuentas_contables': 'No accounting accounts.',
      'tab.servicio': 'service',
      'tab.unidad': 'unit',
      'tab.desde': 'from',
      'tab.unidad_col': 'Unit',
      'tab.borrar': 'Delete',
      'tab.sin_auxiliares': 'No items. Set the business type and press "Seed".',
      'tab.sin_consumo': 'No consumption recorded for',
      'tab.mes': 'Month',
      'tab.cantidad': 'Quantity',
      'tab.sin_evolucion': 'No history.',
      'tab.total_lc': 'total',
      'tab.varas_analizando': 'VARAS is analyzing...',
      'tab.accion_sugerida': '✨ Suggested action',
      'tab.confirmar': 'Confirm',
      'tab.cancelar': 'Cancel',
      'tab.productos': 'Products'
    },
    pt: {
      'tab.canal': 'Canal',
      'tab.categoria': 'Categoria',
      'tab.clasificacion': 'Classificação',
      'tab.direccion': 'Endereço',
      'tab.documento': 'Documento',
      'tab.empleado': 'Funcionário',
      'tab.estado_pago': 'Status de pagamento',
      'tab.estado': 'Status',
      'tab.fecha_carga': 'Data de carga',
      'tab.fecha_de_carga': 'Data de carga',
      'tab.fecha_emision': 'Data de emissão',
      'tab.fecha': 'Data',
      'tab.folio': 'Folio',
      'tab.folio_ndoc': 'Folio (nº doc)',
      'tab.gasto': 'Despesa',
      'tab.glosa': 'Descrição',
      'tab.ingreso': 'Receita',
      'tab.insumo': 'Insumo',
      'tab.monto': 'Valor',
      'tab.neto': 'Líquido',
      'tab.otros_gastos': 'Outras despesas',
      'tab.proveedor': 'Fornecedor',
      'tab.pagador': 'Pagador',
      'tab.pagador_origen': 'Pagador / origem',
      'tab.rut': 'CNPJ/CPF',
      'tab.tipo': 'Tipo',
      'tab.tipo_doc': 'Tipo doc',
      'tab.total': 'Total',
      'tab.iva': 'ICMS',
      'tab.nro_oper': 'Nº oper.',
      'tab.nro_operacion': 'Nº operação',
      'tab.nro_operacion_voucher': 'Nº operação (voucher)',
      'tab.cuenta_sii': 'Conta fiscal',
      'tab.pago': 'Pagamento',
      'tab.pagado': 'Pago',
      'tab.por_pagar': 'A pagar',
      'tab.totales': 'Totais',
      'tab.totales_up': 'TOTAIS',
      'tab.sin_pagador': 'Sem pagador',
      'tab.sin_proveedor': 'Sem fornecedor',
      'tab.sin_fecha': 's/data',
      'tab.ingreso_up': 'RECEITA',
      'tab.gasto_up': 'DESPESA',
      'tab.sin_movimientos_filtros': 'Sem movimentos para esses filtros.',
      'tab.whatsapp': 'WhatsApp',
      'tab.enviado_por_wa': 'Enviado por (WhatsApp)',
      'tab.cuenta': 'Conta',
      'tab.debe': 'Débito',
      'tab.haber': 'Crédito',
      'tab.anular': 'Anular',
      'tab.sin_asientos': 'Sem lançamentos no período.',
      'tab.codigo': 'Código',
      'tab.saldo': 'Saldo',
      'tab.sin_movimientos': 'Sem movimentos.',
      'tab.deudor': 'Devedor',
      'tab.acreedor': 'Credor',
      'tab.cuadrado': '✓ Conferido',
      'tab.descuadrado': '⚠ Não confere',
      'tab.sin_cuentas': 'Sem contas.',
      'tab.entrada': 'Entrada',
      'tab.salida': 'Saída',
      'tab.entradas': 'Entradas',
      'tab.salidas': 'Saídas',
      'tab.sin_mov_caja': 'Sem movimentos de caixa/banco.',
      'tab.sin_concil_disp': 'Sem conciliação disponível. Carregue um extrato bancário para gerar o workpaper.',
      'tab.campo': 'Campo',
      'tab.saldo_cartola': 'Saldo do extrato',
      'tab.banco_contable': 'Banco contábil',
      'tab.sca': 'SCA (ajustado extrato)',
      'tab.sba': 'SBA (ajustado banco)',
      'tab.partidas_concil': 'Partidas de conciliação',
      'tab.sin_concil_sii': 'Sem conciliação fiscal ainda.',
      'tab.iva_pagar_contable': 'Imposto a pagar (contábil)',
      'tab.iva_pagar_sii': 'Imposto a pagar (fisco)',
      'tab.si': 'Sim',
      'tab.no': 'Não',
      'tab.activo': 'Ativo',
      'tab.inactivo': 'Inativo',
      'tab.editar': 'Editar',
      'tab.desactivar': 'Desativar',
      'tab.nombre': 'Nome',
      'tab.imputable': 'Imputável',
      'tab.acciones': 'Ações',
      'tab.sin_cuentas_contables': 'Sem contas contábeis.',
      'tab.servicio': 'serviço',
      'tab.unidad': 'unidade',
      'tab.desde': 'a partir de',
      'tab.unidad_col': 'Unidade',
      'tab.borrar': 'Excluir',
      'tab.sin_auxiliares': 'Sem auxiliares. Defina o ramo e clique em "Semear".',
      'tab.sin_consumo': 'Sem consumo registrado para',
      'tab.mes': 'Mês',
      'tab.cantidad': 'Quantidade',
      'tab.sin_evolucion': 'Sem evolução.',
      'tab.total_lc': 'total',
      'tab.varas_analizando': 'VARAS está analisando...',
      'tab.accion_sugerida': '✨ Ação sugerida',
      'tab.confirmar': 'Confirmar',
      'tab.cancelar': 'Cancelar',
      'tab.productos': 'Produtos'
    }
  };
  function libIdioma() {
    try { var i = localStorage.getItem('hash_idioma'); if (i && LIB_I18N[i]) return i; } catch (e) {}
    return 'es';
  }
  function L(k) {
    var i = libIdioma();
    return (LIB_I18N[i] && LIB_I18N[i][k]) || LIB_I18N.es[k] || k;
  }

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
    [L('tab.tipo'), 'tipo'], [L('tab.fecha'), 'fecha'], [L('tab.empleado'), 'empleado_nombre'], [L('tab.proveedor'), 'proveedor'],
    [L('tab.rut'), 'rut_emisor'], [L('tab.folio'), 'folio'], [L('tab.nro_oper'), 'nro_operacion'], [L('tab.categoria'), 'categoria'],
  ];
  const MONEY = [[L('tab.total'), 'total']];

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

  // Etiqueta clara del estado de pago (lo no pagado es "Pendiente de pago").
  function labelPago(v) {
    var s = String(v || '').toLowerCase();
    if (!s) return 'Pendiente de pago';
    if (s === 'pagada' || s === 'pagado') return L('tab.pagado');
    if (s === 'conciliada') return 'Conciliada';
    return 'Pendiente de pago';
  }

  function pagoCell(r) {
    if (r.tipo === 'ingreso') return '—';
    // Ambos estados son botón: pagada → volver a pendiente (data-unpay); pendiente → pagar (data-pay).
    if (r.estado_pago === 'pagada' || r.estado_pago === 'conciliada') {
      return '<button class="badge-pago badge-pagado" data-unpay="' + escapeHtml(r.id) + '" title="Tocar para volver a Pendiente de pago" style="cursor:pointer;border:0">' + labelPago(r.estado_pago) + '</button>';
    }
    return '<button class="btn-pay btn-porpagar" data-pay="' + escapeHtml(r.id) + '">' + L('tab.por_pagar') + '</button>';
  }

  function fmtFecha(s) {
    if (!s) return '';
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? (m[3] + '-' + m[2] + '-' + m[1]) : String(s).slice(0, 10);
  }
  function fmtEstado(s) {
    if (!s) return '';
    var w = String(s).split('_')[0];
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  function expensesTableHtml(rows) {
    const list = rows || [];
    const thead = '<thead><tr>'
      + COLS.map(function (c) { return '<th>' + c[0] + '</th>'; }).join('')
      + MONEY.map(function (c) { return '<th class="num">' + c[0] + '</th>'; }).join('')
      + '<th>' + L('tab.estado') + '</th><th>' + L('tab.pago') + '</th></tr></thead>';
    const body = list.map(function (r) {
      const cells = COLS.map(function (c) {
        if (c[1] === 'tipo') return '<td><span class="tipo-' + (r.tipo === 'ingreso' ? 'ingreso' : 'gasto') + '">' + escapeHtml(r.tipo) + '</span></td>';
        if (c[1] === 'fecha') return '<td>' + escapeHtml(fmtFecha(r.fecha)) + '</td>';
        return '<td>' + escapeHtml(r[c[1]]) + '</td>';
      }).join('')
        + MONEY.map(function (c) { return '<td class="num">' + fmtClp(r[c[1]]) + '</td>'; }).join('')
        + '<td>' + escapeHtml(fmtEstado(r.estado)) + '</td>'
        + '<td>' + pagoCell(r) + '</td>';
      return '<tr class="exp-row" data-id="' + escapeHtml(r.id) + '">' + cells + '</tr>';
    }).join('');
    const t = totalsFromRows(list);
    const foot = '<tfoot><tr><td colspan="8" class="num"><b>' + L('tab.totales') + '</b></td>'
      + '<td class="num"><b>' + fmtClp(t.total) + '</b></td><td></td><td></td></tr></tfoot>';
    return '<table class="exp">' + thead + '<tbody>' + body + '</tbody>' + foot + '</table>';
  }

  function carCard(r) {
    var esIngreso = r.tipo === 'ingreso';
    return '<div class="movcard" data-id="' + escapeHtml(r.id) + '">'
      + '<div class="movtipo" style="color:' + (esIngreso ? '#7CFC9B' : '#ff8a8a') + '">' + (esIngreso ? L('tab.ingreso_up') : L('tab.gasto_up')) + '</div>'
      + '<div class="movprov">' + escapeHtml(r.proveedor || (esIngreso ? L('tab.sin_pagador') : L('tab.sin_proveedor'))) + '</div>'
      + '<div class="movtotal">' + (esIngreso ? '+' : '−') + fmtClp(r.total) + '</div>'
      + '<div class="movmeta">' + escapeHtml(r.fecha || L('tab.sin_fecha')) + ' · ' + escapeHtml(esIngreso ? L('tab.ingreso') : (r.categoria || L('tab.otros_gastos'))) + '</div>'
      + '<div class="movmeta">' + escapeHtml(r.estado || '') + (r.estado_pago ? ' · ' + escapeHtml(labelPago(r.estado_pago)) : '') + '</div>'
      + '<div class="movpago">' + pagoCell(r) + '</div>'
      + '</div>';
  }

  function expensesCarouselHtml(rows) {
    var list = rows || [];
    if (!list.length) return '<p class="muted" style="padding:16px">' + L('tab.sin_movimientos_filtros') + '</p>';
    return '<div class="carousel">' + list.map(carCard).join('') + '</div>';
  }

  function detalleRows(e) {
    var esIngreso = e.tipo === 'ingreso';
    return [
      [L('tab.tipo'), esIngreso ? L('tab.ingreso') : L('tab.gasto')],
      [esIngreso ? L('tab.pagador_origen') : L('tab.proveedor'), e.proveedor],
      [L('tab.total'), fmtClp(e.total)],
      [L('tab.neto'), e.neto ? fmtClp(e.neto) : ''],
      [L('tab.iva'), e.iva ? fmtClp(e.iva) : ''],
      [L('tab.rut'), e.rut_emisor],
      [L('tab.folio_ndoc'), e.folio],
      [L('tab.nro_operacion_voucher'), e.nro_operacion],
      [L('tab.documento'), e.tipo_documento],
      [L('tab.categoria'), esIngreso ? '' : e.categoria],
      [L('tab.cuenta_sii'), e.cuenta_sii_codigo ? (e.cuenta_sii_codigo + ' ' + (e.cuenta_sii_nombre || '')) : ''],
      [L('tab.fecha_emision'), e.fecha],
      [L('tab.fecha_de_carga'), e.created_at ? String(e.created_at).slice(0, 10) : ''],
      [L('tab.empleado'), e.empleado_nombre],
      [L('tab.direccion'), e.direccion_emisor],
      [L('tab.glosa'), e.glosa],
      [L('tab.enviado_por_wa'), [e.wa_sender_name, e.wa_sender_phone].filter(Boolean).join(' · ')],
      [L('tab.canal'), e.canal],
      [L('tab.estado'), e.estado],
      [L('tab.estado_pago'), e.estado_pago ? labelPago(e.estado_pago) : e.estado_pago],
    ].filter(function (f) { return f[1] !== undefined && f[1] !== null && String(f[1]).trim() !== ''; });
  }

  function detalleHtml(e, lineas) {
    e = e || {};
    var esIngreso = e.tipo === 'ingreso';
    function ok(v) { return v !== undefined && v !== null && String(v).trim() !== ''; }
    function campo(label, val) { return [label, val]; }
    var grupos = [
      {
        icon: '\u{1F4B0}', titulo: L('tab.monto'),
        grad: 'linear-gradient(135deg,#059669 0%,#0e7490 100%)',
        campos: [
          campo(L('tab.total'), ok(e.total) ? fmtClp(e.total) : null),
          campo(L('tab.neto'), ok(e.neto) ? fmtClp(e.neto) : null),
          campo(L('tab.iva'), ok(e.iva) ? fmtClp(e.iva) : null),
        ]
      },
      {
        icon: '\u{1F3E2}', titulo: esIngreso ? L('tab.pagador') : L('tab.proveedor'),
        grad: 'linear-gradient(135deg,#2563eb 0%,#4f46e5 100%)',
        campos: [
          campo(esIngreso ? L('tab.pagador') : L('tab.proveedor'), e.proveedor),
          campo(L('tab.rut'), e.rut_emisor),
          campo(L('tab.tipo_doc'), e.tipo_documento),
          campo(L('tab.direccion'), e.direccion_emisor),
        ]
      },
      {
        icon: '\u{1F4C4}', titulo: L('tab.documento'),
        grad: 'linear-gradient(135deg,#7c3aed 0%,#9333ea 100%)',
        campos: [
          campo(L('tab.folio'), e.folio),
          campo(L('tab.nro_operacion'), e.nro_operacion),
          campo(L('tab.fecha_emision'), e.fecha),
          campo(L('tab.fecha_carga'), ok(e.created_at) ? String(e.created_at).slice(0, 10) : null),
        ]
      },
      {
        icon: '\u{1F3F7}️', titulo: L('tab.clasificacion'),
        grad: 'linear-gradient(135deg,#ea580c 0%,#fca311 100%)',
        campos: [
          campo(L('tab.tipo'), esIngreso ? L('tab.ingreso') : L('tab.gasto')),
          campo(L('tab.categoria'), !esIngreso ? e.categoria : null),
          campo(L('tab.cuenta_sii'), ok(e.cuenta_sii_codigo) ? (e.cuenta_sii_codigo + ' ' + (e.cuenta_sii_nombre || '')) : null),
          campo(L('tab.canal'), e.canal),
          campo(L('tab.empleado'), e.empleado_nombre),
        ]
      },
      {
        icon: '✅', titulo: L('tab.estado'),
        grad: 'linear-gradient(135deg,#10b981 0%,#065f46 100%)',
        campos: [
          campo(L('tab.estado'), e.estado),
          campo(L('tab.pago'), e.estado_pago ? labelPago(e.estado_pago) : null),
          campo(L('tab.glosa'), e.glosa),
          campo(L('tab.whatsapp'), [e.wa_sender_name, e.wa_sender_phone].filter(Boolean).join(' · ') || null),
        ]
      },
    ];

    var gruposFiltrados = grupos.filter(function (g) {
      return g.campos.some(function (c) { return ok(c[1]); });
    });

    var HEAD = 'color:#fff;padding:8px 12px;font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:.5px';
    var CARD = 'border-radius:12px;overflow:hidden;border:1px solid rgba(0,0,0,.08);background:#fff';
    var BODY = 'padding:10px 12px;display:grid;grid-template-columns:1fr 1fr;gap:8px 12px';
    var KEY = 'font-size:10px;opacity:.55;text-transform:uppercase;letter-spacing:.3px';
    var VAL = 'font-weight:700;font-size:13px;word-break:break-word';

    function card(grad, icon, titulo, bodyHtml) {
      return '<div style="' + CARD + '">'
        + '<div style="background:' + grad + ';' + HEAD + '">' + icon + ' ' + escapeHtml(titulo) + '</div>'
        + '<div style="' + BODY + '">' + bodyHtml + '</div>'
        + '</div>';
    }

    var cardsHtml = gruposFiltrados.map(function (g) {
      var camposHtml = g.campos
        .filter(function (c) { return ok(c[1]); })
        .map(function (c) {
          return '<div><div style="' + KEY + '">' + escapeHtml(c[0]) + '</div>'
            + '<div style="' + VAL + '">' + escapeHtml(String(c[1])) + '</div></div>';
        }).join('');
      return card(g.grad, g.icon, g.titulo, camposHtml);
    }).join('');

    if (lineas && lineas.length) {
      var lineasHtml = lineas.map(function (l) {
        var desc = escapeHtml(l.descripcion || '');
        var cant = escapeHtml(((l.cantidad != null ? l.cantidad : '') + ' ' + (l.unidad || '')).trim());
        return '<div style="grid-column:1/-1;display:flex;justify-content:space-between;gap:10px;align-items:baseline;border-top:1px solid rgba(0,0,0,.06);padding-top:6px">'
          + '<div style="min-width:0"><div style="' + VAL + '">' + desc + '</div>'
          + (cant ? '<div style="' + KEY + '">' + cant + '</div>' : '') + '</div>'
          + '<div style="' + VAL + ';white-space:nowrap">' + fmtClp(l.total) + '</div></div>';
      }).join('');
      cardsHtml += card('linear-gradient(135deg,#0891b2,#0e7490)', '\u{1F6D2}', L('tab.productos') || 'Productos', lineasHtml);
    }

    return '<div style="display:grid;gap:10px">' + cardsHtml + '</div>';
  }

  // eslint-disable-next-line no-unused-vars
  function __detalleHtml_legacy_unused(g, i, camposHtml) {
    return ['<li class="det-card" data-idx="' + i + '" tabindex="0" style="background:' + g.grad + '">'
        + '<div class="dc-overlay"></div>'
        + '<article class="dc-article">'
        + '<span class="dc-label-col">' + g.icon + ' ' + escapeHtml(g.titulo) + '</span>'
        + '<div class="dc-expanded">'
        + '<span class="dc-icon">' + g.icon + '</span>'
        + '<h3 class="dc-title">' + escapeHtml(g.titulo) + '</h3>'
        + '<div class="dc-campos">' + camposHtml + '</div>'
        + '</div>'
        + '</article>'
        + '</li>'].join('');
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
          + '<td>' + (i === 0 ? escapeHtml(a.glosa) : '') + (i === 0 && a.id ? ' <button class="btn-ghost aux-del" data-anular="' + escapeHtml(a.id) + '">' + L('tab.anular') + '</button>' : '') + '</td>'
          + '<td>' + escapeHtml(l.cuenta_nombre || l.codigo) + '</td>'
          + '<td class="num">' + (Number(l.debe) ? fmtClp(l.debe) : '') + '</td>'
          + '<td class="num">' + (Number(l.haber) ? fmtClp(l.haber) : '') + '</td>'
          + '</tr>';
      }).join('');
    }).join('');
    return '<table class="tbl"><thead><tr><th>' + L('tab.fecha') + '</th><th>' + L('tab.glosa') + '</th><th>' + L('tab.cuenta') + '</th><th class="num">' + L('tab.debe') + '</th><th class="num">' + L('tab.haber') + '</th></tr></thead><tbody>'
      + (rows || '<tr><td colspan="5">' + L('tab.sin_asientos') + '</td></tr>') + '</tbody></table>';
  }

  function mayorTableHtml(cuentas) {
    const rows = (cuentas || []).map(function (c) {
      return '<tr><td>' + escapeHtml(c.codigo) + '</td><td>' + escapeHtml(c.nombre)
        + '</td><td class="num">' + fmtClp(c.debe) + '</td><td class="num">' + fmtClp(c.haber)
        + '</td><td class="num">' + fmtClp(c.saldo) + '</td></tr>';
    }).join('');
    return '<table class="tbl"><thead><tr><th>' + L('tab.codigo') + '</th><th>' + L('tab.cuenta') + '</th><th class="num">' + L('tab.debe') + '</th><th class="num">' + L('tab.haber') + '</th><th class="num">' + L('tab.saldo') + '</th></tr></thead><tbody>'
      + (rows || '<tr><td colspan="5">' + L('tab.sin_movimientos') + '</td></tr>') + '</tbody></table>';
  }

  function balanceTableHtml(bal) {
    bal = bal || {};
    const rows = (bal.cuentas || []).map(function (c) {
      return '<tr><td>' + escapeHtml(c.codigo) + '</td><td>' + escapeHtml(c.nombre)
        + '</td><td class="num">' + fmtClp(c.deudor) + '</td><td class="num">' + fmtClp(c.acreedor) + '</td></tr>';
    }).join('');
    const badge = bal.cuadrado ? '<span class="badge-ok">' + L('tab.cuadrado') + '</span>' : '<span class="badge-no">' + L('tab.descuadrado') + '</span>';
    return badge + '<table class="tbl"><thead><tr><th>' + L('tab.codigo') + '</th><th>' + L('tab.cuenta') + '</th><th class="num">' + L('tab.deudor') + '</th><th class="num">' + L('tab.acreedor') + '</th></tr></thead><tbody>'
      + (rows || '<tr><td colspan="4">' + L('tab.sin_cuentas') + '</td></tr>')
      + '<tr class="tot"><td colspan="2"><b>' + L('tab.totales_up') + '</b></td><td class="num"><b>' + fmtClp(bal.totalDebe) + '</b></td><td class="num"><b>' + fmtClp(bal.totalHaber) + '</b></td></tr>'
      + '</tbody></table>';
  }

  function flujoTableHtml(flujo) {
    flujo = flujo || {};
    const rows = (flujo.movimientos || []).map(function (m) {
      return '<tr><td>' + escapeHtml(m.fecha) + '</td><td>' + escapeHtml(m.glosa)
        + '</td><td class="num">' + (Number(m.entrada) ? fmtClp(m.entrada) : '') + '</td><td class="num">' + (Number(m.salida) ? fmtClp(m.salida) : '') + '</td></tr>';
    }).join('');
    return '<div class="flujo-tot">' + L('tab.entradas') + ': <b>' + fmtClp(flujo.entradas) + '</b> · ' + L('tab.salidas') + ': <b>' + fmtClp(flujo.salidas) + '</b> · ' + L('tab.neto') + ': <b>' + fmtClp(flujo.neto) + '</b></div>'
      + '<table class="tbl"><thead><tr><th>' + L('tab.fecha') + '</th><th>' + L('tab.glosa') + '</th><th class="num">' + L('tab.entrada') + '</th><th class="num">' + L('tab.salida') + '</th></tr></thead><tbody>'
      + (rows || '<tr><td colspan="4">' + L('tab.sin_mov_caja') + '</td></tr>') + '</tbody></table>';
  }

  function conciliacionHtml(inf) {
    if (!inf || inf.conciliacion === null) {
      return '<p class="muted" style="padding:16px">' + L('tab.sin_concil_disp') + '</p>';
    }
    var cuadrado = inf.cuadrado;
    var badge = cuadrado
      ? '<span class="badge-ok">' + L('tab.cuadrado') + '</span>'
      : '<span class="badge-no">' + L('tab.descuadrado') + '</span>';
    var filas = (inf.partidas || []).map(function (p) {
      return '<tr><td>' + escapeHtml(p.tipo) + '</td><td class="num">' + fmtClp(p.monto) + '</td></tr>';
    }).join('');
    return badge
      + '<table class="tbl" style="margin-top:10px">'
      + '<thead><tr><th>' + L('tab.campo') + '</th><th class="num">' + L('tab.monto') + '</th></tr></thead>'
      + '<tbody>'
      + '<tr><td>' + L('tab.saldo_cartola') + '</td><td class="num">' + fmtClp(inf.saldoFinalCartola != null ? inf.saldoFinalCartola : inf.saldo_final_cartola) + '</td></tr>'
      + '<tr><td>' + L('tab.banco_contable') + '</td><td class="num">' + fmtClp(inf.bancoContable != null ? inf.bancoContable : inf.banco_contable) + '</td></tr>'
      + '<tr><td>' + L('tab.sca') + '</td><td class="num">' + fmtClp(inf.sca) + '</td></tr>'
      + '<tr><td>' + L('tab.sba') + '</td><td class="num">' + fmtClp(inf.sba) + '</td></tr>'
      + '</tbody></table>'
      + (filas ? '<h4 style="margin:12px 0 6px;color:var(--gold)">' + L('tab.partidas_concil') + '</h4>'
          + '<table class="tbl"><thead><tr><th>' + L('tab.tipo') + '</th><th class="num">' + L('tab.monto') + '</th></tr></thead><tbody>'
          + filas + '</tbody></table>' : '');
  }

  function ivaResumenHtml(inf) {
    if (!inf) return '<p class="muted" style="padding:8px">' + L('tab.sin_concil_sii') + '</p>';
    return '<div class="flujo-tot">' + L('tab.iva_pagar_contable') + ': <b>' + fmtClp(inf.sca) + '</b> · ' + L('tab.iva_pagar_sii') + ': <b>' + fmtClp(inf.sba) + '</b></div>';
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
  function cuentasTableHtml(cuentas) {
    const rows = (cuentas || []).map(function (c) {
      return '<tr data-cta-id="' + escapeHtml(c.id) + '">'
        + '<td>' + escapeHtml(c.codigo) + '</td>'
        + '<td>' + escapeHtml(c.nombre) + '</td>'
        + '<td>' + escapeHtml(c.tipo) + '</td>'
        + '<td>' + (c.imputable ? L('tab.si') : L('tab.no')) + '</td>'
        + '<td>' + (c.activo ? '<span class="badge-ok">' + L('tab.activo') + '</span>' : '<span class="badge-no">' + L('tab.inactivo') + '</span>') + '</td>'
        + '<td>'
        + '  <button class="btn-ghost btn-sm cta-edit" data-id="' + escapeHtml(c.id) + '" style="font-size:11px;padding:4px 8px">' + L('tab.editar') + '</button>'
        + '  ' + (c.activo ? '<button class="btn-ghost btn-sm cta-del" data-id="' + escapeHtml(c.id) + '" style="font-size:11px;padding:4px 8px;color:#ff8a8a">' + L('tab.desactivar') + '</button>' : '')
        + '</td>'
        + '</tr>';
    }).join('');
    return '<table class="tbl"><thead><tr><th>' + L('tab.codigo') + '</th><th>' + L('tab.nombre') + '</th><th>' + L('tab.tipo') + '</th><th>' + L('tab.imputable') + '</th><th>' + L('tab.estado') + '</th><th>' + L('tab.acciones') + '</th></tr></thead><tbody>'
      + (rows || '<tr><td colspan="6">' + L('tab.sin_cuentas_contables') + '</td></tr>') + '</tbody></table>';
  }

  function productosListHtml(products, fmt) {
    return (products || []).map(function (p) {
      var nombre = escapeHtml(p.nombre);
      var tipo = p.tipo === 'servicio'
        ? ' <span style="font-size:9px;background:#3a2f5a;color:#dccfff;padding:1px 5px;border-radius:5px;">' + L('tab.servicio') + '</span>' : '';
      var precio = (p.tipo === 'servicio')
        ? fmt(p.precio_base) + ' / ' + escapeHtml(p.unidad || L('tab.unidad'))
        : L('tab.desde') + ' ' + fmt(desdePriceLib(p));
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
        + '<td><button class="btn-ghost aux-del" data-aux="' + escapeHtml(a.id) + '">' + L('tab.borrar') + '</button></td>'
        + '</tr>';
    }).join('');
    return '<table class="tbl"><thead><tr><th>' + L('tab.insumo') + '</th><th>' + L('tab.tipo') + '</th><th>' + L('tab.unidad_col') + '</th><th>' + L('tab.estado') + '</th><th></th></tr></thead><tbody>'
      + (rows || '<tr><td colspan="5">' + L('tab.sin_auxiliares') + '</td></tr>') + '</tbody></table>';
  }

  function consumoHtml(c, nombre) {
    c = c || {};
    var unidades = Object.keys(c.cantidadPorUnidad || {});
    if (!unidades.length && !(c.serie || []).length) {
      return '<p class="muted" style="padding:8px">' + L('tab.sin_consumo') + ' ' + escapeHtml(nombre || '') + '.</p>';
    }
    var cant = unidades.map(function (u) {
      return '<b>' + escapeHtml(String(c.cantidadPorUnidad[u])) + ' ' + escapeHtml(u) + '</b>';
    }).join(' + ') || '—';
    var filas = (c.serie || []).map(function (s) {
      return '<tr><td>' + escapeHtml(s.ym) + '</td><td class="num">' + escapeHtml(String(s.cantidad)) + '</td><td class="num">' + fmtClp(s.monto) + '</td></tr>';
    }).join('');
    return '<div class="flujo-tot">' + escapeHtml(nombre || L('tab.insumo')) + ': ' + cant + ' · ' + L('tab.total_lc') + ' <b>' + fmtClp(c.monto) + '</b></div>'
      + '<table class="tbl"><thead><tr><th>' + L('tab.mes') + '</th><th class="num">' + L('tab.cantidad') + '</th><th class="num">' + L('tab.monto') + '</th></tr></thead><tbody>'
      + (filas || '<tr><td colspan="3">' + L('tab.sin_evolucion') + '</td></tr>') + '</tbody></table>';
  }

  function varasChatHtml(mensajes, accion) {
    var oro = '#C9A24B';
    var burbujas = (mensajes || []).map(function (m) {
      var esUser = m.role === 'user';
      var cls = esUser ? 'varas-bubble-user' : 'varas-bubble-varas';
      var align = esUser ? 'flex-end' : 'flex-start';
      var bg = esUser ? 'rgba(201,162,75,0.13)' : 'rgba(255,255,255,0.06)';
      var col = esUser ? '#f0e2bf' : '#e8e8ee';

      if (m.loading) {
        return '<div style="display:flex;justify-content:flex-start;margin:4px 0">'
          + '<div class="' + cls + '" style="max-width:80%;border-radius:14px;padding:8px 12px;font-size:13px;background:rgba(201,162,75,0.05);color:' + oro + ';display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(201,162,75,0.15)">'
          + '<span class="pulse-dot"></span><span>' + L('tab.varas_analizando') + '</span></div></div>';
      }

      var formatted = escapeHtml(m.text)
        .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
        .replace(/\n\*\s/g, '<br>• ')
        .replace(/\n/g, '<br>');

      return '<div style="display:flex;justify-content:' + align + ';margin:4px 0">'
        + '<div class="' + cls + '" style="max-width:80%;border-radius:14px;padding:8px 12px;font-size:13px;background:' + bg + ';color:' + col + '">'
        + formatted + '</div></div>';
    }).join('');
    var tarjeta = '';
    if (accion) {
      tarjeta = '<div id="varasAccionCard" style="background:rgba(201,162,75,0.06);border:1px solid rgba(201,162,75,0.3);box-shadow:0 8px 32px 0 rgba(0,0,0,0.37);border-radius:14px;padding:14px;margin:12px 0;font-size:13px;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);animation:scaleIn 0.2s cubic-bezier(0.16,1,0.3,1)">'
        + '<div style="font-family:var(--font-heading);font-weight:700;font-size:14px;color:' + oro + ';margin-bottom:10px;display:flex;align-items:center;gap:6px">'
        + L('tab.accion_sugerida') + '</div>'
        + '<div style="margin-bottom:12px;color:#e8e8ee">' + escapeHtml(accion.descripcion) + '</div>'
        + '<div style="display:flex;gap:8px">'
        + '<button id="varas-confirmar" class="btn-gold" style="font-size:12px;padding:6px 14px;border-radius:8px">' + L('tab.confirmar') + '</button>'
        + '<button id="varas-cancelar" class="btn-ghost" style="font-size:12px;padding:6px 14px;border-radius:8px;background:rgba(255,255,255,0.02)">' + L('tab.cancelar') + '</button>'
        + '</div></div>';
    }
    return '<div id="varasMensajes" style="display:flex;flex-direction:column">' + burbujas + tarjeta + '</div>';
  }

  return { fmtClp, escapeHtml, buildQuery, totalsFromRows, cashflowFromRows, expensesTableHtml, expensesCarouselHtml, detalleRows, detalleHtml, labelPago: labelPago, desdePriceLib: desdePriceLib, productosListHtml: productosListHtml, cuadreManual: cuadreManual, diarioTableHtml: diarioTableHtml, mayorTableHtml: mayorTableHtml, balanceTableHtml: balanceTableHtml, flujoTableHtml: flujoTableHtml, conciliacionHtml: conciliacionHtml, ivaResumenHtml: ivaResumenHtml, auxiliaresTableHtml: auxiliaresTableHtml, consumoHtml: consumoHtml, varasChatHtml: varasChatHtml, cuentasTableHtml: cuentasTableHtml };
});
