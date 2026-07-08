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

function getCategoryEmoji(catName) {
  const name = String(catName || '').toLowerCase();
  if (name.includes('aliment') || name.includes('restaurante') || name.includes('comida') || name.includes('almuerzo') || name.includes('supermercado')) return '🍔';
  if (name.includes('entret') || name.includes('diversi') || name.includes('ocio') || name.includes('cine') || name.includes('juego') || name.includes('suscrip')) return '🎭';
  if (name.includes('combust') || name.includes('transp') || name.includes('auto') || name.includes('bencina') || name.includes('peaje') || name.includes('uber') || name.includes('metro')) return '🚗';
  if (name.includes('arriendo') || name.includes('alquiler') || name.includes('dividendo') || name.includes('casa') || name.includes('depto') || name.includes('hogar')) return '🏠';
  if (name.includes('servicio') || name.includes('luz') || name.includes('agua') || name.includes('internet') || name.includes('gas') || name.includes('celular') || name.includes('telefono')) return '💡';
  if (name.includes('oficina') || name.includes('librer') || name.includes('util') || name.includes('papel') || name.includes('generales')) return '✏️';
  if (name.includes('seguro') || name.includes('salud') || name.includes('clinica') || name.includes('isapre') || name.includes('fonasa')) return '🛡️';
  if (name.includes('publici') || name.includes('promoc') || name.includes('mkt')) return '📣';
  if (name.includes('honorario') || name.includes('sueldo') || name.includes('pago')) return '💼';
  if (name.includes('impuesto') || name.includes('contrib') || name.includes('patente') || name.includes('sii')) return '🏛️';
  if (name.includes('financier') || name.includes('banco') || name.includes('interes') || name.includes('credito') || name.includes('comision')) return '💳';
  if (name.includes('salud') || name.includes('medic') || name.includes('farmacia') || name.includes('doctor')) return '🩺';
  if (name.includes('ropa') || name.includes('vest') || name.includes('calzado') || name.includes('tienda') || name.includes('mall')) return '👕';
  if (name.includes('insumo') || name.includes('mercader') || name.includes('compra')) return '📦';
  return '🏷️';
}

function Tarjeta({ titulo, monto, color, fondo, subtexto }) {
  const dynamicFontSize = monto.length > 8 ? 13 : 15.5;
  return (
    <div style={{ background: fondo, borderRadius: 16, padding: '14px 10px', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} className="transition-all duration-200 hover:scale-[1.02]">
      <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>{titulo}</div>
      <div style={{ color, fontSize: dynamicFontSize, fontWeight: 900, marginTop: 4, whiteSpace: 'nowrap', fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.3px' }}>{monto}</div>
      {subtexto && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, marginTop: 4, whiteSpace: 'nowrap' }}>{subtexto}</div>}
    </div>
  );
}

export default function PersonalDashboard() {
  const [rows, setRows] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState(FILTRO_INICIAL);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [exportando, setExportando] = useState(false);
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

  // Sumas del mes (Ingresos considera el sueldo mensual del resumen para no quedar en negativo)
  const ingresosMes = useMemo(() => {
    const sueldo = Number(resumen?.sueldo_mensual) || 0;
    return sueldo + sumaMes(rows, 'ingreso');
  }, [rows, resumen]);

  const gastosMes = useMemo(() => sumaMes(rows, 'gasto'), [rows]);
  const balanceMes = ingresosMes - gastosMes;

  // Gastos por categoría este mes
  const gastosPorCategoria = useMemo(() => {
    const mapa = {};
    rows.forEach((e) => {
      if (!anulado(e) && esGasto(e) && enPeriodo(e, 'mes')) {
        const cat = e.categoria || 'Otros gastos';
        mapa[cat] = (mapa[cat] || 0) + (Number(e.total) || 0);
      }
    });
    const totalGasto = Object.values(mapa).reduce((a, b) => a + b, 0);
    return Object.entries(mapa)
      .map(([categoria, total]) => ({
        categoria,
        total,
        porcentaje: totalGasto > 0 ? Math.round((total / totalGasto) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);

  // Filtros dinámicos (igual que Movimientos)
  const cats = useMemo(() => [...new Set(rows.map((r) => r.categoria).filter(Boolean))].sort(), [rows]);
  const estados = useMemo(() => [...new Set(rows.map((r) => String(r.estado || '').toLowerCase()).filter(Boolean))], [rows]);
  const visibles = useMemo(
    () => rows.filter((e) => pasaFiltros(e, f)).sort((a, b) => fechaDe(b).localeCompare(fechaDe(a))),
    [rows, f],
  );
  const totalFiltro = useMemo(
    () => visibles.reduce((s, e) => s + (e.tipo === 'ingreso' ? 1 : -1) * (Number(e.total) || 0), 0),
    [visibles],
  );
  const hayFiltros = f.periodo !== 'mes' || f.tipo !== 'todos' || f.estado !== 'todos' || !!f.categoria || !!f.q || !!f.desde || !!f.hasta;

  async function descargarExcel() {
    if (!visibles.length || exportando) return;
    setExportando(true);
    try { await api.exportExpensesAbrir(visibles.map((e) => e.id)); } finally { setExportando(false); }
  }

  if (loading) return <div className="p-6 text-center text-sm font-semibold text-slate-500">{t('panel.cargando')}</div>;

  const periodos = [['hoy', t('exp.filtro.hoy')], ['mes', t('exp.filtro.mes')], ['anio', t('exp.filtro.anio')], ['rango', t('exp.filtro.rango')], ['todos', t('exp.filtro.todos')]];
  const inp = 'rounded-xl border border-slate-200 px-3 py-2 text-xs bg-white text-slate-700 outline-none focus:border-[#C9A24B] focus:ring-1 focus:ring-[#C9A24B]';
  const pct = resumen ? Math.min(100, Math.round(resumen.porcentaje_gastado || 0)) : 0;
  const dispNeg = resumen ? (resumen.disponible ?? 0) < 0 : false;

  return (
    <div className="h-full overflow-y-auto p-4 flex flex-col gap-4 bg-slate-50/30">
      {/* Resumen de Presupuesto (Sueldo / Disponible) - Hero Card */}
      {resumen ? (
        <div className="relative overflow-hidden rounded-2xl border border-emerald-100/50 p-5 shadow-lg bg-gradient-to-br from-[#0c2f1e] to-[#0f4d30] text-white">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="text-[10px] font-black tracking-widest text-emerald-300/80 uppercase mb-1">{t('panel.presupuesto')}</div>
          <div className={`text-3xl font-black ${dispNeg ? 'text-rose-300' : 'text-emerald-300'} tracking-tight`}>
            {clp(resumen.disponible)}
          </div>
          <div className="text-xs text-slate-300/90 mt-1 mb-4">
            {t('exp.balance.de')} <b className="text-white">{clp(resumen.sueldo_mensual)}</b> · {t('exp.balance.gaste')} <b className="text-white">{clp(resumen.gastado_mes)}</b>
          </div>
          <div className="relative w-full h-2.5 bg-[#0a1e14] rounded-full overflow-hidden mb-2">
            <div style={{ width: `${pct}%` }} className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 rounded-full transition-all duration-500" />
          </div>
          <div className="flex justify-between items-center text-[10.5px] text-slate-300/90 font-bold">
            <span className="bg-white/10 px-2 py-0.5 rounded-full">{pct}% {t('exp.balance.gastado')}</span>
            <span>⏱️ {resumen.dias_restantes_mes} {t('exp.balance.dias_restantes')}</span>
          </div>
        </div>
      ) : null}

      {/* Ingresos / Gastos / Balance del mes */}
      <div>
        <div className="text-[11px] font-bold text-slate-400 px-1 mb-2 tracking-wider uppercase">{t('panel.titulo')} · {t('panel.del_mes')}</div>
        <div className="grid grid-cols-3 gap-2.5">
          <Tarjeta titulo={t('panel.ingresos')} monto={clp(ingresosMes)} color="#a7f3d0" fondo="linear-gradient(135deg,#064e3b,#065f46)" subtexto={resumen?.sueldo_mensual ? `${t('exp.balance.de')} ${clp(resumen.sueldo_mensual)}` : null} />
          <Tarjeta titulo={t('panel.gastos')} monto={clp(gastosMes)} color="#fecdd3" fondo="linear-gradient(135deg,#6b21a8,#9f1239)" />
          <Tarjeta titulo={t('panel.balance')} monto={clp(balanceMes)} color={balanceMes < 0 ? '#fda4af' : '#fef08a'} fondo="linear-gradient(135deg,#1e293b,#0f172a)" />
        </div>
      </div>

      {/* Gastos por Categoría */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="text-xs font-bold text-slate-800 mb-1 font-black">Distribución por Categorías</div>
        <div className="text-[10px] text-slate-400 mb-3 font-semibold">Tus consumos y gastos en el mes en curso</div>
        {gastosPorCategoria.length === 0 ? (
          <p className="text-xs text-slate-400 italic text-center py-2">No se registran gastos este mes</p>
        ) : (
          <div className="grid gap-3">
            {gastosPorCategoria.map((c) => {
              const emoji = getCategoryEmoji(c.categoria);
              return (
                <div key={c.categoria} className="grid gap-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="text-base">{emoji}</span>
                      {c.categoria}
                    </span>
                    <span className="text-slate-500 font-bold">
                      {clp(c.total)} <span className="text-[10px] opacity-60 font-medium">({c.porcentaje}%)</span>
                    </span>
                  </div>
                  <div className="relative w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div style={{ width: `${c.porcentaje}%` }} className="h-full bg-gradient-to-r from-amber-400 to-[#C9A24B] rounded-full" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filtros de la pestaña de Movimientos (Duplicados idénticos) */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm grid gap-3">
        <div className="text-xs font-bold text-slate-800 tracking-wide font-black">Filtros de Movimientos</div>
        <div className="flex gap-1.5 flex-wrap items-center">
          {periodos.map((o) => (
            <button key={o[0]} onClick={() => setF((p) => ({ ...p, periodo: o[0] }))} className="text-xs font-bold px-3.5 py-1.5 rounded-full border transition-all duration-150" style={f.periodo === o[0] ? { background: '#C9A24B', color: '#000', borderColor: '#C9A24B' } : { opacity: 0.6, background: '#f8fafc', color: '#334155' }}>{o[1]}</button>
          ))}
          <button onClick={() => setMostrarFiltros((v) => !v)} className="text-xs font-bold px-3.5 py-1.5 rounded-full border transition-all duration-150" style={(mostrarFiltros || f.tipo !== 'todos' || f.estado !== 'todos' || f.categoria || f.q) ? { background: '#111827', color: '#fff', borderColor: '#111827' } : { opacity: 0.6, background: '#f8fafc', color: '#334155' }}>⚙︎ {t('exp.filtro.mas')}</button>
          <button onClick={descargarExcel} disabled={exportando || !visibles.length} className="text-xs font-bold text-white rounded-full px-3.5 py-1.5 border transition-all duration-150 disabled:opacity-40" style={{ background: '#137333', borderColor: '#137333' }}>{t('exp.filtro.excel')}</button>
        </div>
        {mostrarFiltros ? (
          <div className="grid gap-2.5 rounded-xl border border-slate-100 p-3 bg-slate-50/50">
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
        <div className="flex items-center gap-2 text-xs">
          <span className="opacity-60 flex-1"><b>{visibles.length}</b> {t('exp.filtro.movimientos')} · {t('exp.filtro.total')} <b>{clp(Math.abs(totalFiltro))}</b></span>
          {hayFiltros ? <button onClick={() => { setF(FILTRO_INICIAL); setMostrarFiltros(false); }} className="font-bold text-amber-700">{t('exp.filtro.limpiar')}</button> : null}
        </div>
      </div>

      {/* Lista de movimientos del filtro */}
      {visibles.length === 0 ? (
        <p className="px-2 opacity-60 text-xs italic text-center py-4">{t('panel.sin_movimientos')}</p>
      ) : (
        <div className="grid gap-2">
          {visibles.map((e) => {
            const esIng = e.tipo === 'ingreso';
            const emoji = getCategoryEmoji(e.categoria);
            return (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 px-4 py-3 bg-white shadow-sm transition-all duration-150 hover:bg-slate-50">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-lg flex-shrink-0">
                    {emoji}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-800 truncate">{e.proveedor || (esIng ? t('exp.confirm.sin_pagador') : t('exp.confirm.sin_proveedor'))}</div>
                    <div className="text-[10.5px] text-slate-400 font-medium truncate">{fechaCorta(e.fecha)}{e.categoria ? ' · ' + e.categoria : ''}</div>
                  </div>
                </div>
                <div className="font-black text-sm whitespace-nowrap" style={{ color: esIng ? '#0f7a3f' : '#b91c1c' }}>{esIng ? '+' : '−'}{clp(e.total)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
