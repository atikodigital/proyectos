import { useEffect, useState } from 'react';
import { t } from './i18n';

// Plugin nativo (registrado en MainActivity como "AtikoPedido"). En web no existe.
const plugin = () => window?.Capacitor?.Plugins?.AtikoPedido || null;
const isNative = () => Boolean(window?.Capacitor?.isNativePlatform?.());

const GOLD = '#C9A24B';

function Row({ ok, label }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={ok ? 'text-green-600' : 'text-red-500'} style={{ fontWeight: 900 }}>
        {ok ? '✓' : '✗'}
      </span>
      <span className={ok ? 'opacity-90' : 'opacity-70'}>{label}</span>
    </div>
  );
}

export default function PedidoOverlaySetup() {
  const [st, setSt] = useState({ hasToken: false, accessibilityEnabled: false, overlayGranted: false });
  const [msg, setMsg] = useState('');

  async function refresh() {
    const p = plugin();
    if (!p) return;
    try { setSt(await p.status()); } catch { /* no-op */ }
  }

  useEffect(() => {
    refresh();
    // Al volver de Ajustes la app recupera el foco: re-chequear estado.
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  if (!isNative() || !plugin()) {
    return (
      <div className="p-6 grid gap-2">
        <h2 className="text-xl font-black" style={{ color: GOLD }}>{t('match.pedido_titulo')}</h2>
        <p className="text-sm opacity-70">
          {t('match.pedido_solo_android')}
        </p>
      </div>
    );
  }

  const allReady = st.accessibilityEnabled && st.overlayGranted;

  async function openAccessibility() {
    setMsg(t('match.pedido_msg_accesibilidad'));
    try { await plugin().openAccessibilitySettings(); } catch { /* no-op */ }
  }
  async function openOverlay() {
    setMsg(t('match.pedido_msg_overlay'));
    try { await plugin().openOverlaySettings(); } catch { /* no-op */ }
  }
  async function showBubble() {
    try { await plugin().refreshOverlay(); setMsg(t('match.pedido_msg_burbuja')); }
    catch { /* no-op */ }
  }

  return (
    <div className="p-6 grid gap-4 max-w-sm mx-auto">
      <div>
        <h2 className="text-xl font-black" style={{ color: GOLD }}>{t('match.pedido_titulo')}</h2>
        <p className="text-sm opacity-70 mt-1">
          {t('match.pedido_descripcion')}
        </p>
      </div>

      <div className="rounded-2xl bg-black/5 p-4 border grid gap-2">
        <Row ok={st.accessibilityEnabled} label={t('match.pedido_row_accesibilidad')} />
        <Row ok={st.overlayGranted} label={t('match.pedido_row_overlay')} />
        <Row ok={st.hasToken} label={t('match.pedido_row_sesion')} />
      </div>

      {!st.accessibilityEnabled && (
        <button onClick={openAccessibility} className="rounded-xl font-black py-3 text-black" style={{ background: GOLD }}>
          {t('match.pedido_btn_accesibilidad')}
        </button>
      )}
      {!st.overlayGranted && (
        <button onClick={openOverlay} className="rounded-xl font-black py-3 bg-black/10 border">
          {t('match.pedido_btn_overlay')}
        </button>
      )}
      {allReady && (
        <button onClick={showBubble} className="rounded-xl font-black py-3 text-black" style={{ background: GOLD }}>
          {t('match.pedido_btn_burbuja')}
        </button>
      )}

      <button onClick={refresh} className="text-xs opacity-60 underline justify-self-center">
        {t('match.pedido_btn_rechequear')}
      </button>

      {msg ? <p className="text-xs opacity-70 text-center">{msg}</p> : null}
    </div>
  );
}
