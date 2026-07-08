import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { t } from './i18n';
import { FILTRO_INICIAL, fechaDe, enPeriodo, pasaFiltros } from './movimientosFiltro';

function clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }
function fechaCorta(v) { if (!v) return ''; const s = String(v); return s.length >= 10 ? s.slice(0, 10) : s; }
const esGasto = (e) => (e.tipo === 'ingreso' ? 'ingreso' : 'gasto') === 'gasto';
const anulado = (e) => String(e.estado || '').toLowerCase() === 'anulado';

// Suma un tipo ('ingreso'|'gasto') de lo EJECUTADO en el mes actual (sin anulados).
function sumaMes(rows, tipo) {
  return rows
    .filter((e) => !anulado(e) && enPeriodo(e, 'mes') && (esGasto(e) ? 'gasto' : 'ingreso') === tipo)
    .reduce((s, e) => s + (Number(e.total) || 0), 0);
}

function Tarjeta({ titulo, monto, color, fondo }) {
  return (
    <div style={{ background: fondo, borderRadius: 12, padding: '10px 8px', border: '1px solid rgba(255,255,255,0.10)' }}>
      <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>{titulo}</div>
      <div style={{ color, fontSize: 15, fontWeight: 900, marginTop: 2, wordBreak: 'break-word' }}>{monto}</div>
    </div>
  );
}

// Panel de Control del modo personal: reemplaza la pestaña "Transaccional" (que no
// aporta a una persona natural) por un resumen mensual de ingresos/gastos + el mismo
// filtro de la pestaña Movimientos para explorar lo ejecutado.
export default function PersonalDashboard() {
  const [rows, setRows] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState(FILTRO_INICIAL);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const set = (k) => (ev) => setF((p) => ({ ...p, [k]: ev.target.value }));

  useEffect(() => {
    let alive = true;
    const cargar = () => {
      api.listExpenses().then((r) => { if (alive) setRows(Array.isArray(r) ? r : []); })
        .catch(() => {}).finally(() => { if (alive) setLoading(false); });
      api.personalResumen().then((r) => { if (alive) setResumen(r); }).catch(() => {});
    };
    cargar();
    window.addEventListener('hash:data-changed', cargar);
    return () => { alive = false; window.removeEventListener('hash:data-changed', cargar); };
  }, []);

  const ingresosMes = useMemo(() => sumaMes(rows, 'ingreso'), [rows]);
  const gastosMes = useMemo(() => sumaMes(rows, 'gasto'), [rows]);
  const balanceMes = ingresosMes - gastosMes;

  const cats = useMemo(() => [...new Set(rows.map((r) => r.categoria).filter(Boolean))].sort(), [rows]);
  const visibles = useMemo(
    () => rows.filter((e) => pasaFiltros(e, f)).sort((a, b) => fechaDe(b).localeCompare(fechaDe(a))),
    [rows, f],
  );
  const totalFiltro = useMemo(
    () => visibles.reduce((s, e) => s + (e.tipo === 'ingreso' ? 1 : -1) * (Number(e.total) || 0), 0),
    [visibles],
  );

  if (loading) return <div className="p-6">{t('panel.cargando')}</div>;

  const periodos = [['hoy', t('exp.filtro.hoy')], ['mes', t('exp.filtro.mes')], ['anio', t('exp.filtro.anio')], ['rango', t('exp.filtro.rango')], ['todos', t('exp.filtro.todos')]];
  const inp = 'rounded-lg border px-2 py-1.5 text-xs bg-white';
  const pct = resumen ? Math.min(100, Math.round(resumen.porcentaje_gastado || 0)) : 0;
  const dispNeg = resumen ? (resumen.disponible ?? 0) < 0 : false;

  return (
    <div className="h-full overflow-y-auto p-3 flex flex-col gap-3">
      {/* Ingresos / Gastos / Balance del mes */}
      <div>
        <div className="text-[11px] font-bold opacity-60 px-1 mb-1">{t('panel.titulo')} · {t('panel.del_mes')}</div>
        <div className="grid grid-cols-3 gap-2">
          <Tarjeta titulo={t('panel.ingresos')} monto={clp(ingresosMes)} color="#7CFC9B" fondo="linear-gradient(135deg,#0b3d2e,#0f5132)" />
          <Tarjeta titulo={t('panel.gastos')} monto={clp(gastosMes)} color="#ffb4a2" fondo="linear-gradient(135deg,#3a1d1d,#7a1f1f)" />
          <Tarjeta titulo={t('panel.balance')} monto={clp(balanceMes)} color={balanceMes < 0 ? '#ff6b6b' : '#E7C46B'} fondo="linear-gradient(135deg,#1f2937,#111827)" />
        </div>
      </div>

      {/* Presupuesto del mes (sueldo / disponible) */}
      {resumen ? (
        <div style={{ background: 'linear-gradient(135deg,#0b2a18,#0f3a20)', borderRadius: 12, padding: 14, border: '1px solid #1a4a28' }}>
          <div style={{ color: '#aaa', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 }}>{t('panel.presupuesto')}</div>
          <div style={{ color: dispNeg ? '#ff6b6b' : '#7CFC9B', fontSize: 24, fontWeight: 900 }}>{clp(resumen.disponible)}</div>
          <div style={{ color: '#666', fontSize: 10, marginBottom: 8 }}>{t('exp.balance.de')} {clp(resumen.sueldo_mensual)} · {t('exp.balance.gaste')} {clp(resumen.gastado_mes)}</div>
          <div style={{ height: 5, background: '#0d1f14', borderRadius: 3, overflow: 'hidden', marginBottom: 3 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#E7C46B,#c8962a)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#555', fontSize: 9 }}>
            <span>{pct}% {t('exp.balance.gastado')}</span>
            <span>{resumen.dias_restantes_mes} {t('exp.balance.dias_restantes')}</span>
          </div>
        </div>
      ) : null}

      {/* Filtro (igual que Movimientos) */}
      <div className="grid gap-2">
        <div className="flex gap-1.5 flex-wrap items-center">
          {periodos.map((o) => (
            <button key={o[0]} onClick={() => setF((p) => ({ ...p, periodo: o[0] }))} className="text-xs font-black px-3 py-1 rounded-full border" style={f.periodo === o[0] ? { background: '#C9A24B', color: '#000', borderColor: '#C9A24B' } : { opacity: 0.6 }}>{o[1]}</button>
          ))}
          <button onClick={() => setMostrarFiltros((v) => !v)} className="text-xs font-black px-3 py-1 rounded-full border" style={(mostrarFiltros || f.tipo !== 'todos' || f.categoria || f.q) ? { background: '#111827', color: '#fff', borderColor: '#111827' } : { opacity: 0.6 }}>⚙︎ {t('exp.filtro.mas')}</button>
        </div>
        {mostrarFiltros ? (
          <div className="grid gap-2 rounded-xl border p-2" style={{ background: 'rgba(0,0,0,0.02)' }}>
            {f.periodo === 'rango' ? (
              <div className="flex gap-2">
                <input type="date" value={f.desde} onChange={set('desde')} className={inp + ' flex-1'} aria-label={t('exp.filtro.desde')} />
                <input type="date" value={f.hasta} onChange={set('hasta')} className={inp + ' flex-1'} aria-label={t('exp.filtro.hasta')} />
              </div>
            ) : null}
            <select value={f.tipo} onChange={set('tipo')} className={inp} aria-label={t('exp.field.tipo')}>
              <option value="todos">{t('exp.field.tipo')}: {t('exp.filtro.todos')}</option>
              <option value="gasto">{t('exp.tipo.gasto')}</option>
              <option value="ingreso">{t('exp.tipo.ingreso')}</option>
            </select>
            {cats.length ? (
              <select value={f.categoria} onChange={set('categoria')} className={inp} aria-label={t('exp.field.categoria')}>
                <option value="">{t('exp.field.categoria')}: {t('exp.filtro.todas')}</option>
                {cats.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : null}
            <input value={f.q} onChange={set('q')} placeholder={t('exp.filtro.buscar_ph')} className={inp} />
          </div>
        ) : null}
        <div className="text-xs opacity-60 px-1"><b>{visibles.length}</b> {t('exp.filtro.movimientos')} · {t('exp.filtro.total')} <b>{clp(Math.abs(totalFiltro))}</b></div>
      </div>

      {/* Lista de movimientos del filtro */}
      {visibles.length === 0 ? (
        <p className="px-2 opacity-60 text-sm">{t('panel.sin_movimientos')}</p>
      ) : (
        <div className="grid gap-1.5">
          {visibles.map((e) => {
            const esIng = e.tipo === 'ingreso';
            return (
              <div key={e.id} className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 bg-white">
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{e.proveedor || (esIng ? t('exp.confirm.sin_pagador') : t('exp.confirm.sin_proveedor'))}</div>
                  <div className="text-[11px] opacity-55 truncate">{fechaCorta(e.fecha)}{e.categoria ? ' · ' + e.categoria : ''}</div>
                </div>
                <div className="font-black text-sm whitespace-nowrap" style={{ color: esIng ? '#0f7a3f' : '#7a1f1f' }}>{esIng ? '+' : '−'}{clp(e.total)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
