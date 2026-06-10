import { useState } from 'react';
import { api } from './api';
function clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }
export default function ConfirmScreen({ expense, onDone }) {
  const [busy, setBusy] = useState(false);
  const e = expense;
  async function run(fn) { setBusy(true); try { await fn(); onDone(); } finally { setBusy(false); } }
  return (
    <div className="p-6 max-w-sm mx-auto grid gap-3">
      <h2 className="text-xl font-black" style={{ color: '#C9A24B' }}>Revisa el gasto</h2>
      <div className="rounded-2xl bg-black/5 p-4 grid gap-1 border">
        <div className="text-lg font-black">{e.proveedor || 'Sin proveedor'}</div>
        <div className="text-2xl font-black" style={{ color: '#C9A24B' }}>{clp(e.total)}</div>
        <div className="text-sm opacity-70">{e.tipo_documento || 'documento'} · {e.fecha || 's/fecha'}</div>
        <div className="text-sm opacity-70">{e.categoria || 'Otros gastos'} · IVA {clp(e.iva)}</div>
      </div>
      <button disabled={busy} onClick={() => run(() => api.confirmExpense(e.id))} className="rounded-xl font-black py-3 text-black disabled:opacity-50" style={{ background: '#C9A24B' }}>Confirmar y guardar</button>
      <button disabled={busy} onClick={() => run(() => api.rejectExpense(e.id))} className="rounded-xl font-black py-3 bg-black/10 border disabled:opacity-50">Descartar</button>
    </div>
  );
}
