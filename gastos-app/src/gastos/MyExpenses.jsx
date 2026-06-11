import { useEffect, useState } from 'react';
import { api } from './api';
function clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }
export default function MyExpenses() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    api.listExpenses().then((r) => { if (alive) setRows(Array.isArray(r) ? r : []); })
      .catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  if (loading) return <div className="p-6">Cargando…</div>;
  return (
    <div className="p-4 grid gap-2">
      <h2 className="text-xl font-black px-2" style={{ color: '#C9A24B' }}>Mis movimientos</h2>
      {rows.length === 0 && <p className="px-2 opacity-60">Aún no tienes movimientos.</p>}
      {rows.map((e) => {
        const esIngreso = e.tipo === 'ingreso';
        return (
          <div key={e.id} className="rounded-xl bg-black/5 p-3 flex justify-between items-center border">
            <div>
              <div className="font-black">{e.proveedor || (esIngreso ? 'Sin pagador' : 'Sin proveedor')}</div>
              <div className="text-xs opacity-60">{esIngreso ? 'Ingreso' : (e.categoria || 'Otros gastos')} · {e.estado}</div>
            </div>
            <div className="font-black" style={{ color: esIngreso ? '#1f7a3f' : '#C9A24B' }}>{esIngreso ? '+' : '−'}{clp(e.total)}</div>
          </div>
        );
      })}
    </div>
  );
}
