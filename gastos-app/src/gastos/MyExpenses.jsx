import { useEffect, useState } from 'react';
import { api } from './api';
function clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }
function fechaCorta(v) { if (!v) return ''; const s = String(v); return s.length >= 10 ? s.slice(0, 10) : s; }

function Detalle({ e, onBack }) {
  const esIngreso = e.tipo === 'ingreso';
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
  return (
    <div className="p-4 grid gap-3">
      <button onClick={onBack} className="text-sm font-black w-fit" style={{ color: '#C9A24B' }}>← Volver</button>
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
    </div>
  );
}

export default function MyExpenses() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  useEffect(() => {
    let alive = true;
    api.listExpenses().then((r) => { if (alive) setRows(Array.isArray(r) ? r : []); })
      .catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  if (loading) return <div className="p-6">Cargando…</div>;
  if (sel) return <Detalle e={sel} onBack={() => setSel(null)} />;
  return (
    <div className="p-4 grid gap-2">
      <h2 className="text-xl font-black px-2" style={{ color: '#C9A24B' }}>Mis movimientos</h2>
      {rows.length === 0 && <p className="px-2 opacity-60">Aún no tienes movimientos.</p>}
      {rows.map((e) => {
        const esIngreso = e.tipo === 'ingreso';
        return (
          <button key={e.id} onClick={() => setSel(e)} className="text-left rounded-xl bg-black/5 p-3 flex justify-between items-center border">
            <div>
              <div className="font-black">{e.proveedor || (esIngreso ? 'Sin pagador' : 'Sin proveedor')}</div>
              <div className="text-xs opacity-60">{esIngreso ? 'Ingreso' : (e.categoria || 'Otros gastos')} · {e.estado} · ver detalle ›</div>
            </div>
            <div className="font-black" style={{ color: esIngreso ? '#1f7a3f' : '#C9A24B' }}>{esIngreso ? '+' : '−'}{clp(e.total)}</div>
          </button>
        );
      })}
    </div>
  );
}
