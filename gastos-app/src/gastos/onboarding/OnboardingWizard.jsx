import React, { useEffect, useState } from 'react';
import { api } from '../api';
import ProductosView from '../ProductosView.jsx';

const GOLD = '#C9A24B';
const PASOS = ['Tu negocio', 'Tu catálogo', 'IVA', 'Despacho', 'Conecta WhatsApp', '¡Listo!'];

export default function OnboardingWizard({ onDone, onSkip, onIrAlChat, onCrearPedido }) {
  const [i, setI] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState('');
  const [nombre, setNombre] = useState('');
  const [giro, setGiro] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [nProductos, setNProductos] = useState(0);
  const [ivaIncluido, setIvaIncluido] = useState(true);
  const [haceDelivery, setHaceDelivery] = useState(false);
  const [costoEnvio, setCostoEnvio] = useState('');
  const [gratisDesde, setGratisDesde] = useState('');
  const [bspStatus, setBspStatus] = useState(null); // {app_id, app_secret_configured, embedded_signup_config_id, connected_whatsapp}
  const [esStatus, setEsStatus] = useState({ text: '', kind: '' }); // mensaje del flujo Embedded Signup

  useEffect(() => {
    (async () => {
      try {
        const c = await api.getCompany();
        setNombre(c?.nombre || ''); setGiro(c?.giro || ''); setWhatsapp(c?.owner_whatsapp || '');
        const cfg = await api.getPedidoConfig();
        if (cfg && cfg.pedido_iva_incluido != null) setIvaIncluido(!!cfg.pedido_iva_incluido);
        const prods = await api.listProducts(true);
        setNProductos((prods || []).length);
      } catch (e) { /* sigue con defaults */ }
      setCargando(false);
    })();
  }, []);

  async function guardarNegocio() {
    setErr('');
    if (!nombre.trim()) { setErr('Pon el nombre de tu negocio'); return false; }
    try { await api.updateCompany({ nombre: nombre.trim(), giro: giro.trim(), owner_whatsapp: whatsapp.trim() }); return true; }
    catch (e) { setErr('No pude guardar, reintenta'); return false; }
  }
  async function guardarIva() { try { await api.setPedidoConfig({ pedido_iva_incluido: ivaIncluido }); return true; } catch { setErr('No pude guardar el IVA'); return false; } }
  async function guardarDespacho() {
    try {
      const delivery = haceDelivery
        ? { zonas: [{ id: 'general', nombre: 'Despacho', costo: Math.max(0, Math.round(Number(costoEnvio) || 0)), comunas: [] }], gratis_desde: gratisDesde === '' ? null : Math.max(0, Math.round(Number(gratisDesde) || 0)) }
        : { zonas: [], gratis_desde: null };
      await api.setPedidoConfig({ delivery });
      return true;
    } catch { setErr('No pude guardar el despacho'); return false; }
  }

  async function siguiente() {
    if (i === 0) { if (!(await guardarNegocio())) return; }
    if (i === 1) { try { setNProductos((await api.listProducts(true) || []).length); } catch {} }
    if (i === 2) { if (!(await guardarIva())) return; }
    if (i === 3) { if (!(await guardarDespacho())) return; }
    if (i === 4) {
      // Al entrar al paso "Conecta WhatsApp" cargamos el status. (Saltar es válido.)
      try { setBspStatus(await api.bspStatus()); } catch {}
    }
    setI((x) => Math.min(PASOS.length - 1, x + 1));
  }
  // Refrescar bspStatus cuando lleguemos al paso 4
  useEffect(() => {
    if (i === 4 && !bspStatus) {
      api.bspStatus().then(setBspStatus).catch(() => {});
    }
  }, [i, bspStatus]);

  // ── Embedded Signup helpers ─────────────────────────────────────
  function loadFB() {
    return new Promise((resolve) => {
      if (window.FB) return resolve(window.FB);
      window.fbAsyncInit = function () {
        window.FB.init({
          appId: (bspStatus && bspStatus.app_id) || '1984026305635037',
          cookie: false, xfbml: false,
          version: (bspStatus && bspStatus.graph_version) || 'v20.0',
        });
        resolve(window.FB);
      };
      const s = document.createElement('script');
      s.async = true; s.defer = true; s.crossOrigin = 'anonymous';
      s.src = 'https://connect.facebook.net/en_US/sdk.js';
      document.body.appendChild(s);
    });
  }
  async function connectWA() {
    setEsStatus({ text: 'Abriendo Embedded Signup de WhatsApp…', kind: '' });
    const FB = await loadFB();
    const configId = bspStatus && bspStatus.embedded_signup_config_id;
    if (!configId) {
      setEsStatus({
        text: '⚠️ Falta config_id de Embedded Signup. El admin debe crear la configuración en developers.facebook.com → Atiko Agente → WhatsApp → Embedded Signup y agregar META_WA_ES_CONFIG_ID al .env del servidor.',
        kind: 'err',
      });
      return;
    }
    let session = {};
    function onMsg(ev) {
      if (ev.origin !== 'https://www.facebook.com' && ev.origin !== 'https://web.facebook.com') return;
      try {
        const data = JSON.parse(ev.data);
        if (data.type === 'WA_EMBEDDED_SIGNUP') {
          session = data.data || {};
          if (data.event === 'FINISH') window.removeEventListener('message', onMsg);
        }
      } catch (_) {}
    }
    window.addEventListener('message', onMsg);
    FB.login(async (resp) => {
      if (!resp.authResponse || !resp.authResponse.code) {
        setEsStatus({ text: '✕ Autorización cancelada.', kind: 'err' });
        return;
      }
      let phoneId = session.phone_number_id;
      const wabaId = session.waba_id;
      if (!phoneId) {
        phoneId = window.prompt('Pega el phone_number_id (no se pudo extraer automáticamente):');
        if (!phoneId) { setEsStatus({ text: '✕ Sin phone_number_id no se puede conectar.', kind: 'err' }); return; }
      }
      try {
        setEsStatus({ text: 'Guardando conexión…', kind: '' });
        await api.connectWhatsApp({ code: resp.authResponse.code, phone_number_id: phoneId, waba_id: wabaId, label: 'WhatsApp Hash' });
        setEsStatus({ text: '✓ WhatsApp conectado (phone_number_id: ' + phoneId + ').', kind: 'ok' });
        try { setBspStatus(await api.bspStatus()); } catch {}
      } catch (e) {
        setEsStatus({ text: '✕ ' + (e.data && e.data.error || e.message || 'Error'), kind: 'err' });
      }
    }, { config_id: configId, response_type: 'code', override_default_response_type: true });
  }
  async function connectFB() {
    setEsStatus({ text: 'Abriendo login de Facebook…', kind: '' });
    const FB = await loadFB();
    FB.login(async (resp) => {
      if (!resp.authResponse || !resp.authResponse.accessToken) {
        setEsStatus({ text: '✕ Cancelado.', kind: 'err' });
        return;
      }
      try {
        const r = await api.connectFacebook({ userToken: resp.authResponse.accessToken });
        const lista = (r.conectadas || []).map((c) => c.page_name).join(', ');
        setEsStatus({ text: '✓ Páginas conectadas: ' + (lista || 'ninguna'), kind: 'ok' });
      } catch (e) {
        setEsStatus({ text: '✕ ' + (e.data && e.data.error || e.message || 'Error'), kind: 'err' });
      }
    }, {
      scope: 'pages_show_list,pages_messaging,pages_manage_metadata,pages_read_engagement,instagram_basic,instagram_manage_messages,business_management',
      return_scopes: true,
    });
  }
  async function terminar() { try { await api.updateCompany({ onboarded: true }); } catch {} onDone && onDone(); }

  if (cargando) return <div style={{ padding: 24, color: '#cfeaf3' }}>Cargando…</div>;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0f', color: '#e7eef2', overflowY: 'auto', zIndex: 50, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Paso {i + 1} de {PASOS.length}</div>
        <button onClick={() => onSkip && onSkip()} style={{ background: 'transparent', color: '#9aa', border: 0 }}>Saltar por ahora</button>
      </div>
      <div style={{ height: 4, background: '#ffffff14', borderRadius: 4, margin: '10px 0 18px' }}>
        <div style={{ width: `${((i + 1) / PASOS.length) * 100}%`, height: '100%', background: GOLD, borderRadius: 4 }} />
      </div>

      {i === 0 && (
        <div>
          <h2 style={{ color: GOLD }}>Tu negocio</h2>
          <input placeholder="Nombre de tu negocio" value={nombre} onChange={(e) => setNombre(e.target.value)} style={inp} />
          <input placeholder="Rubro (ej. pastelería)" value={giro} onChange={(e) => setGiro(e.target.value)} style={inp} />
          <input placeholder="WhatsApp del dueño (569…)" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} style={inp} />
        </div>
      )}
      {i === 1 && (
        <div>
          <h2 style={{ color: GOLD }}>Tu catálogo</h2>
          <p style={{ fontSize: 13, opacity: 0.75 }}>Cárgalos por foto, por voz con KALY o a mano. Llevas {nProductos}.</p>
          <ProductosView />
        </div>
      )}
      {i === 2 && (
        <div>
          <h2 style={{ color: GOLD }}>IVA</h2>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
            <input type="checkbox" checked={ivaIncluido} onChange={(e) => setIvaIncluido(e.target.checked)} />
            Mis precios YA incluyen IVA
          </label>
          <p style={{ fontSize: 12, opacity: 0.6 }}>Si lo desmarcas, al pedido se le agrega 19%.</p>
        </div>
      )}
      {i === 3 && (
        <div>
          <h2 style={{ color: GOLD }}>Despacho</h2>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" checked={haceDelivery} onChange={(e) => setHaceDelivery(e.target.checked)} /> Hago delivery
          </label>
          {haceDelivery && (
            <div style={{ marginTop: 10 }}>
              <input placeholder="Costo del despacho" type="number" value={costoEnvio} onChange={(e) => setCostoEnvio(e.target.value)} style={inp} />
              <input placeholder="Gratis desde $ (opcional)" type="number" value={gratisDesde} onChange={(e) => setGratisDesde(e.target.value)} style={inp} />
              <p style={{ fontSize: 12, opacity: 0.6 }}>Las zonas por comuna se configuran después en el panel.</p>
            </div>
          )}
        </div>
      )}
      {i === 4 && (
        <div>
          <h2 style={{ color: GOLD }}>Conecta tu WhatsApp</h2>
          <p style={{ fontSize: 14, opacity: 0.85, marginTop: 6 }}>
            Autoriza tu cuenta de WhatsApp Business desde Meta. Los mensajes y boletas que te lleguen
            caerán automáticamente en Hash, y Kaly los registrará por ti.
          </p>
          {bspStatus && !bspStatus.app_secret_configured && (
            <div style={{ background: 'rgba(255,107,107,.08)', border: '1px solid #ff6b6b40', padding: 10, borderRadius: 8, marginTop: 12, fontSize: 13 }}>
              ⚠️ El servidor aún no tiene META_APP_SECRET configurado. Pide al admin de Atiko/Hash que lo agregue.
            </div>
          )}
          {bspStatus && bspStatus.connected_whatsapp && (
            <div style={{ background: 'rgba(46,204,113,.08)', border: '1px solid #2ecc7140', padding: 10, borderRadius: 8, marginTop: 12, fontSize: 13, color: '#a7f3d0' }}>
              ✓ Ya tienes un WhatsApp conectado. Puedes reconectar para reemplazarlo o seguir al siguiente paso.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
            <button onClick={connectWA} style={{ ...btnGold, flex: 1, minWidth: 140 }}>📱 Conectar WhatsApp</button>
            <button onClick={connectFB} style={{ ...btnOutline, flex: 1, minWidth: 140 }}>📘 Facebook / Instagram</button>
          </div>
          {esStatus.text && (
            <div style={{
              marginTop: 12, fontSize: 13,
              color: esStatus.kind === 'ok' ? '#a7f3d0' : esStatus.kind === 'err' ? '#ff9a9a' : '#cfeaf3',
            }}>{esStatus.text}</div>
          )}
          <p style={{ fontSize: 12, opacity: 0.55, marginTop: 14 }}>
            ¿Aún no tienes WhatsApp Business o Meta no aprueba? Puedes saltar este paso y conectarlo más tarde desde Configuración.
          </p>
        </div>
      )}
      {i === 5 && (
        <div>
          <h2 style={{ color: GOLD }}>¡Listo!</h2>
          <p>Tienes {nProductos} producto(s). IVA {ivaIncluido ? 'incluido' : 'se agrega 19%'}. {haceDelivery ? `Despacho $${Math.round(Number(costoEnvio) || 0)}` : 'Sin despacho'}.</p>
          {bspStatus && bspStatus.connected_whatsapp && (
            <p style={{ color: '#a7f3d0', fontSize: 14, marginTop: 6 }}>✓ WhatsApp conectado — los mensajes entrarán automáticamente.</p>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={() => { terminar(); onIrAlChat && onIrAlChat(); }} style={btnGold}>Ir al Chat</button>
            <button onClick={() => { terminar(); onCrearPedido && onCrearPedido(); }} style={btnOutline}>Crear pedido de prueba</button>
          </div>
        </div>
      )}

      {err ? <div style={{ color: '#ff6b6b', fontSize: 13, marginTop: 10 }}>{err}</div> : null}

      {i < 5 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22 }}>
          <button onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} style={{ ...btnOutline, opacity: i === 0 ? 0.4 : 1 }}>Atrás</button>
          <button onClick={siguiente} style={btnGold}>{i === 4 ? 'Continuar' : 'Siguiente'}</button>
        </div>
      )}
    </div>
  );
}

const inp = { width: '100%', padding: 11, borderRadius: 8, marginTop: 10, background: '#ffffff10', border: '1px solid #ffffff22', color: '#e7eef2' };
const btnGold = { background: GOLD, color: '#000', fontWeight: 800, borderRadius: 10, padding: '11px 18px', border: 0 };
const btnOutline = { background: 'transparent', color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 10, padding: '11px 18px' };
