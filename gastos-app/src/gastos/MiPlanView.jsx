import { useEffect, useState } from 'react';
import { api } from './api';
import { t } from './i18n';

const GOLD = '#C9A24B';
const PANEL_URL = 'https://gastos.atikodigital.cl/panel';

// Planes pagables (mismos precios/creditos que el backend billing/planes.js).
const PLANES_UP = [
  { id: 'basico', nombre: 'Básico', creditos: 100, precio: 1000 },
  { id: 'pyme', nombre: 'Pyme', creditos: 210, precio: 24900 },
  { id: 'empresa', nombre: 'Empresa', creditos: 600, precio: 49900 },
];
function clp(n) { return '$' + Number(n || 0).toLocaleString('es-CL'); }

const PLANES = ['free', 'basico', 'pyme', 'empresa', 'ilimitado'];
function nombrePlan(plan) {
  return PLANES.includes(plan) ? t('mp.plan_' + plan) : plan;
}

function fechaCorta(v) {
  if (!v) return '';
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

// Umbral para considerar "ilimitado" — planes con un límite muy alto no muestran barra.
const LIMITE_ILIMITADO = 99_999_999;

export default function MiPlanView() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mejorando, setMejorando] = useState('');
  const [msgUp, setMsgUp] = useState('');

  async function recargar() {
    try { const s = await api.suscripcion(); setDatos(s); return s; } catch { return null; }
  }

  // Tras volver del pago (el webhook activa el plan con unos segundos de retraso):
  // reintenta unas veces hasta ver el plan pagado.
  async function verificarPago() {
    setMsgUp('Verificando tu pago…');
    for (let i = 0; i < 7; i++) {
      const s = await recargar();
      if (s && s.plan && s.plan !== 'free') { setMsgUp('¡Listo! Tu plan quedó activo: ' + nombrePlan(s.plan)); return; }
      await new Promise((r) => setTimeout(r, 3000));
    }
    setMsgUp('Si ya pagaste, tu plan se activará en breve. Vuelve a abrir "Mi Plan" en un momento.');
  }

  async function abrirUrl(url, onFinished) {
    let isNative = false;
    try { const { Capacitor } = await import('@capacitor/core'); isNative = !!(Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); } catch (_) {}
    if (isNative) {
      try {
        const { Browser } = await import('@capacitor/browser');
        const sub = await Browser.addListener('browserFinished', () => { try { sub.remove(); } catch (_) {} if (onFinished) onFinished(); });
        await Browser.open({ url });
        return;
      } catch (_) { /* cae al window.open */ }
    }
    try { window.open(url, '_blank'); } catch (_) { window.location.href = url; }
  }

  async function mejorar(plan) {
    setMsgUp(''); setMejorando(plan);
    try {
      const r = await api.crearSuscripcion(plan, 'CLP');
      if (r && r.url) { await abrirUrl(r.url, verificarPago); setMsgUp('Abrimos el pago en el navegador. Cuando termines, vuelve a la app y verificamos.'); }
      else setMsgUp('No se pudo iniciar el pago. Intenta de nuevo.');
    } catch (e) {
      setMsgUp((e && e.data && e.data.mensaje) || 'No se pudo iniciar el pago. Intenta de nuevo.');
    } finally { setMejorando(''); }
  }

  useEffect(() => {
    (async () => {
      try {
        const s = await api.suscripcion();
        setDatos(s);
      } catch {
        setError(t('mp.err_cargar'));
      } finally {
        setCargando(false);
      }
    })();
    // Al volver a la app (p.ej. tras pagar en el navegador), refresca el plan.
    const onVis = () => { if (document.visibilityState === 'visible') recargar(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', recargar);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', recargar); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function abrirPanel() {
    try {
      window.open(PANEL_URL, '_blank');
    } catch {
      window.location.href = PANEL_URL;
    }
  }

  const esIlimitado = datos && (datos.plan === 'ilimitado' || Number(datos.limite) >= LIMITE_ILIMITADO);
  const porcentaje = (!esIlimitado && datos && datos.limite > 0)
    ? Math.min(100, Math.round((Number(datos.usado) / Number(datos.limite)) * 100))
    : 0;

  return (
    <div style={{
      padding: '24px 20px',
      color: '#e5e7eb',
      fontFamily: 'inherit',
      maxWidth: 480,
      margin: '0 auto',
    }}>
      <h2 style={{ color: GOLD, fontWeight: 900, fontSize: 20, marginBottom: 20 }}>
        {t('mp.titulo')}
      </h2>

      {cargando && (
        <p style={{ opacity: 0.5, fontSize: 14 }}>{t('mp.cargando')}</p>
      )}

      {error && (
        <p style={{ color: '#ef4444', fontSize: 14 }}>{error}</p>
      )}

      {datos && !cargando && (
        <>
          {/* Estado morosa */}
          {datos.estado === 'morosa' && (
            <div style={{
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 10,
              padding: '10px 14px',
              marginBottom: 16,
              fontSize: 13,
              color: '#fca5a5',
            }}>
              {t('mp.morosa')}
            </div>
          )}

          {/* Card del plan */}
          <div style={{
            background: 'rgba(201,162,75,0.08)',
            border: '1px solid rgba(201,162,75,0.25)',
            borderRadius: 14,
            padding: '16px 18px',
            marginBottom: 16,
          }}>
            {/* Nombre del plan */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontWeight: 900, fontSize: 17, color: GOLD }}>
                {nombrePlan(datos.plan)}
              </span>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: datos.estado === 'activa' ? '#10B981' : '#f59e0b',
                background: datos.estado === 'activa' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                borderRadius: 20,
                padding: '2px 10px',
                textTransform: 'capitalize',
              }}>
                {datos.estado === 'activa' || datos.estado === 'morosa' ? t('mp.estado_' + datos.estado) : datos.estado}
              </span>
            </div>

            {/* Uso de créditos */}
            {esIlimitado ? (
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                <span style={{ color: GOLD, fontWeight: 700 }}>{t('mp.sin_limite')}</span> {t('mp.de_creditos_ciclo')}
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, marginBottom: 8, opacity: 0.85 }}>
                  {t('mp.creditos_usados')}{' '}
                  <span style={{ color: GOLD, fontWeight: 700 }}>{datos.usado}</span>
                  {' / '}
                  <span style={{ fontWeight: 600 }}>{datos.limite}</span>
                </div>
                {/* Barra de progreso */}
                <div style={{
                  height: 7,
                  borderRadius: 99,
                  background: 'rgba(255,255,255,0.10)',
                  overflow: 'hidden',
                  marginBottom: 8,
                }}>
                  <div style={{
                    height: '100%',
                    width: `${porcentaje}%`,
                    borderRadius: 99,
                    background: porcentaje >= 90 ? '#ef4444' : porcentaje >= 70 ? '#f59e0b' : GOLD,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
                <div style={{ fontSize: 12, opacity: 0.65 }}>
                  {datos.restante} {t('mp.creditos_restantes')}
                </div>
              </>
            )}

            {/* Fecha de vencimiento del ciclo */}
            {datos.ciclo_fin && (
              <div style={{ marginTop: 12, fontSize: 12, opacity: 0.55 }}>
                {t('mp.ciclo_vence')} {fechaCorta(datos.ciclo_fin)}
              </div>
            )}
          </div>

          {/* Mejorar mi plan (checkout desde el APK) */}
          {!esIlimitado && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: GOLD, marginBottom: 10 }}>Mejorar mi plan</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {PLANES_UP.filter((p) => p.id !== datos.plan).map((p) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,162,75,0.25)', borderRadius: 12, padding: '12px 14px' }}>
                    <div>
                      <div style={{ fontWeight: 800, color: '#f4f4f5' }}>{p.nombre}</div>
                      <div style={{ fontSize: 12, opacity: 0.6 }}>{p.creditos} créditos/mes · {clp(p.precio)}/mes</div>
                    </div>
                    <button onClick={() => mejorar(p.id)} disabled={!!mejorando}
                      style={{ background: GOLD, color: '#000', fontWeight: 900, fontSize: 13, border: 'none', borderRadius: 10, padding: '10px 16px', cursor: 'pointer', opacity: mejorando ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                      {mejorando === p.id ? '…' : 'Mejorar'}
                    </button>
                  </div>
                ))}
              </div>
              {msgUp && <div style={{ fontSize: 12, color: '#93c5fd', marginTop: 10, lineHeight: 1.5 }}>{msgUp}</div>}
            </div>
          )}

          {/* Nota explicativa */}
          <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 18, lineHeight: 1.5 }}>
            {t('mp.nota')}
          </p>

          {/* Botón secundario: panel web */}
          <button
            onClick={abrirPanel}
            style={{
              width: '100%',
              background: GOLD,
              color: '#000',
              fontWeight: 900,
              fontSize: 15,
              border: 'none',
              borderRadius: 12,
              padding: '14px 0',
              cursor: 'pointer',
              letterSpacing: 0.2,
            }}
          >
            {t('mp.gestionar')}
          </button>
        </>
      )}
    </div>
  );
}
