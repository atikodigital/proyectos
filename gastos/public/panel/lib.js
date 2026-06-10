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
    ['Fecha', 'fecha'], ['Empleado', 'employee_id'], ['Proveedor', 'proveedor'],
    ['RUT', 'rut_emisor'], ['Folio', 'folio'], ['Tipo', 'tipo_documento'],
    ['Categoría', 'categoria'], ['Cuenta SII', 'cuenta_sii_codigo'],
  ];
  const MONEY = [['Neto', 'neto'], ['IVA', 'iva'], ['Total', 'total']];

  function expensesTableHtml(rows) {
    const list = rows || [];
    const thead = '<thead><tr>'
      + COLS.map(([h]) => `<th>${h}</th>`).join('')
      + MONEY.map(([h]) => `<th class="num">${h}</th>`).join('')
      + '<th>Estado</th></tr></thead>';
    const body = list.map((r) => {
      const cells = COLS.map(([, k]) => `<td>${escapeHtml(r[k])}</td>`).join('')
        + MONEY.map(([, k]) => `<td class="num">${fmtClp(r[k])}</td>`).join('')
        + `<td>${escapeHtml(r.estado)}</td>`;
      return `<tr>${cells}</tr>`;
    }).join('');
    const t = totalsFromRows(list);
    const foot = `<tfoot><tr><td colspan="8" class="num"><b>Totales</b></td>`
      + `<td class="num"><b>${fmtClp(t.neto)}</b></td>`
      + `<td class="num"><b>${fmtClp(t.iva)}</b></td>`
      + `<td class="num"><b>${fmtClp(t.total)}</b></td><td></td></tr></tfoot>`;
    return `<table class="exp">${thead}<tbody>${body}</tbody>${foot}</table>`;
  }

  return { fmtClp, escapeHtml, buildQuery, totalsFromRows, expensesTableHtml };
});
