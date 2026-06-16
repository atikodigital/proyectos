import { useEffect, useRef, useState } from 'react';
import { api } from './api';

const CATEGORIES = [
  'Mercadería e insumos del giro', 'Alimentación y representación', 'Combustible y transporte',
  'Mantención y reparaciones', 'Arriendos', 'Servicios básicos', 'Útiles de oficina / generales',
  'Seguros', 'Publicidad y promoción', 'Honorarios', 'Contribuciones, patentes e impuestos',
  'Gastos financieros', 'Otros gastos',
];

function clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }
function fechaCorta(v) { if (!v) return ''; const s = String(v); return s.length >= 10 ? s.slice(0, 10) : s; }

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
      <h3 className="font-black" style={{ color: '#C9A24B' }}>Editar movimiento</h3>
      <label className="text-xs opacity-60">Tipo</label>
      <select className={cls} value={f.tipo} onChange={set('tipo')}><option value="gasto">Gasto</option><option value="ingreso">Ingreso</option></select>
      <label className="text-xs opacity-60">{esIngreso ? 'Pagador / origen' : 'Proveedor'}</label>
      <input className={cls} value={f.proveedor} onChange={set('proveedor')} />
      <label className="text-xs opacity-60">Monto</label>
      <input className={cls} type="number" value={f.total} onChange={set('total')} />
      <label className="text-xs opacity-60">Fecha (aaaa-mm-dd)</label>
      <input className={cls} value={f.fecha} onChange={set('fecha')} placeholder="2026-06-01" />
      {!esIngreso ? (
        <>
          <label className="text-xs opacity-60">Categoría</label>
          <select className={cls} value={f.categoria} onChange={set('categoria')}>
            <option value="">—</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="text-xs opacity-60">Folio (N° doc)</label>
          <input className={cls} value={f.folio} onChange={set('folio')} />
        </>
      ) : (
        <>
          <label className="text-xs opacity-60">N° operación (voucher)</label>
          <input className={cls} value={f.nro_operacion} onChange={set('nro_operacion')} />
        </>
      )}
      <button disabled={busy} onClick={save} className="rounded-xl font-black py-3 text-black disabled:opacity-50" style={{ background: '#C9A24B' }}>Guardar cambios</button>
      <button disabled={busy} onClick={onCancel} className="rounded-xl font-black py-2 bg-black/10 border">Cancelar</button>
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
  const esIngreso = e.tipo === 'ingreso';
  async function verFoto() {
    setFotoMsg('Cargando foto…');
    const url = await api.fotoUrl(e.id);
    if (url) { setFotoUrl(url); setFotoMsg(''); } else { setFotoMsg('Sin foto disponible (se guarda 2 meses y luego se elimina).'); }
  }
  const filas = [
    [esIngreso ? 'Pagador / origen' : 'Proveedor', e.proveedor],
    ['Total', clp(e.total)],
    ['Neto', e.neto ? clp(e.neto) : ''],
    ['IVA', e.iva ? clp(e.iva) : ''],
    ['RUT', e.rut_emisor],
    ['Folio (N° doc)', e.folio],
    ['N° operación (voucher)', e.nro_operacion],
    ['Documento', e.tipo_documento],
    ['Categoría', esIngreso ? '' : e.categoria],
    ['Cuenta SII', e.cuenta_sii_codigo ? (e.cuenta_sii_codigo + ' ' + (e.cuenta_sii_nombre || '')) : ''],
    ['Fecha emisión', fechaCorta(e.fecha)],
    ['Fecha de carga', fechaCorta(e.created_at)],
    ['Dirección', e.direccion_emisor],
    ['Glosa', e.glosa],
    ['Enviado por (WhatsApp)', [e.wa_sender_name, e.wa_sender_phone].filter(Boolean).join(' · ')],
    ['Canal', e.canal],
    ['Estado', e.estado],
    ['Estado de pago', e.estado_pago],
  ].filter(function (f) { return f[1] !== undefined && f[1] !== null && String(f[1]).trim() !== ''; });
  async function anular() {
    setBusy(true);
    try { await api.annulExpense(e.id); onReload(); onBack(); } finally { setBusy(false); }
  }
  return (
    <div className="p-4 grid gap-3">
      <button onClick={onBack} className="text-sm font-black w-fit" style={{ color: '#C9A24B' }}>← Volver</button>
      {editing ? (
        <EditForm e={e} onSaved={(upd) => { setE({ ...e, ...upd }); setEditing(false); onReload(); }} onCancel={() => setEditing(false)} />
      ) : (
        <>
          <span className="text-xs font-black w-fit px-2 py-0.5 rounded-full" style={{ background: esIngreso ? '#1f7a3f' : '#7a1f1f', color: '#fff' }}>{esIngreso ? 'INGRESO' : 'GASTO'}</span>
          <div className="text-2xl font-black" style={{ color: '#C9A24B' }}>{clp(e.total)}</div>
          <div className="rounded-2xl bg-black/5 border">
            {filas.map(function (f) {
              return (
                <div key={f[0]} className="flex justify-between gap-3 px-4 py-2 text-sm border-b last:border-0">
                  <span className="opacity-60">{f[0]}</span>
                  <span className="font-bold text-right">{f[1]}</span>
                </div>
              );
            })}
          </div>
          {fotoUrl ? (
            <img alt="factura" src={fotoUrl} className="rounded-xl border w-full max-h-80 object-contain bg-black/20" />
          ) : (
            <button onClick={verFoto} className="rounded-xl font-black py-2 bg-black/10 border text-sm">📷 Ver foto de la factura</button>
          )}
          {fotoMsg ? <div className="text-xs opacity-60">{fotoMsg}</div> : null}
          {confirmAnular ? (
            <div className="rounded-xl border p-3 grid gap-2" style={{ borderColor: '#7a1f1f' }}>
              <div className="text-sm">¿Anular este movimiento? Dejará de contar en los totales y el Excel (queda el registro).</div>
              <button disabled={busy} onClick={anular} className="rounded-xl font-black py-2 text-white disabled:opacity-50" style={{ background: '#7a1f1f' }}>Sí, anular</button>
              <button disabled={busy} onClick={() => setConfirmAnular(false)} className="rounded-xl font-black py-2 bg-black/10 border">Cancelar</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setEditing(true)} className="rounded-xl font-black py-3 bg-black/10 border">✏️ Editar</button>
              <button onClick={() => setConfirmAnular(true)} className="rounded-xl font-black py-3 border" style={{ borderColor: '#7a1f1f', color: '#ff8a8a' }}>🗑️ Anular</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function enPeriodo(e, filtro) {
  if (filtro === 'todos') return true;
  const raw = e.fecha || (e.created_at ? String(e.created_at).slice(0, 10) : '');
  if (!raw) return true; // sin fecha → no la escondemos
  const d = new Date();
  if (filtro === 'mes') return String(raw).slice(0, 7) === d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  if (filtro === 'anio') return String(raw).slice(0, 4) === String(d.getFullYear());
  return true;
}

// Tarjeta de movimiento: foto de la factura arriba + detalle (tipo, tags, monto, glosa) abajo.
function MovCard({ e, onClick }) {
  const [foto, setFoto] = useState(null);
  const esIngreso = e.tipo === 'ingreso';
  useEffect(() => {
    let alive = true; let url = null;
    if (api.fotoUrl) {
      Promise.resolve(api.fotoUrl(e.id)).then((u) => { if (alive && u) { url = u; setFoto(u); } }).catch(() => {});
    }
    return () => { alive = false; if (url) { try { URL.revokeObjectURL(url); } catch (_) { /* noop */ } } };
  }, [e.id]);
  const tags = [esIngreso ? 'Ingreso' : (e.categoria || 'Otros gastos')];
  if (e.estado) tags.push(e.estado);
  if (e.estado_pago) tags.push(e.estado_pago);
  return (
    <button
      onClick={onClick}
      className="relative shrink-0 h-full rounded-2xl overflow-hidden border border-black/10 text-left shadow-lg"
      style={{ minWidth: '82vw', maxWidth: '380px', scrollSnapAlign: 'center' }}
    >
      <div className="h-full w-full bg-black/30 flex items-center justify-center">
        {foto ? (
          <img alt="factura" src={foto} className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-6xl opacity-40"
            style={{ background: esIngreso ? 'linear-gradient(135deg,#0b3d2e,#0f5132)' : 'linear-gradient(135deg,#2a2350,#3a1d1d)' }}
          >
            {esIngreso ? '📥' : '🧾'}
          </div>
        )}
      </div>
      <div
        className="absolute inset-x-3 bottom-3 rounded-2xl p-4 space-y-2"
        style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}
      >
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full text-white" style={{ background: esIngreso ? '#1f7a3f' : '#6d28d9' }}>
            {esIngreso ? 'INGRESO' : 'GASTO'}
          </span>
          {tags.map((t, i) => (
            <span key={i} className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-white/15 text-white capitalize">{t}</span>
          ))}
        </div>
        <div className="text-white font-black text-base truncate">{e.proveedor || (esIngreso ? 'Sin pagador' : 'Sin proveedor')}</div>
        <div className="font-black text-2xl" style={{ color: esIngreso ? '#7CFC9B' : '#E7C46B' }}>{esIngreso ? '+' : '−'}{clp(e.total)}</div>
        <div className="text-white/70 text-xs">{e.fecha || 's/fecha'}{e.glosa ? ' · ' + e.glosa : ''}</div>
        <div className="text-xs font-bold" style={{ color: '#5ad7ff' }}>Ver detalle ›</div>
      </div>
    </button>
  );
}

export default function MyExpenses() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  const [filtro, setFiltro] = useState('mes');
  const [prog, setProg] = useState(0);
  const scrollRef = useRef(null);
  function load() {
    return api.listExpenses().then((r) => setRows(Array.isArray(r) ? r : [])).catch(() => {});
  }
  useEffect(() => {
    let alive = true;
    api.listExpenses().then((r) => { if (alive) setRows(Array.isArray(r) ? r : []); })
      .catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  if (loading) return <div className="p-6">Cargando…</div>;
  if (sel) return <Detalle e={sel} onBack={() => setSel(null)} onReload={load} />;
  const visibles = rows.filter((e) => enPeriodo(e, filtro));
  const N = visibles.length;
  // El carrusel se desliza SOLO horizontal (swipe). La barra de progreso se calcula
  // con la posición horizontal del scroll, no con scroll vertical.
  function onScroll() {
    const el = scrollRef.current; if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setProg(max > 0 ? Math.round((el.scrollLeft / max) * 100) : 0);
  }
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 pb-2 grid gap-3 shrink-0">
        <h2 className="text-xl font-black px-2" style={{ color: '#C9A24B' }}>Mis movimientos</h2>
        <div className="flex gap-2 px-2">
          {[['mes', 'Este mes'], ['anio', 'Este año'], ['todos', 'Todos']].map(function (o) {
            return (
              <button key={o[0]} onClick={() => setFiltro(o[0])} className="text-xs font-black px-3 py-1 rounded-full border" style={filtro === o[0] ? { background: '#C9A24B', color: '#000' } : { opacity: 0.6 }}>{o[1]}</button>
            );
          })}
        </div>
      </div>
      {N === 0 ? (
        <p className="px-6 opacity-60">{rows.length ? 'Sin movimientos en este período.' : 'Aún no tienes movimientos.'}</p>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="flex-1 min-h-0 flex gap-3 overflow-x-auto px-4 pb-1"
            style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
          >
            {visibles.map((e) => <MovCard key={e.id} e={e} onClick={() => setSel(e)} />)}
          </div>
          <div className="mx-6 my-3 h-1.5 rounded-full bg-black/10 overflow-hidden shrink-0">
            <div className="h-full rounded-full" style={{ width: (N <= 1 ? 100 : prog) + '%', background: '#5ad7ff' }} />
          </div>
        </div>
      )}
    </div>
  );
}
