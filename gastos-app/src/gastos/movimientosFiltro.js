// Filtro compartido de movimientos.
// Lo usan la pestaña "Movimientos" (MyExpenses) y el "Panel de Control" personal
// (PersonalDashboard). Antes vivía duplicado dentro de MyExpenses; se extrajo aquí
// para que ambas vistas filtren EXACTAMENTE igual (período/tipo/estado/categoría/búsqueda).

export const FILTRO_INICIAL = { periodo: 'mes', desde: '', hasta: '', tipo: 'todos', estado: 'todos', categoria: '', q: '' };

// Fecha del movimiento en formato YYYY-MM-DD (usa fecha de emisión; si no hay, la de carga).
export function fechaDe(e) {
  return String(e.fecha || (e.created_at ? String(e.created_at).slice(0, 10) : '')).slice(0, 10);
}

export function enPeriodo(e, periodo, desde, hasta) {
  if (periodo === 'todos') return true;
  const raw = fechaDe(e);
  if (!raw) return true; // sin fecha → no la escondemos
  const d = new Date();
  const hoy = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  if (periodo === 'hoy') return raw === hoy;
  if (periodo === 'mes') return raw.slice(0, 7) === d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  if (periodo === 'anio') return raw.slice(0, 4) === String(d.getFullYear());
  if (periodo === 'rango') { if (desde && raw < desde) return false; if (hasta && raw > hasta) return false; return true; }
  return true;
}

// Combina todos los filtros (período + tipo + estado + categoría + búsqueda).
export function pasaFiltros(e, f) {
  if (!enPeriodo(e, f.periodo, f.desde, f.hasta)) return false;
  if (f.tipo !== 'todos') { const tp = e.tipo === 'ingreso' ? 'ingreso' : 'gasto'; if (tp !== f.tipo) return false; }
  if (f.estado !== 'todos' && String(e.estado || '').toLowerCase() !== f.estado) return false;
  if (f.categoria && String(e.categoria || '') !== f.categoria) return false;
  if (f.q) {
    const q = f.q.trim().toLowerCase();
    const hay = [e.proveedor, e.folio, e.glosa, e.rut_emisor, e.nro_operacion].filter(Boolean).join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}
