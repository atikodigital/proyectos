import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { t } from './i18n';

const CATEGORIES = [
  'Mercadería e insumos del giro', 'Alimentación y representación', 'Combustible y transporte',
  'Mantención y reparaciones', 'Arriendos', 'Servicios básicos', 'Útiles de oficina / generales',
  'Seguros', 'Publicidad y promoción', 'Honorarios', 'Contribuciones, patentes e impuestos',
  'Gastos financieros', 'Otros gastos',
];

function clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }
function fechaCorta(v) { if (!v) return ''; const s = String(v); return s.length >= 10 ? s.slice(0, 10) : s; }

function DetalleCards({ e, lineas }) {
  const esIngreso = e.tipo === 'ingreso';
  const cards = useMemo(() => [
    {
      id: 'monto', title: t('exp.card.monto'), icon: '💰',
      gradient: 'linear-gradient(135deg,#0f766e,#0e7490)',
      fields: [
        [t('exp.field.total'), clp(e.total)],
        e.neto ? [t('exp.field.neto'), clp(e.neto)] : null,
        e.iva  ? [t('exp.field.iva'),  clp(e.iva)]  : null,
      ].filter(Boolean),
    },
    {
      id: 'empresa', title: esIngreso ? t('exp.field.pagador') : t('exp.field.proveedor'), icon: '🏢',
      gradient: 'linear-gradient(135deg,#1d4ed8,#4338ca)',
      fields: [
        e.proveedor        ? [esIngreso ? t('exp.field.pagador') : t('exp.field.proveedor'), e.proveedor] : null,
        e.rut_emisor       ? [t('exp.field.rut'),      e.rut_emisor]        : null,
        e.direccion_emisor ? [t('exp.field.direccion'), e.direccion_emisor] : null,
        e.wa_sender_name   ? [t('exp.field.whatsapp'),  [e.wa_sender_name, e.wa_sender_phone].filter(Boolean).join(' · ')] : null,
        e.canal            ? [t('exp.field.canal'),    e.canal]             : null,
      ].filter(Boolean),
    },
    {
      id: 'documento', title: t('exp.card.documento'), icon: '📄',
      gradient: 'linear-gradient(135deg,#7c3aed,#6d28d9)',
      fields: [
        e.tipo_documento ? [t('exp.field.tipo'),    e.tipo_documento]         : null,
        e.folio          ? [t('exp.field.folio'),   e.folio]                  : null,
        e.nro_operacion  ? [t('exp.field.nro_op'),  e.nro_operacion]          : null,
        e.fecha          ? [t('exp.field.emision'), fechaCorta(e.fecha)]      : null,
        e.created_at     ? [t('exp.field.carga'),   fechaCorta(e.created_at)] : null,
      ].filter(Boolean),
    },
    {
      id: 'clasificacion', title: t('exp.card.clasificacion'), icon: '🏷️',
      gradient: 'linear-gradient(135deg,#d97706,#b45309)',
      fields: [
        (!esIngreso && e.categoria)   ? [t('exp.field.categoria'),  e.categoria]   : null,
        e.glosa                        ? [t('exp.field.glosa'),      e.glosa]        : null,
        e.cuenta_sii_codigo            ? [t('exp.field.cuenta_sii'), e.cuenta_sii_codigo + (e.cuenta_sii_nombre ? ' ' + e.cuenta_sii_nombre : '')] : null,
      ].filter(Boolean),
    },
    {
      id: 'estado', title: t('exp.card.estado'), icon: '✅',
      gradient: 'linear-gradient(135deg,#15803d,#166534)',
      fields: [
        [t('exp.field.tipo'),  esIngreso ? t('exp.tipo.ingreso') : t('exp.tipo.gasto')],
        e.estado      ? [t('exp.field.estado'), e.estado]      : null,
        e.estado_pago ? [t('exp.field.pago'),   e.estado_pago] : null,
      ].filter(Boolean),
    },
  ].filter(c => c.fields.length > 0), [e, esIngreso]);

  // Todo el detalle visible de una (tarjetas apiladas, sin tocar). Las líneas de
  // productos van al final, después de Estado.
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {cards.map((card) => (
        <div key={card.id} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)', background: '#fff' }}>
          <div style={{ background: card.gradient, color: '#fff', padding: '8px 12px', fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{card.icon}</span><span>{card.title}</span>
          </div>
          <div style={{ padding: '10px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px', background: 'rgba(0,0,0,0.02)' }}>
            {card.fields.map(([k, v]) => (
              <div key={k} style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, opacity: 0.55, marginBottom: 1, textTransform: 'uppercase', letterSpacing: 0.3 }}>{k}</div>
                <div style={{ fontWeight: 700, fontSize: 13, wordBreak: 'break-word' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {lineas && lineas.length ? (
        <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)', background: '#fff' }}>
          <div style={{ background: 'linear-gradient(135deg,#0891b2,#0e7490)', color: '#fff', padding: '8px 12px', fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🧾</span><span>{t('exp.card.productos')} ({lineas.length})</span>
          </div>
          <div>
            {lineas.map((l, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 12px', borderTop: i ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, wordBreak: 'break-word' }}>{l.descripcion || '—'}</div>
                  <div style={{ fontSize: 11, opacity: 0.55 }}>{l.cantidad != null ? l.cantidad + ' ' + (l.unidad || '') : ''}</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap' }}>{clp(l.total)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Texto plano del detalle (para copiar y pegar / crear un movimiento).
function textoDetalle(e, lineas) {
  const esIngreso = e.tipo === 'ingreso';
  const L = [];
  L.push((esIngreso ? t('exp.badge.ingreso') : t('exp.badge.gasto')) + ' — ' + clp(e.total));
  if (e.proveedor) L.push((esIngreso ? t('exp.field.pagador') : t('exp.field.proveedor')) + ': ' + e.proveedor);
  if (e.rut_emisor) L.push(t('exp.field.rut') + ': ' + e.rut_emisor);
  L.push(t('exp.field.total') + ': ' + clp(e.total));
  if (e.neto) L.push(t('exp.field.neto') + ': ' + clp(e.neto));
  if (e.iva) L.push(t('exp.field.iva') + ': ' + clp(e.iva));
  if (e.tipo_documento) L.push(t('exp.card.documento') + ': ' + e.tipo_documento);
  if (e.folio) L.push(t('exp.field.folio') + ': ' + e.folio);
  if (e.nro_operacion) L.push(t('exp.field.nro_op') + ': ' + e.nro_operacion);
  if (e.fecha) L.push(t('exp.field.emision') + ': ' + fechaCorta(e.fecha));
  if (!esIngreso && e.categoria) L.push(t('exp.field.categoria') + ': ' + e.categoria);
  if (e.glosa) L.push(t('exp.field.glosa') + ': ' + e.glosa);
  if (e.estado) L.push(t('exp.field.estado') + ': ' + e.estado);
  if (e.estado_pago) L.push(t('exp.field.pago') + ': ' + e.estado_pago);
  if (lineas && lineas.length) {
    L.push('');
    L.push(t('exp.card.productos') + ':');
    lineas.forEach((l) => {
      const qty = l.cantidad != null ? ' x' + l.cantidad + ' ' + (l.unidad || '') : '';
      L.push('- ' + (l.descripcion || '—') + qty + '  ' + clp(l.total));
    });
  }
  return L.join('\n');
}

function EditForm({ e, onSaved, onCancel }) {
  const [f, setF] = useState({
    tipo: e.tipo || 'gasto', proveedor: e.proveedor || '', total: e.total || 0,
    fecha: fechaCorta(e.fecha), categoria: e.categoria || '', folio: e.folio || '', nro_operacion: e.nro_operacion || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value });
  const esIngreso = f.tipo === 'ingreso';
  const cls = 'w-full rounded-lg border px-3 py-2 bg-black/5';
  async function save() {
    setBusy(true);
    try {
      const patch = { tipo: f.tipo, proveedor: f.proveedor, total: Number(f.total) || 0, fecha: f.fecha || null, folio: f.folio, nro_operacion: f.nro_operacion };
      if (!esIngreso) patch.categoria = f.categoria;
      const upd = await api.updateExpense(e.id, patch);
      onSaved(upd || patch);
    } finally { setBusy(false); }
  }
  return (
    <div className="grid gap-2">
      <h3 className="font-black" style={{ color: '#C9A24B' }}>{t('exp.edit.titulo')}</h3>
      <label className="text-xs opacity-60">{t('exp.field.tipo')}</label>
      <select className={cls} value={f.tipo} onChange={set('tipo')}><option value="gasto">{t('exp.tipo.gasto')}</option><option value="ingreso">{t('exp.tipo.ingreso')}</option></select>
      <label className="text-xs opacity-60">{esIngreso ? t('exp.edit.pagador_origen') : t('exp.field.proveedor')}</label>
      <input className={cls} value={f.proveedor} onChange={set('proveedor')} />
      <label className="text-xs opacity-60">{t('exp.field.monto')}</label>
      <input className={cls} type="number" value={f.total} onChange={set('total')} />
      <label className="text-xs opacity-60">{t('exp.edit.fecha_formato')}</label>
      <input className={cls} value={f.fecha} onChange={set('fecha')} placeholder="2026-06-01" />
      {!esIngreso ? (
        <>
          <label className="text-xs opacity-60">{t('exp.field.categoria')}</label>
          <select className={cls} value={f.categoria} onChange={set('categoria')}>
            <option value="">—</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="text-xs opacity-60">{t('exp.edit.folio_doc')}</label>
          <input className={cls} value={f.folio} onChange={set('folio')} />
        </>
      ) : (
        <>
          <label className="text-xs opacity-60">{t('exp.edit.nro_op_voucher')}</label>
          <input className={cls} value={f.nro_operacion} onChange={set('nro_operacion')} />
        </>
      )}
      <button disabled={busy} onClick={save} className="rounded-xl font-black py-3 text-black disabled:opacity-50" style={{ background: '#C9A24B' }}>{t('exp.edit.guardar_cambios')}</button>
      <button disabled={busy} onClick={onCancel} className="rounded-xl font-black py-2 bg-black/10 border">{t('exp.edit.cancelar')}</button>
    </div>
  );
}

function Detalle({ e: e0, onBack, onReload }) {
  const [e, setE] = useState(e0);
  const [editing, setEditing] = useState(false);
  const [confirmAnular, setConfirmAnular] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fotoUrl, setFotoUrl] = useState(null);
  const [fotoMsg, setFotoMsg] = useState('');
  const [lineas, setLineas] = useState([]);
  const [copiado, setCopiado] = useState(false);
  const esIngreso = e.tipo === 'ingreso';
  useEffect(() => {
    let vivo = true;
    api.getExpenseLineas(e.id).then((r) => { if (vivo) setLineas((r && r.lineas) || []); }).catch(() => {});
    return () => { vivo = false; };
  }, [e.id]);
  async function copiar() {
    try { await navigator.clipboard.writeText(textoDetalle(e, lineas)); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch (_) {}
  }
  async function verFoto() {
    setFotoMsg(t('exp.detalle.cargando_foto'));
    const url = await api.fotoUrl(e.id);
    if (url) { setFotoUrl(url); setFotoMsg(''); } else { setFotoMsg(t('exp.detalle.sin_foto')); }
  }
  async function anular() {
    setBusy(true);
    try { await api.annulExpense(e.id); onReload(); onBack(); } finally { setBusy(false); }
  }
  return (
    <div className="p-4 grid gap-3">
      <button onClick={onBack} className="text-sm font-black w-fit" style={{ color: '#C9A24B' }}>{t('exp.detalle.volver')}</button>
      {editing ? (
        <EditForm e={e} onSaved={(upd) => { setE({ ...e, ...upd }); setEditing(false); onReload(); }} onCancel={() => setEditing(false)} />
      ) : (
        <>
          <span className="text-xs font-black w-fit px-2 py-0.5 rounded-full" style={{ background: esIngreso ? '#1f7a3f' : '#7a1f1f', color: '#fff' }}>{esIngreso ? t('exp.badge.ingreso') : t('exp.badge.gasto')}</span>
          <div className="flex items-center justify-between gap-2">
            <div className="text-2xl font-black" style={{ color: '#C9A24B' }}>{clp(e.total)}</div>
            <button onClick={copiar} className="rounded-xl font-black py-2 px-3 text-sm text-black" style={{ background: '#C9A24B' }}>{copiado ? t('exp.copiado') : t('exp.copiar')}</button>
          </div>
          <DetalleCards e={e} lineas={lineas} />
          {fotoUrl ? (
            <img alt={t('exp.confirm.alt_factura')} src={fotoUrl} className="rounded-xl border w-full max-h-80 object-contain bg-black/20" />
          ) : (
            <button onClick={verFoto} className="rounded-xl font-black py-2 bg-black/10 border text-sm">{t('exp.detalle.ver_foto')}</button>
          )}
          {fotoMsg ? <div className="text-xs opacity-60">{fotoMsg}</div> : null}
          {confirmAnular ? (
            <div className="rounded-xl border p-3 grid gap-2" style={{ borderColor: '#7a1f1f' }}>
              <div className="text-sm">{t('exp.detalle.anular_confirm')}</div>
              <button disabled={busy} onClick={anular} className="rounded-xl font-black py-2 text-white disabled:opacity-50" style={{ background: '#7a1f1f' }}>{t('exp.detalle.si_anular')}</button>
              <button disabled={busy} onClick={() => setConfirmAnular(false)} className="rounded-xl font-black py-2 bg-black/10 border">{t('exp.edit.cancelar')}</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setEditing(true)} className="rounded-xl font-black py-3 bg-black/10 border">{t('exp.detalle.editar')}</button>
              <button onClick={() => setConfirmAnular(true)} className="rounded-xl font-black py-3 border" style={{ borderColor: '#7a1f1f', color: '#ff8a8a' }}>{t('exp.detalle.anular')}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function fechaDe(e) {
  return String(e.fecha || (e.created_at ? String(e.created_at).slice(0, 10) : '')).slice(0, 10);
}
function enPeriodo(e, periodo, desde, hasta) {
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
function pasaFiltros(e, f) {
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

// Carrusel deslizable: una tarjeta completa por movimiento; se corre con el dedo
// (scroll-snap) y los puntitos indican en cuál vas. Reemplaza el "expande-de-a-uno".
function MovimientosCards({ rows, onSelect }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [fotos, setFotos] = useState({});

  useEffect(() => {
    let alive = true;
    const urls = [];
    rows.forEach((e) => {
      if (api.fotoUrl) {
        Promise.resolve(api.fotoUrl(e.id)).then((u) => {
          if (alive && u) { urls.push(u); setFotos((p) => ({ ...p, [e.id]: u })); }
        }).catch(() => {});
      }
    });
    return () => { alive = false; urls.forEach((u) => { try { URL.revokeObjectURL(u); } catch (_) {} }); };
  }, [rows]);

  if (!rows.length) return null;

  function onScroll(ev) {
    const el = ev.currentTarget;
    const paso = el.scrollWidth / rows.length;
    const i = paso ? Math.round(el.scrollLeft / paso) : 0;
    setActiveIndex(Math.max(0, Math.min(rows.length - 1, i)));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div onScroll={onScroll} style={{ display: 'flex', gap: 12, overflowX: 'auto', overflowY: 'hidden', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', paddingBottom: 4 }}>
        {rows.map((e) => {
          const esIngreso = e.tipo === 'ingreso';
          const foto = fotos[e.id];
          const bg = esIngreso ? 'linear-gradient(135deg,#0b3d2e,#0f5132)' : 'linear-gradient(135deg,#2a2350,#3a1d1d)';
          return (
            <div
              key={e.id}
              onClick={() => onSelect(e)}
              style={{ flex: '0 0 84%', height: 140, scrollSnapAlign: 'center', position: 'relative', borderRadius: 16, overflow: 'hidden', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: bg }}
            >
              {foto && <img src={foto} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3 }} />}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.2) 100%)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 11, gap: 2 }}>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 20, background: esIngreso ? '#1f7a3f' : '#6d28d9', color: '#fff' }}>
                    {esIngreso ? t('exp.badge.ingreso') : t('exp.badge.gasto')}
                  </span>
                  {e.estado ? <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20, background: 'rgba(255,255,255,0.15)', color: '#fff', textTransform: 'capitalize' }}>{e.estado}</span> : null}
                  {e.estado_pago ? <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20, background: 'rgba(255,255,255,0.12)', color: '#fff' }}>{e.estado_pago}</span> : null}
                </div>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: 15, lineHeight: 1.15 }}>{e.proveedor || (esIngreso ? t('exp.confirm.sin_pagador') : t('exp.confirm.sin_proveedor'))}</div>
                <div style={{ fontWeight: 900, fontSize: 24, lineHeight: 1.05, color: esIngreso ? '#7CFC9B' : '#E7C46B' }}>{esIngreso ? '+' : '−'}{clp(e.total)}</div>
                {(e.fecha || e.folio) ? <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{e.fecha ? fechaCorta(e.fecha) : ''}{e.folio ? (e.fecha ? ' · ' : '') + e.folio : ''}</div> : null}
                {!esIngreso && e.categoria ? <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.categoria}</div> : null}
                <button onClick={(ev) => { ev.stopPropagation(); onSelect(e); }} style={{ alignSelf: 'flex-start', marginTop: 4, fontSize: 11, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 9, padding: '5px 11px', cursor: 'pointer' }}>
                  {t('exp.lista.ver_detalle')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {rows.length > 1 ? (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: '8px 0 2px', flexWrap: 'wrap' }}>
          {rows.slice(0, 15).map((_, i) => (
            <span key={i} style={{ height: 7, borderRadius: 99, transition: 'width .2s,background .2s', width: i === activeIndex ? 20 : 7, background: i === activeIndex ? '#C9A24B' : 'rgba(0,0,0,0.2)' }} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

const FILTRO_INICIAL = { periodo: 'mes', desde: '', hasta: '', tipo: 'todos', estado: 'todos', categoria: '', q: '' };

export default function MyExpenses() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  const [f, setF] = useState(FILTRO_INICIAL);
  const [exportando, setExportando] = useState(false);
  const [mostrarFiltros, setMostrarFiltros] = useState(true);
  const set = (k) => (ev) => setF((p) => ({ ...p, [k]: ev.target.value }));
  function load() {
    return api.listExpenses().then((r) => setRows(Array.isArray(r) ? r : [])).catch(() => {});
  }
  useEffect(() => {
    let alive = true;
    api.listExpenses().then((r) => { if (alive) setRows(Array.isArray(r) ? r : []); })
      .catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // Opciones de categoría y estado salen de los datos → se adapta a negocio y personal.
  const cats = useMemo(() => [...new Set(rows.map((r) => r.categoria).filter(Boolean))].sort(), [rows]);
  const estados = useMemo(() => [...new Set(rows.map((r) => String(r.estado || '').toLowerCase()).filter(Boolean))], [rows]);
  const visibles = useMemo(() => rows.filter((e) => pasaFiltros(e, f)), [rows, f]);
  const total = useMemo(() => visibles.reduce((s, e) => s + (e.tipo === 'ingreso' ? 1 : -1) * (Number(e.total) || 0), 0), [visibles]);
  const hayFiltros = f.periodo !== 'mes' || f.tipo !== 'todos' || f.estado !== 'todos' || !!f.categoria || !!f.q || !!f.desde || !!f.hasta;
  async function descargarExcel() {
    if (!visibles.length || exportando) return;
    setExportando(true);
    try { await api.exportExpensesAbrir(visibles.map((e) => e.id)); } finally { setExportando(false); }
  }

  if (loading) return <div className="p-6">{t('exp.lista.cargando')}</div>;
  if (sel) return <Detalle e={sel} onBack={() => setSel(null)} onReload={load} />;

  const periodos = [['hoy', t('exp.filtro.hoy')], ['mes', t('exp.filtro.mes')], ['anio', t('exp.filtro.anio')], ['rango', t('exp.filtro.rango')], ['todos', t('exp.filtro.todos')]];
  const inp = 'rounded-lg border px-2 py-1.5 text-xs bg-white';

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 pb-1 grid gap-2 shrink-0">
        <div className="flex gap-1.5 flex-wrap items-center">
          {periodos.map((o) => (
            <button key={o[0]} onClick={() => setF((p) => ({ ...p, periodo: o[0] }))} className="text-xs font-black px-3 py-1 rounded-full border" style={f.periodo === o[0] ? { background: '#C9A24B', color: '#000', borderColor: '#C9A24B' } : { opacity: 0.6 }}>{o[1]}</button>
          ))}
          <button onClick={() => setMostrarFiltros((v) => !v)} className="text-xs font-black px-3 py-1 rounded-full border" style={(mostrarFiltros || f.tipo !== 'todos' || f.estado !== 'todos' || f.categoria || f.q) ? { background: '#111827', color: '#fff', borderColor: '#111827' } : { opacity: 0.6 }}>⚙︎ {t('exp.filtro.mas')}</button>
          <button onClick={descargarExcel} disabled={exportando || !visibles.length} className="text-xs font-black text-white rounded-full px-3 py-1 border disabled:opacity-40" style={{ background: '#137333', borderColor: '#137333' }}>{t('exp.filtro.excel')}</button>
        </div>
        {mostrarFiltros ? (
          <div className="grid gap-2 rounded-xl border p-2" style={{ background: 'rgba(0,0,0,0.02)' }}>
            {f.periodo === 'rango' ? (
              <div className="flex gap-2">
                <input type="date" value={f.desde} onChange={set('desde')} className={inp + ' flex-1'} aria-label={t('exp.filtro.desde')} />
                <input type="date" value={f.hasta} onChange={set('hasta')} className={inp + ' flex-1'} aria-label={t('exp.filtro.hasta')} />
              </div>
            ) : null}
            <div className="flex gap-2">
              <select value={f.tipo} onChange={set('tipo')} className={inp + ' flex-1'}>
                <option value="todos">{t('exp.field.tipo')}: {t('exp.filtro.todos')}</option>
                <option value="gasto">{t('exp.tipo.gasto')}</option>
                <option value="ingreso">{t('exp.tipo.ingreso')}</option>
              </select>
              <select value={f.estado} onChange={set('estado')} className={inp + ' flex-1'}>
                <option value="todos">{t('exp.field.estado')}: {t('exp.filtro.todos')}</option>
                {estados.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
            {cats.length ? (
              <select value={f.categoria} onChange={set('categoria')} className={inp}>
                <option value="">{t('exp.field.categoria')}: {t('exp.filtro.todas')}</option>
                {cats.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : null}
            <input value={f.q} onChange={set('q')} placeholder={t('exp.filtro.buscar_ph')} className={inp} />
          </div>
        ) : null}
        <div className="flex items-center gap-2 text-xs px-1">
          <span className="opacity-60 flex-1"><b>{visibles.length}</b> {t('exp.filtro.movimientos')} · {t('exp.filtro.total')} <b>{clp(Math.abs(total))}</b>{visibles.length > 1 ? <span style={{ color: '#137333' }}> · {t('exp.filtro.desliza')}</span> : null}</span>
          {hayFiltros ? <button onClick={() => { setF(FILTRO_INICIAL); setMostrarFiltros(false); }} className="font-black" style={{ color: '#b45309' }}>{t('exp.filtro.limpiar')}</button> : null}
        </div>
      </div>
      {visibles.length === 0 ? (
        <p className="px-6 opacity-60">{rows.length ? t('exp.lista.sin_periodo') : t('exp.lista.sin_movimientos')}</p>
      ) : (
        <div className="flex-1 min-h-0 px-4 pb-4">
          <MovimientosCards rows={visibles} onSelect={setSel} />
        </div>
      )}
    </div>
  );
}
