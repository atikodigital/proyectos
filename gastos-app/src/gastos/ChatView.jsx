import { useEffect, useState } from 'react';
import { api } from './api';
import { t } from './i18n';
import PedidoBuilder from './pedido/PedidoBuilder';
import ProductosView from './ProductosView.jsx';
import EvidenceIntake from '../components/EvidenceIntake.jsx';

const plugin = () => (window && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AtikoPedido) || null;
const GOLD = '#C9A24B';
const CANALES = {
  whatsapp: { ic: '🟢', n: 'WhatsApp' },
  messenger: { ic: '🔵', n: 'Messenger' },
  instagram: { ic: '🟣', n: 'Instagram' },
  telegram: { ic: '🔷', n: 'Telegram' },
  compartido: { ic: '🔗', n: 'Compartido' },
};

function waPhone(contact) {
  const d = String(contact || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('56') && d.length >= 11) return d.slice(0, 11);
  if (d.length === 9 && d.startsWith('9')) return '56' + d;
  if (d.length === 8) return '569' + d;
  return null;
}
function waLinkLocal(text, contact) {
  const enc = encodeURIComponent(String(text || ''));
  const p = waPhone(contact);
  return p ? `https://wa.me/${p}?text=${enc}` : `https://wa.me/?text=${enc}`;
}
function abrir(url) { try { window.open(url, '_blank'); } catch (_e) { window.location.href = url; } }

function Ficha({ conv, onCrearPedido }) {
  const [ficha, setFicha] = useState(null);
  const [err, setErr] = useState('');
  const [email, setEmail] = useState('');
  const [ubic, setUbic] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [capturando, setCapturando] = useState(false);
  const [evidencias, setEvidencias] = useState([]);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;
    api.chatContacto(conv.channel, conv.contact)
      .then((f) => { if (!vivo) return; setFicha(f || {}); setEmail(f.email || ''); setUbic(f.ubicacion || ''); setNotas(f.notas || ''); })
      .catch(() => { if (vivo) setErr(t('app.ficha_err_cargar')); });
    return () => { vivo = false; };
  }, [conv]);

  async function guardar() {
    setGuardando(true);
    try { await api.chatContactoGuardar({ channel: conv.channel, contact: conv.contact, email, ubicacion: ubic, notas }); }
    catch (e) { setErr(t('app.ficha_err_guardar')); }
    setGuardando(false);
  }

  async function enviarEvidencia() {
    setErr('');
    if (String(conv.channel || '').toLowerCase() !== 'whatsapp') { setErr(t('app.evid_solo_whatsapp')); return; }
    const imgs = (evidencias || []).filter((e) => e.imageBase64 && !e.isDoc);
    if (!imgs.length) { setErr(t('app.evid_sin_imagenes')); return; }
    setEnviando(true);
    try {
      for (const im of imgs) {
        await api.chatResponderImagen({ channel: conv.channel, contact: conv.contact, imageBase64: im.imageBase64, mimeType: im.imageMimeType || 'image/jpeg' });
      }
      setEvidencias([]);
    } catch (e) { setErr(t('app.evid_err_enviar')); }
    setEnviando(false);
  }

  const fila = (lbl, val) => (
    <div className="flex justify-between text-sm py-0.5"><span className="opacity-60">{lbl}</span><span className="font-semibold text-right">{val || '—'}</span></div>
  );
  const inp = 'w-full rounded-lg border px-2 py-1.5 text-sm mt-0.5';

  if (err && !ficha) return <div className="px-4 py-3 text-sm text-red-600">{err}</div>;
  if (!ficha) return <div className="px-4 py-3 text-sm opacity-60">{t('app.ficha_cargando')}</div>;
  return (
    <div className="px-4 py-3 border-b bg-black/[0.02] max-h-[55vh] overflow-y-auto">
      <div className="grid gap-1 mb-3">
        {fila(t('app.ficha_telefono'), ficha.telefono)}
        {fila(t('app.ficha_canal'), (CANALES[conv.channel] || CANALES.compartido).n)}
        {fila(t('app.ficha_primer_contacto'), (ficha.primerContacto || '').slice(0, 10))}
        {fila(t('app.ficha_ultimo_contacto'), (ficha.ultimoContacto || '').slice(0, 10))}
        {fila(t('app.ficha_mensajes'), String(ficha.nMensajes || 0))}
      </div>
      <label className="text-[11px] uppercase opacity-50">{t('app.ficha_email')}</label>
      <input value={email} onChange={(e) => setEmail(e.target.value)} className={inp} placeholder={t('app.ficha_email_ph')} />
      <label className="text-[11px] uppercase opacity-50 block mt-2">{t('app.ficha_ubicacion')}</label>
      <input value={ubic} onChange={(e) => setUbic(e.target.value)} className={inp} placeholder={t('app.ficha_ubicacion_ph')} />
      <label className="text-[11px] uppercase opacity-50 block mt-2">{t('app.ficha_notas')}</label>
      <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={inp} placeholder={t('app.ficha_notas_ph')} />
      {err ? <div className="text-xs text-red-600 mt-1">{err}</div> : null}
      <button onClick={guardar} disabled={guardando} className="w-full rounded-xl font-black py-2 text-black mt-2 disabled:opacity-50" style={{ background: GOLD }}>{guardando ? t('app.guardando') : t('app.ficha_guardar_datos')}</button>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <button onClick={onCrearPedido} className="rounded-xl font-black py-2.5 text-black" style={{ background: GOLD }}>🧾 {t('app.crear_pedido')}</button>
        <button onClick={() => setCapturando((v) => !v)} className="rounded-xl font-black py-2.5 border" style={{ borderColor: GOLD, color: GOLD }}>📷 {t('app.captura')}</button>
      </div>
      {capturando ? (
        <div className="mt-3">
          <EvidenceIntake value={evidencias} onChange={setEvidencias} showNativeCapture maxEvidence={6} />
          {evidencias.length ? (
            <>
              <p className="text-xs opacity-60 mt-1">{evidencias.length} {t('app.evid_adjuntos')}</p>
              <button onClick={enviarEvidencia} disabled={enviando} className="w-full rounded-xl font-black py-2 text-white mt-1 disabled:opacity-50" style={{ background: '#16A34A' }}>{enviando ? t('app.enviando') : '📤 ' + t('app.evid_enviar')}</button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Conversacion({ conv, onBack }) {
  const [msgs, setMsgs] = useState(null);
  const [armando, setArmando] = useState(false);
  const [reply, setReply] = useState('');
  const [mias, setMias] = useState([]);
  const [fichaOpen, setFichaOpen] = useState(false);

  useEffect(() => {
    api.chatMensajes(conv.channel, conv.contact).then((r) => setMsgs(Array.isArray(r) ? r : [])).catch(() => setMsgs([]));
  }, [conv]);

  function responder() {
    const t = reply.trim();
    if (!t) return;
    abrir(waLinkLocal(t, conv.contact));
    setMias((xs) => [...xs, { text: t }]);
    setReply('');
  }

  if (armando) return <PedidoBuilder channel={conv.channel} contact={conv.contact} onClose={() => setArmando(false)} />;
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 pb-2 shrink-0 flex items-center gap-2 border-b">
        <button onClick={onBack} className="text-base font-black" style={{ color: GOLD }}>←</button>
        <button onClick={() => setFichaOpen((v) => !v)} className="flex-1 flex items-center gap-1 min-w-0 text-left">
          <span className="font-black truncate">{conv.contact || t('app.sin_nombre')}</span>
          <span className="text-xs" style={{ color: GOLD }}>{fichaOpen ? '▴' : '▾'}</span>
        </button>
      </div>
      {fichaOpen ? <Ficha conv={conv} onCrearPedido={() => setArmando(true)} /> : null}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 grid gap-2 content-start">
        {msgs === null ? <div className="opacity-60 text-sm">{t('app.cargando')}</div>
          : (msgs.length === 0 && mias.length === 0) ? <div className="opacity-60 text-sm">{t('app.sin_mensajes')}</div>
            : (
              <>
                {msgs.map((m, i) => <div key={'r' + i} className="justify-self-start max-w-[85%] rounded-xl bg-black/5 p-2 text-sm whitespace-pre-wrap">{m.text}</div>)}
                {mias.map((m, i) => <div key={'m' + i} className="justify-self-end max-w-[85%] rounded-xl p-2 text-sm text-black whitespace-pre-wrap" style={{ background: GOLD }}>{m.text}</div>)}
              </>
            )}
      </div>
      <div className="p-3 shrink-0 border-t grid gap-2">
        <div className="flex items-center gap-2">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') responder(); }}
            placeholder={t('app.escribe_respuesta')}
            className="flex-1 rounded-xl border px-3 py-2 text-sm"
          />
          <button onClick={responder} disabled={!reply.trim()} className="rounded-xl font-black px-3 py-2 text-white disabled:opacity-40 text-sm" style={{ background: '#16A34A' }}>{t('app.responder_whatsapp')}</button>
        </div>
        <button onClick={() => setArmando(true)} className="w-full rounded-xl font-black py-3 text-black" style={{ background: GOLD }}>🧾 {t('app.crear_pedido')}</button>
      </div>
    </div>
  );
}

export default function ChatView() {
  const [vista, setVista] = useState('conversaciones');
  const [convs, setConvs] = useState(null);
  const [sel, setSel] = useState(null);
  const [notif, setNotif] = useState(true);

  function load() {
    api.chatConversaciones().then((r) => setConvs(Array.isArray(r) ? r : [])).catch(() => setConvs([]));
  }
  async function checkPerms() {
    const p = plugin();
    if (!p) return;
    try { const s = await p.status(); setNotif(!!s.notificationAccess); } catch (_e) { /* noop */ }
  }
  useEffect(() => {
    load(); checkPerms();
    const onFocus = () => { load(); checkPerms(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  if (sel) return <Conversacion conv={sel} onBack={() => { setSel(null); load(); }} />;

  const segBtn = (key, label) => (
    <button
      onClick={() => setVista(key)}
      className={`flex-1 rounded-lg py-1.5 text-xs font-black ${vista === key ? 'text-black' : 'text-neutral-500'}`}
      style={{ background: vista === key ? GOLD : '#00000010' }}
    >{label}</button>
  );

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 pb-2 shrink-0">
        <h2 className="text-xl font-black" style={{ color: GOLD }}>{t('app.chat_titulo')}</h2>
        <div className="flex gap-2 mt-2">
          {segBtn('conversaciones', t('app.tab_conversaciones'))}
          {segBtn('productos', t('app.tab_productos'))}
        </div>
      </div>

      {vista === 'productos' ? (
        <div className="flex-1 min-h-0 overflow-y-auto"><ProductosView /></div>
      ) : (
        <>
          {plugin() && !notif ? (
            <div className="mx-4 mb-2 rounded-xl border p-3 shrink-0" style={{ borderColor: GOLD }}>
              <div className="font-bold text-sm mb-1">{t('app.captura_titulo')}</div>
              <p className="text-xs opacity-70 mb-2">{t('app.captura_desc')}</p>
              <button onClick={async () => { try { await plugin().openNotificationAccessSettings(); } catch (_e) { /* noop */ } }} className="rounded-lg font-black text-black px-3 py-1.5 text-xs" style={{ background: GOLD }}>{t('app.activar_notif')}</button>
            </div>
          ) : null}

          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 grid gap-2 content-start">
            {convs === null ? <div className="opacity-60 text-sm">{t('app.cargando')}</div>
              : convs.length === 0 ? (
                <div className="opacity-60 text-sm">
                  {t('app.sin_conversaciones')} <b>{t('app.compartir')}</b> → <b>Hash IA</b>.
                </div>
              ) : convs.map((c, i) => {
                const ca = CANALES[c.channel] || CANALES.compartido;
                return (
                  <button key={i} onClick={() => setSel(c)} className="text-left rounded-xl border p-3 flex items-center gap-3">
                    <span className="text-lg">{ca.ic}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold truncate">{c.contact || t('app.sin_nombre')} <span className="text-[10px] opacity-50">· {ca.n}</span></div>
                      <div className="text-xs opacity-60 truncate">{c.ultimo}</div>
                    </div>
                    <span className="text-[10px] opacity-50">{c.n}</span>
                  </button>
                );
              })}
          </div>
        </>
      )}
    </div>
  );
}
