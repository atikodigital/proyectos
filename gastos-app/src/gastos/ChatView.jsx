import { useEffect, useState } from 'react';
import { api } from './api';
import PedidoBuilder from './pedido/PedidoBuilder';
import ProductosView from './ProductosView.jsx';

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

function Conversacion({ conv, onBack }) {
  const [msgs, setMsgs] = useState(null);
  const [armando, setArmando] = useState(false);
  const [reply, setReply] = useState('');
  const [mias, setMias] = useState([]);

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
        <div className="font-black truncate">{conv.contact || 'Sin nombre'}</div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 grid gap-2 content-start">
        {msgs === null ? <div className="opacity-60 text-sm">Cargando…</div>
          : (msgs.length === 0 && mias.length === 0) ? <div className="opacity-60 text-sm">Sin mensajes capturados aún.</div>
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
            placeholder="Escribe una respuesta…"
            className="flex-1 rounded-xl border px-3 py-2 text-sm"
          />
          <button onClick={responder} disabled={!reply.trim()} className="rounded-xl font-black px-3 py-2 text-white disabled:opacity-40 text-sm" style={{ background: '#16A34A' }}>Responder por WhatsApp</button>
        </div>
        <button onClick={() => setArmando(true)} className="w-full rounded-xl font-black py-3 text-black" style={{ background: GOLD }}>🧾 Crear pedido</button>
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
        <h2 className="text-xl font-black" style={{ color: GOLD }}>Chat</h2>
        <div className="flex gap-2 mt-2">
          {segBtn('conversaciones', 'Conversaciones')}
          {segBtn('productos', 'Productos')}
        </div>
      </div>

      {vista === 'productos' ? (
        <div className="flex-1 min-h-0 overflow-y-auto"><ProductosView /></div>
      ) : (
        <>
          {plugin() && !notif ? (
            <div className="mx-4 mb-2 rounded-xl border p-3 shrink-0" style={{ borderColor: GOLD }}>
              <div className="font-bold text-sm mb-1">Activa la captura de chats</div>
              <p className="text-xs opacity-70 mb-2">Permite que Hash IA lea los mensajes que te llegan, para llenar la bandeja sola.</p>
              <button onClick={async () => { try { await plugin().openNotificationAccessSettings(); } catch (_e) { /* noop */ } }} className="rounded-lg font-black text-black px-3 py-1.5 text-xs" style={{ background: GOLD }}>Activar notificaciones</button>
            </div>
          ) : null}

          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 grid gap-2 content-start">
            {convs === null ? <div className="opacity-60 text-sm">Cargando…</div>
              : convs.length === 0 ? (
                <div className="opacity-60 text-sm">
                  Aún no hay conversaciones. Activa la captura arriba, o en WhatsApp mantén presionado un mensaje → <b>Compartir</b> → <b>Hash IA</b>.
                </div>
              ) : convs.map((c, i) => {
                const ca = CANALES[c.channel] || CANALES.compartido;
                return (
                  <button key={i} onClick={() => setSel(c)} className="text-left rounded-xl border p-3 flex items-center gap-3">
                    <span className="text-lg">{ca.ic}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold truncate">{c.contact || 'Sin nombre'} <span className="text-[10px] opacity-50">· {ca.n}</span></div>
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
