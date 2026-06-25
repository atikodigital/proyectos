import { useState, useEffect } from 'react';
import { api } from './api';

const CATEGORIES = [
  'Mercadería e insumos del giro', 'Alimentación y representación', 'Combustible y transporte',
  'Mantención y reparaciones', 'Arriendos', 'Servicios básicos', 'Útiles de oficina / generales',
  'Seguros', 'Publicidad y promoción', 'Honorarios', 'Contribuciones, patentes e impuestos',
  'Gastos financieros', 'Otros gastos',
];

function clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }

export default function ConfirmScreen({ expense, onDone, photo }) {
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(expense);
  const [lineas, setLineas] = useState([]);
  const [auxes, setAuxes] = useState([]);
  const esIngreso = e.tipo === 'ingreso';
  // carga inicial (solo gasto)
  useEffect(() => {
    let vivo = true;
    if (e.tipo === 'ingreso') return undefined;
    Promise.all([api.getExpenseLineas(e.id).catch(() => ({ lineas: [] })), api.listAuxiliaresApp().catch(() => ({ auxiliares: [] }))])
      .then(([l, a]) => { if (!vivo) return; setLineas((l && l.lineas) || []); setAuxes((a && a.auxiliares) || []); });
    return () => { vivo = false; };
  }, [e.id, e.tipo]);
  async function reasignar(lineaId, auxiliarId) {
    setLineas((prev) => prev.map((x) => x.id === lineaId ? { ...x, auxiliar_id: auxiliarId } : x));
    try { await api.setLineaAuxiliar(lineaId, auxiliarId); } catch (_) { /* noop */ }
  }
  async function run(fn) { setBusy(true); try { await fn(); onDone(); } finally { setBusy(false); } }
  async function toggleTipo() {
    const nuevo = esIngreso ? 'gasto' : 'ingreso';
    setBusy(true);
    try { const upd = await api.updateExpense(e.id, { tipo: nuevo }); setE({ ...e, ...upd }); }
    finally { setBusy(false); }
  }
  async function setCategoria(cat) {
    setE({ ...e, categoria: cat });
    try { await api.updateExpense(e.id, { categoria: cat }); } catch (_) { /* reintenta al confirmar si hace falta */ }
  }
  return (
    <div className="relative p-6 max-w-sm mx-auto grid gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => run(() => api.rejectExpense(e.id))}
        aria-label="Cerrar"
        className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/10 border flex items-center justify-center text-xl leading-none disabled:opacity-50"
      >
        ×
      </button>
      <h2 className="text-xl font-black pr-10" style={{ color: '#C9A24B' }}>Revisa el {esIngreso ? 'ingreso' : 'gasto'}</h2>
      {photo && photo.base64 ? (
        <img alt="factura" src={`data:${photo.mime || 'image/jpeg'};base64,${photo.base64}`} className="rounded-xl border w-full max-h-60 object-contain bg-black/20" />
      ) : null}
      <div className="rounded-2xl bg-black/5 p-4 grid gap-1 border">
        <span className="text-xs font-black w-fit px-2 py-0.5 rounded-full" style={{ background: esIngreso ? '#1f7a3f' : '#7a1f1f', color: '#fff' }}>{esIngreso ? 'INGRESO' : 'GASTO'}</span>
        <div className="text-lg font-black">{e.proveedor || (esIngreso ? 'Sin pagador' : 'Sin proveedor')}</div>
        <div className="text-2xl font-black" style={{ color: '#C9A24B' }}>{clp(e.total)}</div>
        <div className="text-sm opacity-70">{e.tipo_documento || 'documento'} · {e.fecha || 's/fecha'}</div>
        <div className="text-sm opacity-70">{esIngreso ? (e.nro_operacion ? 'N° ' + e.nro_operacion : 'Transferencia/depósito') : 'IVA ' + clp(e.iva)}</div>
        {e.rut_emisor ? <div className="text-xs opacity-80 mt-1 border-t pt-1 border-black/5"><b>RUT Emisor:</b> {e.rut_emisor}</div> : null}
        {e.folio ? <div className="text-xs opacity-80"><b>Folio / N° Doc:</b> {e.folio}</div> : null}
        {e.direccion_emisor ? <div className="text-xs opacity-80"><b>Dirección:</b> {e.direccion_emisor}</div> : null}
        {e.glosa ? <div className="text-xs opacity-80 mt-1 border-t pt-1 border-black/5"><b>Detalle / Glosa:</b> {e.glosa}</div> : null}
      </div>
      {!esIngreso ? (
        <div className="grid gap-1">
          <label className="text-xs opacity-70">Categoría — <b>sugerencia de la IA</b>, revisa la factura y corrígela si hace falta:</label>
          <select className="w-full rounded-lg border px-3 py-2 bg-black/5" value={e.categoria || 'Otros gastos'} onChange={(ev) => setCategoria(ev.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      ) : null}
      {!esIngreso && lineas.length ? (
        <div className="grid gap-2">
          <div className="text-xs font-black opacity-70">Insumos detectados — corrige el auxiliar si hace falta:</div>
          {lineas.map((l) => (
            <div key={l.id} className="rounded-xl border p-2 text-sm grid gap-1">
              <div className="flex justify-between gap-2"><span className="truncate">{l.descripcion}</span><span className="font-bold">{clp(l.total)}</span></div>
              <div className="text-[11px] opacity-60">{l.cantidad != null ? l.cantidad + ' ' + (l.unidad || '') : ''}</div>
              <select aria-label={`insumo-${l.id}`} className="w-full rounded-lg border px-2 py-1 bg-black/5 text-sm"
                value={l.auxiliar_id || ''} onChange={(ev) => reasignar(l.id, ev.target.value || null)}>
                <option value="">— sin insumo —</option>
                {auxes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
          ))}
        </div>
      ) : null}
      <button disabled={busy} onClick={toggleTipo} className="rounded-xl font-black py-2 bg-black/10 border disabled:opacity-50 text-sm">Es un {esIngreso ? 'gasto' : 'ingreso'}</button>
      <button disabled={busy} onClick={() => run(() => api.confirmExpense(e.id))} className="rounded-xl font-black py-3 text-black disabled:opacity-50" style={{ background: '#C9A24B' }}>Confirmar y guardar</button>
      <button disabled={busy} onClick={() => run(() => api.rejectExpense(e.id))} className="rounded-xl font-black py-3 bg-black/10 border disabled:opacity-50">Descartar</button>
    </div>
  );
}
