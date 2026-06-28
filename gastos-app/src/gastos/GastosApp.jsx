import { useState, useEffect } from 'react';
import { getToken, clearToken } from './session';
import { api } from './api';
import LoginScreen from './LoginScreen.jsx';
import ConfirmScreen from './ConfirmScreen.jsx';
import MyExpenses from './MyExpenses.jsx';
import EvidenceIntake from '../components/EvidenceIntake.jsx';
import ContabilidadView from './ContabilidadView.jsx';
import KalyAgent from './kaly/KalyAgent.jsx';
import VarasChat from './VarasChat.jsx';
import { APP_VERSION } from './version';
import ChatView from './ChatView.jsx';
import OnboardingWizard from './onboarding/OnboardingWizard.jsx';
import OnboardingPersonal from './OnboardingPersonal.jsx';
import BalanceCard from './BalanceCard.jsx';
import MemoriaKalyView from './MemoriaKalyView.jsx';
import { AgentInteractionProvider } from './agente/AgentInteractionProvider.jsx';

function clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }
function fechaCorta(v) { if (!v) return ''; const s = String(v); return s.length >= 10 ? s.slice(0, 10) : s; }
function motivoText(m) {
  if (m === 'folio') return 'es la misma factura/boleta (mismo folio y RUT del proveedor)';
  if (m === 'nro_operacion') return 'es el mismo comprobante (mismo N° de operación)';
  if (m === 'imagen') return 'es exactamente la misma foto';
  if (m === 'monto_fecha_proveedor') return 'coincide el monto, la fecha y el proveedor con otro ya registrado';
  return 'ya existe un movimiento igual registrado';
}

export default function GastosApp() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [tab, setTab] = useState('capturar');
  const [pending, setPending] = useState(null);
  const [dup, setDup] = useState(null);
  const [receptorAjeno, setReceptorAjeno] = useState(null);
  const [esVenta, setEsVenta] = useState(null);
  const [busy, setBusy] = useState(false);
  const [matchDoc, setMatchDoc] = useState(null);
  const [mostrarOnboarding, setMostrarOnboarding] = useState(false);
  const [saltado, setSaltado] = useState(false);
  const [mostrarMemoria, setMostrarMemoria] = useState(false);
  const [company, setCompany] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // Módulos habilitados por cliente (vienen del backend). El módulo "chat" sale
  // OCULTO por defecto y solo se activa desde gastos.atikodigital.cl/admin.
  const [productos, setProductos] = useState([]);

  useEffect(() => {
    if (!authed) return;
    (async () => {
      try {
        const resp = await api.getCompany();
        setCompany(resp);
        try { localStorage.setItem('hash_idioma', resp.idioma || 'es'); } catch (_) {}
        setProductos(Array.isArray(resp.productos) ? resp.productos : []);
        if (!resp.onboarded_at && !saltado) setMostrarOnboarding(true);
      } catch { /* no romper el render */ }
    })();
  }, [authed]); // eslint-disable-line react-hooks/exhaustive-deps

  const chatHabilitado = productos.includes('chat');
  const esPersonal = company?.tipo_cuenta === 'personal';

  // Si el chat se desactiva (o nunca estuvo activo) y la pestaña activa era 'chat',
  // vuelve a Captura para no dejar al usuario en una vista oculta.
  useEffect(() => {
    if (tab === 'chat' && !chatHabilitado) setTab('capturar');
  }, [chatHabilitado, tab]);

  if (!authed) return <LoginScreen onLoggedIn={() => setAuthed(true)} />;

  async function submit(imageBase64, mimeType, override, overrideReceptor, forceIngreso) {
    setBusy(true);
    try {
      const exp = await api.createExpense(imageBase64, mimeType, override, overrideReceptor, forceIngreso);
      if (exp && exp.documento) {
        setMatchDoc(exp.documento);
        setDup(null); setReceptorAjeno(null); setEsVenta(null);
        setTab('match');
        return;
      }
      setPending({ exp, img: imageBase64, mime: mimeType });
      setDup(null); setReceptorAjeno(null); setEsVenta(null);
    }
    catch (e) {
      if (e && e.status === 422 && e.data && e.data.error === 'es_venta')
        setEsVenta({ imageBase64, mimeType, info: e.data });
      else if (e && e.status === 422 && e.data && e.data.error === 'receptor_ajeno')
        setReceptorAjeno({ imageBase64, mimeType, info: e.data });
      else if (e && e.status === 409)
        setDup({ imageBase64, mimeType, info: (e.data && e.data.duplicado) || {} });
    }
    finally { setBusy(false); }
  }
  async function onChange(items) {
    const ev = (items || [])[0];
    if (!ev || !ev.imageBase64) return;
    await submit(ev.imageBase64, ev.imageMimeType || 'image/jpeg', false);
  }

  return (
    <AgentInteractionProvider>
    <div className="h-screen flex flex-col overflow-hidden">
      {mostrarOnboarding && (
        esPersonal
          ? <OnboardingPersonal company={company} onDone={() => setMostrarOnboarding(false)} />
          : <OnboardingWizard
              onDone={() => setMostrarOnboarding(false)}
              onSkip={() => { setSaltado(true); setMostrarOnboarding(false); }}
              onIrAlChat={() => { setMostrarOnboarding(false); setTab(chatHabilitado ? 'chat' : 'capturar'); }}
              onCrearPedido={() => { setMostrarOnboarding(false); setTab(chatHabilitado ? 'chat' : 'capturar'); }}
            />
      )}
      {mostrarMemoria && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.85)', overflowY: 'auto' }}>
          <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 12px 0' }}>
              <button onClick={() => setMostrarMemoria(false)} style={{ background: 'transparent', color: '#fff', fontSize: 20, border: 0, cursor: 'pointer' }}>✕</button>
            </div>
            <MemoriaKalyView />
          </div>
        </div>
      )}
      <header className="flex justify-between items-center p-4 border-b shrink-0">
        <span className="font-black" style={{ color: '#C9A24B' }}>Hash IA <span className="text-xs font-normal opacity-50">{APP_VERSION}</span></span>
        <div className="flex items-center gap-2">
          {!mostrarOnboarding && (
            <button className="text-xs opacity-60 border border-current rounded px-2 py-0.5" onClick={() => setMostrarOnboarding(true)}>Configurar mi negocio</button>
          )}
          <button className="text-xs opacity-60 border border-current rounded px-2 py-0.5" onClick={() => setMostrarMemoria(true)}>Memoria KALY</button>
          <button className="text-xs opacity-60" onClick={() => { clearToken(); setAuthed(false); }}>Salir</button>
        </div>
      </header>
      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {!pending && !dup && !receptorAjeno && !esVenta && (tab === 'capturar' || tab === 'chat') && (
          <div className="px-4 py-2 bg-slate-50/50 border-b border-slate-200/40 shrink-0">
            <KalyAgent />
          </div>
        )}
        <div className="flex-1 min-h-0">
        {esVenta ? (
          <div className="h-full overflow-y-auto p-6 max-w-sm mx-auto grid gap-3 content-start">
            <h2 className="text-xl font-black" style={{ color: '#C9A24B' }}>📤 Factura de venta</h2>
            <div className="rounded-2xl bg-black/5 p-4 border text-sm grid gap-2">
              <div>Eres el <b>emisor</b> de esta factura. Se registrará como ingreso <b>pendiente de cobro</b> hasta confirmarlo con la cartola.</div>
              {esVenta.info.receptor_nombre || esVenta.info.receptor_rut ? (
                <div className="opacity-80">Cliente: <b>{esVenta.info.receptor_nombre || esVenta.info.receptor_rut}</b></div>
              ) : null}
              {esVenta.info.preview && esVenta.info.preview.total > 0 ? (
                <div className="opacity-80">
                  Total: {clp(esVenta.info.preview.total)}
                  {esVenta.info.preview.folio ? ` · folio ${esVenta.info.preview.folio}` : ''}
                </div>
              ) : null}
            </div>
            <button onClick={() => submit(esVenta.imageBase64, esVenta.mimeType, false, false, true)} className="rounded-xl font-black py-3 text-black" style={{ background: '#C9A24B' }}>Registrar como ingreso</button>
            <button onClick={() => setEsVenta(null)} className="rounded-xl font-black py-3 bg-black/10 border">Descartar</button>
          </div>
        ) : receptorAjeno ? (
          <div className="h-full overflow-y-auto p-6 max-w-sm mx-auto grid gap-3 content-start">
            <h2 className="text-xl font-black" style={{ color: '#C9A24B' }}>⚠️ Factura de otra empresa</h2>
            <div className="rounded-2xl bg-black/5 p-4 border text-sm grid gap-2">
              <div>Esta factura está dirigida a <b>{receptorAjeno.info.receptor_nombre || receptorAjeno.info.receptor_rut}</b>, que no coincide con el RUT de tu empresa.</div>
              {receptorAjeno.info.preview && receptorAjeno.info.preview.proveedor ? (
                <div className="opacity-80">Proveedor: {receptorAjeno.info.preview.proveedor} · {clp(receptorAjeno.info.preview.total)}</div>
              ) : null}
              <div>¿Registrarla igual?</div>
            </div>
            <button onClick={() => submit(receptorAjeno.imageBase64, receptorAjeno.mimeType, false, true)} className="rounded-xl font-black py-3 text-black" style={{ background: '#C9A24B' }}>Sí, registrar igual</button>
            <button onClick={() => setReceptorAjeno(null)} className="rounded-xl font-black py-3 bg-black/10 border">Descartar</button>
          </div>
        ) : dup ? (
          <div className="h-full overflow-y-auto p-6 max-w-sm mx-auto grid gap-3 content-start">
            <h2 className="text-xl font-black" style={{ color: '#C9A24B' }}>🚫 No lo registré</h2>
            <div className="rounded-2xl bg-black/5 p-4 border text-sm grid gap-2">
              <div><b>Por qué:</b> {motivoText(dup.info && dup.info.motivo)}.</div>
              {dup.info && dup.info.existente ? (
                <div className="opacity-80">Ya estaba registrado{dup.info.existente.fecha ? ' (' + fechaCorta(dup.info.existente.fecha) + ')' : ''}: {dup.info.existente.proveedor || 's/proveedor'} · {clp(dup.info.existente.total)}{dup.info.existente.folio ? ' · folio ' + dup.info.existente.folio : ''}{dup.info.existente.nro_operacion ? ' · N° op ' + dup.info.existente.nro_operacion : ''}.</div>
              ) : null}
              <div>Para no registrar/pagar dos veces, no lo guardé. ¿Registrarlo igual de todas formas?</div>
            </div>
            <button onClick={() => submit(dup.imageBase64, dup.mimeType, true)} className="rounded-xl font-black py-3 text-black" style={{ background: '#C9A24B' }}>Registrar igual</button>
            <button onClick={() => setDup(null)} className="rounded-xl font-black py-3 bg-black/10 border">Descartar</button>
          </div>
        ) : pending ? (
          <div className="h-full overflow-y-auto">
            <ConfirmScreen expense={pending.exp} photo={{ base64: pending.img, mime: pending.mime }} onDone={() => { setPending(null); setRefreshKey((k) => k + 1); setTab('mis'); }} />
          </div>
        ) : tab === 'capturar' ? (
          busy ? <div className="p-6">Procesando…</div>
               : <div className="h-full overflow-y-auto p-4">
                   <p className="px-2 mb-2 opacity-70 text-xs font-bold">
                     {esPersonal ? 'Registra tu gasto:' : 'Captura la boleta, factura o comprobante:'}
                   </p>
                   <EvidenceIntake maxEvidence={1} value={[]} onChange={onChange} showNativeCapture />
                   {esPersonal && <BalanceCard key={refreshKey} />}
                 </div>
        ) : tab === 'mis' ? (
          <div className="h-full flex flex-col">
            <div className="shrink-0 border-b" style={{ height: '42%' }}><VarasChat /></div>
            <div className="flex-1 min-h-0 overflow-y-auto"><MyExpenses /></div>
          </div>
        ) : (tab === 'chat' && chatHabilitado) ? (
          <ChatView />
        ) : tab === 'transaccional' ? (
          <div className="h-full"><VarasChat /></div>
        ) : (
          <ContabilidadView initialTab="varas" />
        )}
        </div>
      </main>
      {!pending && !dup && (
        <nav className="flex border-t border-slate-300 bg-white shadow-lg justify-around items-stretch h-14">
          <button className={`flex-1 flex flex-col justify-center items-center text-[10.5px] font-bold border-r border-slate-300 transition-all duration-200 ${tab === 'capturar' ? 'text-[#C9A24B] bg-slate-50/50' : 'text-neutral-500 opacity-60 hover:opacity-100'}`} onClick={() => setTab('capturar')}>
            <span>Captura</span>
          </button>
          <button className={`flex-1 flex flex-col justify-center items-center text-[10.5px] font-bold border-r border-slate-300 transition-all duration-200 ${tab === 'mis' ? 'text-[#C9A24B] bg-slate-50/50' : 'text-neutral-500 opacity-60 hover:opacity-100'}`} onClick={() => setTab('mis')}>
            <span>Movimientos</span>
          </button>
          <button className={`flex-1 flex flex-col justify-center items-center text-[10.5px] font-bold border-r border-slate-300 transition-all duration-200 ${tab === 'transaccional' ? 'text-[#C9A24B] bg-slate-50/50' : 'text-neutral-500 opacity-60 hover:opacity-100'}`} onClick={() => setTab('transaccional')}>
            <span>Transaccional</span>
          </button>
          {chatHabilitado && (
          <button className={`flex-1 flex flex-col justify-center items-center text-[10.5px] font-bold border-r border-slate-300 transition-all duration-200 ${tab === 'chat' ? 'text-[#C9A24B] bg-slate-50/50' : 'text-neutral-500 opacity-60 hover:opacity-100'}`} onClick={() => setTab('chat')}>
            <span>Chat</span>
          </button>
          )}
          <button className={`flex-1 flex flex-col justify-center items-center text-[10.5px] font-bold transition-all duration-200 ${tab === 'match' ? 'bg-[#b91c1c] text-white font-bold' : 'text-[#b91c1c] opacity-80 hover:opacity-100 hover:bg-red-50/30'}`} onClick={() => setTab('match')}>
            <span>Match</span>
          </button>
        </nav>
      )}
    </div>
    </AgentInteractionProvider>
  );
}
