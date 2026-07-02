import { useState } from 'react';
import { api } from './api';
import { t } from './i18n';
import EvidenceIntake from '../components/EvidenceIntake.jsx';

function clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }
function fechaCorta(v) { if (!v) return ''; const s = String(v); return s.length >= 10 ? s.slice(0, 10) : s; }

const TIPO_LABEL = {
  nota_debito: t('match.tipo_nota_debito'),
  nota_credito: t('match.tipo_nota_credito'),
  deposito_transito: t('match.tipo_deposito_transito'),
  cheque_no_cobrado: t('match.tipo_cheque_no_cobrado'),
  error_empresa_mas: t('match.tipo_error_empresa'),
  error_empresa_menos: t('match.tipo_error_empresa'),
  error_banco_mas: t('match.tipo_error_banco'),
  error_banco_menos: t('match.tipo_error_banco'),
};

export default function MatchView({ embedded = false }) {
  const [busy, setBusy] = useState(false);
  const [inf, setInf] = useState(null);
  const [err, setErr] = useState('');
  const [hechos, setHechos] = useState(() => new Set());

  // SII mode state
  const [modo, setModo] = useState('banco');
  const [siiInf, setSiiInf] = useState(null);
  const [siiHechos, setSiiHechos] = useState(() => new Set());

  async function onChange(items) {
    const ev = items && items[0];
    if (!ev || !ev.imageBase64) return;
    setBusy(true); setErr('');
    if (modo === 'sii') {
      setSiiInf(null); setSiiHechos(new Set());
      try {
        const r = await api.matchLibroSii(ev.imageBase64, ev.imageMimeType || 'image/jpeg');
        setSiiInf(r);
      } catch (_e) {
        setErr(t('match.err_libro_sii'));
      } finally { setBusy(false); }
    } else {
      setInf(null); setHechos(new Set());
      try {
        const r = await api.matchCartola(ev.imageBase64, ev.imageMimeType || 'image/jpeg');
        setInf(r);
      } catch (_e) {
        setErr(t('match.err_cartola'));
      } finally { setBusy(false); }
    }
  }

  async function crearAsiento(s) {
    try {
      await api.matchConfirmarAsiento(s);
      setHechos((prev) => new Set([...prev, s.id]));
    } catch (_e) { /* noop */ }
  }

  async function crearMovimiento(f, i) {
    try { await api.matchCrearMovimiento(f); setSiiHechos((p) => new Set([...p, i])); } catch (_e) { /* noop */ }
  }

  return (
    <div className={`flex flex-col gap-2 ${embedded ? 'px-4 pt-2 pb-4' : 'p-4 pb-28'}`}>
      <h2 className="text-xl font-black shrink-0" style={{ color: '#b91c1c' }}>{t('match.titulo')}</h2>
      <p className="text-xs opacity-70 shrink-0">{t('match.subtitulo')}</p>

      {/* Selector de modo */}
      <div className="flex gap-1 shrink-0">
        <button onClick={() => setModo('banco')} className={`flex-1 text-xs font-bold px-3 py-1.5 rounded-lg border ${modo === 'banco' ? 'text-white bg-[#b91c1c] border-[#b91c1c]' : 'opacity-60'}`}>{t('match.modo_cartola')}</button>
        <button onClick={() => setModo('sii')} className={`flex-1 text-xs font-bold px-3 py-1.5 rounded-lg border ${modo === 'sii' ? 'text-white bg-[#b91c1c] border-[#b91c1c]' : 'opacity-60'}`}>{t('match.modo_sii')}</button>
      </div>

      <div className="shrink-0">
        <EvidenceIntake maxEvidence={1} value={[]} onChange={onChange} showNativeCapture />
      </div>
      {busy ? <div className="text-sm font-bold py-2" style={{ color: '#b91c1c' }}>{modo === 'sii' ? t('match.analizando_sii') : t('match.analizando_cartola')}</div> : null}
      {err ? <div className="text-sm" style={{ color: '#ff8a8a' }}>{err}</div> : null}

      {/* Informe bancario (modo banco) */}
      {modo === 'banco' && inf ? (
        <div className="grid gap-3 pt-1">
          {/* Tarjeta SCA vs SBA */}
          <div className="rounded-2xl border p-3" style={{ borderColor: inf.cuadrado ? '#1f7a3f55' : '#b91c1c55' }}>
            <div className={`text-center text-xs font-black rounded-lg py-1 mb-2 ${inf.cuadrado ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'}`}>
              {inf.cuadrado ? t('match.banco_cuadrado') : t('match.diferencia_de') + ' ' + clp(inf.brecha)}
            </div>
            <div className="grid grid-cols-2 gap-2 text-center text-sm">
              <div><div className="text-[10px] font-bold opacity-60">{t('match.saldo_contable')}</div><div className="font-black">{clp(inf.sca)}</div></div>
              <div><div className="text-[10px] font-bold opacity-60">{t('match.saldo_banco')}</div><div className="font-black">{clp(inf.sba)}</div></div>
            </div>
            <div className="text-[10px] opacity-50 text-center mt-1">{inf.matched ? inf.matched.length : 0} {t('match.movimientos_conciliados')} · {t('match.analisis')} {inf.fuente === 'ia' ? t('match.analisis_ia') : t('match.analisis_automatico')}</div>
          </div>

          {/* Asientos sugeridos */}
          {(inf.suggested || []).length ? (
            <div className="grid gap-2">
              <div className="text-xs font-black opacity-70">{t('match.ajustes_propongo')}</div>
              {inf.suggested.map((s) => {
                const done = hechos.has(s.id);
                return (
                  <div key={s.id} className="rounded-xl border p-3 text-sm" style={{ borderColor: '#C9A24B55' }}>
                    <div className="flex justify-between gap-2">
                      <span className="font-bold truncate">{s.descripcion}</span>
                      <span className="font-black">{clp(s.monto)}</span>
                    </div>
                    <div className="text-[11px] opacity-60">{TIPO_LABEL[s.tipo] || t('match.ajuste')} · {fechaCorta(s.fecha)}</div>
                    {done ? <div className="text-xs font-bold mt-1" style={{ color: '#1f7a3f' }}>{t('match.asiento_creado')}</div>
                          : <button onClick={() => crearAsiento(s)} className="mt-2 rounded-lg text-black font-black text-xs px-3 py-1.5" style={{ background: '#C9A24B' }}>{t('match.crear_asiento')}</button>}
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Partidas en tránsito / informativas (las que no son sugerencia con asiento) */}
          {(inf.partidas || []).filter((p) => p.tipo === 'deposito_transito' || p.tipo === 'cheque_no_cobrado').length ? (
            <div className="grid gap-1">
              <div className="text-xs font-black opacity-70">{t('match.en_transito')}</div>
              {inf.partidas.filter((p) => p.tipo === 'deposito_transito' || p.tipo === 'cheque_no_cobrado').map((p, i) => (
                <div key={i} className="flex justify-between rounded-lg border px-3 py-2 text-xs">
                  <span className="truncate">{TIPO_LABEL[p.tipo]} · {p.glosa || ''}</span>
                  <span className="font-bold">{clp(p.monto)}</span>
                </div>
              ))}
            </div>
          ) : null}

          {/* Excepciones */}
          {(inf.exceptions || []).length ? (
            <div className="grid gap-1">
              <div className="text-xs font-black" style={{ color: '#b91c1c' }}>{t('match.requiere_revision')}</div>
              {inf.exceptions.map((e, i) => (
                <div key={i} className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: '#b91c1c55' }}>
                  {e.glosa || t('match.movimiento')} · {clp(e.monto)}{e.motivo ? ' — ' + e.motivo : ''}
                </div>
              ))}
            </div>
          ) : null}

          {(inf.suggested || []).length + (inf.partidas || []).length + (inf.exceptions || []).length === 0 ? (
            <div className="opacity-60 text-sm">{t('match.todo_cuadra')}</div>
          ) : null}
        </div>
      ) : null}

      {/* Informe SII (modo sii) */}
      {modo === 'sii' && siiInf ? (
        <div className="grid gap-3 pt-1">
          <div className="rounded-2xl border p-3" style={{ borderColor: '#C9A24B55' }}>
            <div className="text-xs font-black mb-1">{t('match.cuadre_iva')}</div>
            <div className="grid grid-cols-2 gap-2 text-center text-sm">
              <div><div className="text-[10px] opacity-60">{t('match.iva_credito')}</div><div className="font-black">{clp(siiInf.iva.creditoContable)} <span className="opacity-50">/ SII {clp(siiInf.iva.creditoSii)}</span></div></div>
              <div><div className="text-[10px] opacity-60">{t('match.iva_debito')}</div><div className="font-black">{clp(siiInf.iva.debitoContable)} <span className="opacity-50">/ SII {clp(siiInf.iva.debitoSii)}</span></div></div>
            </div>
            <div className="text-center text-sm font-black mt-2">{t('match.iva_a_pagar')}: {clp(siiInf.iva.ivaPagarSii)}</div>
            {siiInf.iva.diferenciaCredito ? <div className="text-[11px] text-center mt-1" style={{ color: '#C9A24B' }}>{t('match.te_falta_registrar')} {clp(siiInf.iva.diferenciaCredito)} {t('match.de_iva_credito')}</div> : null}
          </div>
          {(siiInf.faltantes || []).length ? (
            <div className="grid gap-2">
              <div className="text-xs font-black opacity-70">{t('match.falta_capturar')}</div>
              {siiInf.faltantes.map((f, i) => {
                const done = siiHechos.has(i);
                return (
                  <div key={i} className="rounded-xl border p-3 text-sm" style={{ borderColor: '#C9A24B55' }}>
                    <div className="flex justify-between gap-2"><span className="font-bold truncate">{f.clase === 'venta' ? t('match.venta') : t('match.compra')} · {t('match.folio')} {f.folio}</span><span className="font-black">{clp(f.total)}</span></div>
                    <div className="text-[11px] opacity-60">{f.rut} · {fechaCorta(f.fecha)}</div>
                    {done ? <div className="text-xs font-bold mt-1" style={{ color: '#1f7a3f' }}>{t('match.registrado')}</div>
                          : <button onClick={() => crearMovimiento(f, i)} className="mt-2 rounded-lg text-black font-black text-xs px-3 py-1.5" style={{ background: '#C9A24B' }}>{f.clase === 'venta' ? t('match.crear_ingreso') : t('match.crear_gasto')}</button>}
                  </div>
                );
              })}
            </div>
          ) : <div className="opacity-60 text-sm">{t('match.todo_sii_registrado')}</div>}
          {(siiInf.sobrantes || []).length ? (
            <div className="grid gap-1">
              <div className="text-xs font-black opacity-70">{t('match.en_contabilidad_no_sii')}</div>
              {siiInf.sobrantes.map((s, i) => (
                <div key={i} className="flex justify-between rounded-lg border px-3 py-2 text-xs">
                  <span className="truncate">{s.proveedor || t('match.proveedor')} · {t('match.folio')} {s.folio || ''}</span>
                  <span className="font-bold">{clp(s.total)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
