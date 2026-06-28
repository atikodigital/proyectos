import { useState, useEffect } from 'react';
import { api } from './api';
import { t } from './i18n';
import MatchView from './MatchView.jsx';
import AsientoManual from './AsientoManual.jsx';
import VarasChat from './VarasChat.jsx';

const ORO = '#C9A24B';
function clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }
function ymActual() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }

const TABS = [
  { id: 'varas', labelKey: 'con.tab_varas' },
  { id: 'concil', labelKey: 'con.tab_concil' },
  { id: 'diario', labelKey: 'con.tab_diario' },
  { id: 'mayor', labelKey: 'con.tab_mayor' },
  { id: 'balance', labelKey: 'con.tab_balance' },
  { id: 'flujo', labelKey: 'con.tab_flujo' },
  { id: 'manual', labelKey: 'con.tab_manual' },
];

export default function ContabilidadView({ initialTab = 'varas' }) {
  const [tab, setTab] = useState(initialTab);
  const [periodo, setPeriodo] = useState(ymActual());
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);

  function recargar() { setRefreshCount((n) => n + 1); }

  useEffect(() => {
    if (tab === 'varas' || tab === 'concil' || tab === 'manual') { setData(null); return; }
    let vivo = true;
    setBusy(true); setData(null);
    const fn = tab === 'diario' ? api.contabilidadDiario
      : tab === 'mayor' ? api.contabilidadMayor
      : tab === 'balance' ? api.contabilidadBalance
      : api.contabilidadFlujo;
    Promise.resolve(fn(periodo)).then((r) => { if (vivo) setData(r); }).catch(() => { if (vivo) setData({ error: true }); }).finally(() => { if (vivo) setBusy(false); });
    return () => { vivo = false; };
  }, [tab, periodo, refreshCount]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-3 pb-1 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black" style={{ color: ORO }}>{t('con.titulo')}</h2>
          {tab !== 'concil' && tab !== 'varas' ? (
            <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="text-xs border rounded px-2 py-1" />
          ) : null}
        </div>
        <div className="flex gap-1 overflow-x-auto mt-2 pb-1">
          {TABS.map((t_) => (
            <button key={t_.id} onClick={() => setTab(t_.id)}
              className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border ${tab === t_.id ? 'text-white' : 'opacity-60'}`}
              style={tab === t_.id ? { background: ORO, borderColor: ORO } : {}}>
              {t(t_.labelKey)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'varas' ? <VarasChat />
          : tab === 'concil' ? <MatchView />
          : tab === 'manual' ? <AsientoManual onSaved={() => setTab('diario')} />
          : busy ? <div className="p-4 text-sm opacity-70">{t('con.cargando')}</div>
          : !data || data.error ? <div className="p-4 text-sm opacity-70">{t('con.error_periodo')}</div>
          : tab === 'diario' ? <Diario data={data} onAnular={recargar} />
          : tab === 'mayor' ? <Mayor data={data} />
          : tab === 'balance' ? <Balance data={data} />
          : <Flujo data={data} />}
      </div>
    </div>
  );
}

function Diario({ data, onAnular }) {
  const asientos = (data && data.asientos) || [];
  if (!asientos.length) return <div className="p-4 text-sm opacity-60">{t('con.sin_asientos')}</div>;
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
          {a.id ? <button onClick={async () => { try { await api.anularAsiento(a.id); onAnular && onAnular(); } catch (_) {} }} className="mt-1 text-[11px] font-bold text-red-600">{t('con.anular')}</button> : null}
        </div>
      ))}
    </div>
  );
}

function Mayor({ data }) {
  const cuentas = (data && data.cuentas) || [];
  if (!cuentas.length) return <div className="p-4 text-sm opacity-60">{t('con.sin_movimientos')}</div>;
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
        {data.cuadrado ? '✓ ' + t('con.cuadrado') : '⚠ ' + t('con.descuadrado')}
      </div>
      {cuentas.map((c, i) => (
        <div key={i} className="flex justify-between rounded-lg border px-3 py-2 text-xs">
          <span className="truncate">{c.nombre}</span>
          <span className="font-bold">{Number(c.deudor) ? clp(c.deudor) : '(' + clp(c.acreedor) + ')'}</span>
        </div>
      ))}
      <div className="flex justify-between font-black text-sm mt-1 px-1">
        <span>{t('con.totales')}</span><span>{clp(data.totalDebe)} / {clp(data.totalHaber)}</span>
      </div>
    </div>
  );
}

function Flujo({ data }) {
  const movs = (data && data.movimientos) || [];
  return (
    <div className="p-3 grid gap-2">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl p-2 bg-green-100"><div className="text-[10px] font-bold text-green-700">{t('con.entradas')}</div><div className="font-black text-green-700">{clp(data.entradas)}</div></div>
        <div className="rounded-xl p-2 bg-red-100"><div className="text-[10px] font-bold text-red-700">{t('con.salidas')}</div><div className="font-black text-red-700">{clp(data.salidas)}</div></div>
        <div className="rounded-xl p-2 bg-black/5"><div className="text-[10px] font-bold opacity-70">{t('con.neto')}</div><div className="font-black">{clp(data.neto)}</div></div>
      </div>
      {movs.map((m, i) => (
        <div key={i} className="flex justify-between rounded-lg border px-3 py-2 text-xs">
          <span className="truncate">{m.fecha} · {m.glosa}</span>
          <span className="font-bold">{Number(m.entrada) ? clp(m.entrada) : '(' + clp(m.salida) + ')'}</span>
        </div>
      ))}
      {!movs.length ? <div className="text-sm opacity-60">{t('con.sin_caja_banco')}</div> : null}
    </div>
  );
}
