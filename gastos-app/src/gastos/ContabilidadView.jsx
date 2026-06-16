import { useState, useEffect } from 'react';
import { api } from './api';
import MatchView from './MatchView.jsx';

const ORO = '#C9A24B';
function clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }
function ymActual() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }

const TABS = [
  { id: 'concil', label: 'Conciliación' },
  { id: 'diario', label: 'Diario' },
  { id: 'mayor', label: 'Mayor' },
  { id: 'balance', label: 'Balance' },
  { id: 'flujo', label: 'Flujo' },
];

export default function ContabilidadView() {
  const [tab, setTab] = useState('concil');
  const [periodo, setPeriodo] = useState(ymActual());
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (tab === 'concil') { setData(null); return; }
    let vivo = true;
    setBusy(true); setData(null);
    const fn = tab === 'diario' ? api.contabilidadDiario
      : tab === 'mayor' ? api.contabilidadMayor
      : tab === 'balance' ? api.contabilidadBalance
      : api.contabilidadFlujo;
    Promise.resolve(fn(periodo)).then((r) => { if (vivo) setData(r); }).catch(() => { if (vivo) setData({ error: true }); }).finally(() => { if (vivo) setBusy(false); });
    return () => { vivo = false; };
  }, [tab, periodo]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-3 pb-1 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black" style={{ color: ORO }}>VARAS · Contabilidad</h2>
          {tab !== 'concil' ? (
            <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="text-xs border rounded px-2 py-1" />
          ) : null}
        </div>
        <div className="flex gap-1 overflow-x-auto mt-2 pb-1">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border ${tab === t.id ? 'text-white' : 'opacity-60'}`}
              style={tab === t.id ? { background: ORO, borderColor: ORO } : {}}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'concil' ? <MatchView />
          : busy ? <div className="p-4 text-sm opacity-70">Cargando…</div>
          : !data || data.error ? <div className="p-4 text-sm opacity-70">No se pudo cargar el período.</div>
          : tab === 'diario' ? <Diario data={data} />
          : tab === 'mayor' ? <Mayor data={data} />
          : tab === 'balance' ? <Balance data={data} />
          : <Flujo data={data} />}
      </div>
    </div>
  );
}

function Diario({ data }) {
  const asientos = (data && data.asientos) || [];
  if (!asientos.length) return <div className="p-4 text-sm opacity-60">Sin asientos en el período.</div>;
  return (
    <div className="p-3 grid gap-2">
      {asientos.map((a, i) => (
        <div key={i} className="rounded-xl border p-3 text-sm">
          <div className="flex justify-between font-bold"><span>{a.fecha}</span></div>
          <div className="text-xs opacity-70 mb-1">{a.glosa}</div>
          {(a.lineas || []).map((l, j) => (
            <div key={j} className="flex justify-between text-xs">
              <span className="truncate">{l.cuenta_nombre || l.codigo}</span>
              <span className="font-bold">{Number(l.debe) ? clp(l.debe) : '(' + clp(l.haber) + ')'}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Mayor({ data }) {
  const cuentas = (data && data.cuentas) || [];
  if (!cuentas.length) return <div className="p-4 text-sm opacity-60">Sin movimientos.</div>;
  return (
    <div className="p-3 grid gap-1">
      {cuentas.map((c, i) => (
        <div key={i} className="flex justify-between items-center rounded-lg border px-3 py-2 text-sm">
          <span className="truncate">{c.nombre}</span>
          <span className="font-bold">{clp(c.saldo)}</span>
        </div>
      ))}
    </div>
  );
}

function Balance({ data }) {
  const cuentas = (data && data.cuentas) || [];
  return (
    <div className="p-3 grid gap-1">
      <div className={`text-center text-xs font-black rounded-lg py-1 mb-1 ${data.cuadrado ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'}`}>
        {data.cuadrado ? '✓ Cuadrado' : '⚠ Descuadrado'}
      </div>
      {cuentas.map((c, i) => (
        <div key={i} className="flex justify-between rounded-lg border px-3 py-2 text-xs">
          <span className="truncate">{c.nombre}</span>
          <span className="font-bold">{Number(c.deudor) ? clp(c.deudor) : '(' + clp(c.acreedor) + ')'}</span>
        </div>
      ))}
      <div className="flex justify-between font-black text-sm mt-1 px-1">
        <span>Totales</span><span>{clp(data.totalDebe)} / {clp(data.totalHaber)}</span>
      </div>
    </div>
  );
}

function Flujo({ data }) {
  const movs = (data && data.movimientos) || [];
  return (
    <div className="p-3 grid gap-2">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl p-2 bg-green-100"><div className="text-[10px] font-bold text-green-700">Entradas</div><div className="font-black text-green-700">{clp(data.entradas)}</div></div>
        <div className="rounded-xl p-2 bg-red-100"><div className="text-[10px] font-bold text-red-700">Salidas</div><div className="font-black text-red-700">{clp(data.salidas)}</div></div>
        <div className="rounded-xl p-2 bg-black/5"><div className="text-[10px] font-bold opacity-70">Neto</div><div className="font-black">{clp(data.neto)}</div></div>
      </div>
      {movs.map((m, i) => (
        <div key={i} className="flex justify-between rounded-lg border px-3 py-2 text-xs">
          <span className="truncate">{m.fecha} · {m.glosa}</span>
          <span className="font-bold">{Number(m.entrada) ? clp(m.entrada) : '(' + clp(m.salida) + ')'}</span>
        </div>
      ))}
      {!movs.length ? <div className="text-sm opacity-60">Sin movimientos de caja/banco.</div> : null}
    </div>
  );
}
