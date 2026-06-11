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
      return '<tr>' + cells + '</tr>';
    }).join('');
    const t = totalsFromRows(list);
    const foot = '<tfoot><tr><td colspan="8" class="num"><b>Totales</b></td>'
      + '<td class="num"><b>' + fmtClp(t.neto) + '</b></td>'
      + '<td class="num"><b>' + fmtClp(t.iva) + '</b></td>'
      + '<td class="num"><b>' + fmtClp(t.total) + '</b></td><td></td><td></td></tr></tfoot>';
    return '<table class="exp">' + thead + '<tbody>' + body + '</tbody>' + foot + '</table>';
  }

  return { fmtClp, escapeHtml, buildQuery, totalsFromRows, cashflowFromRows, expensesTableHtml };
});
