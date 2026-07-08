import { useState, useEffect, useRef } from 'react';
import { getToken, clearToken } from './session';
import { docsDeItems } from './capturaCola';
import { api } from './api';
import { t } from './i18n';
import LoginScreen from './LoginScreen.jsx';
import ConfirmScreen from './ConfirmScreen.jsx';
import MyExpenses from './MyExpenses.jsx';
import EvidenceIntake from '../components/EvidenceIntake.jsx';
import ContabilidadView from './ContabilidadView.jsx';
import KalyAgent from './kaly/KalyAgent.jsx';
import { resetKalyGreeting } from './kaly/logic.js';
import VarasChat from './VarasChat.jsx';
import { APP_VERSION } from './version';
import ChatView from './ChatView.jsx';
import OnboardingWizard from './onboarding/OnboardingWizard.jsx';
import OnboardingPersonal from './OnboardingPersonal.jsx';
import PersonalDashboard from './PersonalDashboard.jsx';
import MemoriaKalyView from './MemoriaKalyView.jsx';
import MiPlanView from './MiPlanView.jsx';
import { AgentInteractionProvider } from './agente/AgentInteractionProvider.jsx';

function clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }
function fechaCorta(v) { if (!v) return ''; const s = String(v); return s.length >= 10 ? s.slice(0, 10) : s; }
function motivoText(m) {
  if (m === 'folio') return t('app.motivo_folio');
  if (m === 'nro_operacion') return t('app.motivo_nro_operacion');
  if (m === 'imagen') return t('app.motivo_imagen');
  if (m === 'monto_fecha_proveedor') return t('app.motivo_monto_fecha_proveedor');
  return t('app.motivo_generico');
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
  const [mostrarPlan, setMostrarPlan] = useState(false);
  const [company, setCompany] = useState(null);
  // Cola de documentos pendientes cuando se escanean VARIOS de una vez (multi-captura).
  // Se procesan uno por uno: cada uno con su confirmación, igual que 1 documento.
  const [cola, setCola] = useState([]);
  const colaRef = useRef([]);
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
        if (!resp.onboarded_at && !resp.onboarding_saltado && !saltado) setMostrarOnboarding(true);
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

  // Cuando la app vuelve a primer plano (o recupera foco), avisa a todas las
  // pantallas para que recarguen sus datos (balance, movimientos, informes).
  useEffect(() => {
    const avisar = () => { try { window.dispatchEvent(new CustomEvent('hash:data-changed')); } catch (_) {} };
    const onVisible = () => { if (document.visibilityState === 'visible') avisar(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', avisar);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', avisar);
    };
  }, []);

  // Al iniciar sesión, resetea el estado de saludo de KALY: cada cuenta (en el mismo
  // teléfono con varias cuentas) debe saludar/onboardar desde cero. Sin esto, las
  // flags de la cuenta anterior hacían que KALY no saludara a la nueva.
  if (!authed) return <LoginScreen onLoggedIn={() => { resetKalyGreeting(); setAuthed(true); }} />;

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
    const docs = docsDeItems(items);
    if (!docs.length) return;
    // Registra el primero y encola el resto (multi-captura: registrar TODOS).
    const resto = docs.slice(1);
    colaRef.current = resto;
    setCola(resto);
    await submit(docs[0].imageBase64, docs[0].mimeType, false);
  }
  // Pasa al siguiente documento de la cola, o termina (va a "Movimientos").
  function siguienteDoc() {
    const prev = colaRef.current;
    if (!prev.length) { setTab('mis'); return; }
    const [next, ...rest] = prev;
    colaRef.current = rest;
    setCola(rest);
    submit(next.imageBase64, next.mimeType, false);
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
      {mostrarPlan && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.85)', overflowY: 'auto' }}>
          <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 12px 0' }}>
              <button onClick={() => setMostrarPlan(false)} style={{ background: 'transparent', color: '#fff', fontSize: 20, border: 0, cursor: 'pointer' }}>✕</button>
            </div>
            <MiPlanView />
          </div>
        </div>
      )}
      <header className="flex justify-between items-center p-4 border-b shrink-0">
        <span className="font-black" style={{ color: '#C9A24B' }}>Hash IA <span className="text-xs font-normal opacity-50">{APP_VERSION}</span></span>
        <div className="flex items-center gap-2">
          {!mostrarOnboarding && (
            <button className="text-xs opacity-60 border border-current rounded px-2 py-0.5" onClick={() => setMostrarOnboarding(true)}>{t('app.configurar_negocio')}</button>
          )}
          <button className="text-xs opacity-60 border border-current rounded px-2 py-0.5" onClick={() => setMostrarMemoria(true)}>{t('app.memoria_kaly')}</button>
          <button className="text-xs opacity-60 border border-current rounded px-2 py-0.5" onClick={() => setMostrarPlan(true)}>Mi Plan</button>
          <button className="text-xs opacity-60" onClick={() => { resetKalyGreeting(); clearToken(); setAuthed(false); }}>{t('app.salir')}</button>
        </div>
      </header>
      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {!pending && !dup && !receptorAjeno && !esVenta && ((tab === 'capturar' && !esPersonal) || tab === 'chat') && (
          <div className="px-4 py-2 bg-slate-50/50 border-b border-slate-200/40 shrink-0">
            <KalyAgent />
          </div>
        )}
        {cola.length > 0 && (pending || dup || esVenta || receptorAjeno) && (
          <div className="px-4 py-1.5 text-xs font-black text-center text-black shrink-0" style={{ background: '#C9A24B' }}>
            📄 Te quedan {cola.length} documento{cola.length > 1 ? 's' : ''} por revisar
          </div>
        )}
        <div className="flex-1 min-h-0">
        {esVenta ? (
          <div className="h-full overflow-y-auto p-6 max-w-sm mx-auto grid gap-3 content-start">
            <h2 className="text-xl font-black" style={{ color: '#C9A24B' }}>📤 {t('app.venta_titulo')}</h2>
            <div className="rounded-2xl bg-black/5 p-4 border text-sm grid gap-2">
              <div>{t('app.venta_desc')}</div>
              {esVenta.info.receptor_nombre || esVenta.info.receptor_rut ? (
                <div className="opacity-80">{t('app.cliente')}: <b>{esVenta.info.receptor_nombre || esVenta.info.receptor_rut}</b></div>
              ) : null}
              {esVenta.info.preview && esVenta.info.preview.total > 0 ? (
                <div className="opacity-80">
                  {t('app.total')}: {clp(esVenta.info.preview.total)}
                  {esVenta.info.preview.folio ? ` · ${t('app.folio')} ${esVenta.info.preview.folio}` : ''}
                </div>
              ) : null}
            </div>
            <button onClick={() => submit(esVenta.imageBase64, esVenta.mimeType, false, false, true)} className="rounded-xl font-black py-3 text-black" style={{ background: '#C9A24B' }}>{t('app.registrar_ingreso')}</button>
            <button onClick={() => { setEsVenta(null); siguienteDoc(); }} className="rounded-xl font-black py-3 bg-black/10 border">{t('app.descartar')}</button>
          </div>
        ) : receptorAjeno ? (
          <div className="h-full overflow-y-auto p-6 max-w-sm mx-auto grid gap-3 content-start">
            <h2 className="text-xl font-black" style={{ color: '#C9A24B' }}>⚠️ {t('app.receptor_titulo')}</h2>
            <div className="rounded-2xl bg-black/5 p-4 border text-sm grid gap-2">
              <div>{t('app.receptor_desc1')} <b>{receptorAjeno.info.receptor_nombre || receptorAjeno.info.receptor_rut}</b>{t('app.receptor_desc2')}</div>
              {receptorAjeno.info.preview && receptorAjeno.info.preview.proveedor ? (
                <div className="opacity-80">{t('app.proveedor')}: {receptorAjeno.info.preview.proveedor} · {clp(receptorAjeno.info.preview.total)}</div>
              ) : null}
              <div>{t('app.registrar_igual_q')}</div>
            </div>
            <button onClick={() => submit(receptorAjeno.imageBase64, receptorAjeno.mimeType, false, true)} className="rounded-xl font-black py-3 text-black" style={{ background: '#C9A24B' }}>{t('app.si_registrar_igual')}</button>
            <button onClick={() => { setReceptorAjeno(null); siguienteDoc(); }} className="rounded-xl font-black py-3 bg-black/10 border">{t('app.descartar')}</button>
          </div>
        ) : dup ? (
          <div className="h-full overflow-y-auto p-6 max-w-sm mx-auto grid gap-3 content-start">
            <h2 className="text-xl font-black" style={{ color: '#C9A24B' }}>🚫 {t('app.dup_titulo')}</h2>
            <div className="rounded-2xl bg-black/5 p-4 border text-sm grid gap-2">
              <div><b>{t('app.por_que')}:</b> {motivoText(dup.info && dup.info.motivo)}.</div>
              {dup.info && dup.info.existente ? (
                <div className="opacity-80">{t('app.dup_ya_registrado')}{dup.info.existente.fecha ? ' (' + fechaCorta(dup.info.existente.fecha) + ')' : ''}: {dup.info.existente.proveedor || t('app.sin_proveedor')} · {clp(dup.info.existente.total)}{dup.info.existente.folio ? ' · ' + t('app.folio') + ' ' + dup.info.existente.folio : ''}{dup.info.existente.nro_operacion ? ' · ' + t('app.nro_op') + ' ' + dup.info.existente.nro_operacion : ''}.</div>
              ) : null}
              <div>{t('app.dup_pregunta')}</div>
            </div>
            <button onClick={() => submit(dup.imageBase64, dup.mimeType, true)} className="rounded-xl font-black py-3 text-black" style={{ background: '#C9A24B' }}>{t('app.registrar_igual')}</button>
            <button onClick={() => { setDup(null); siguienteDoc(); }} className="rounded-xl font-black py-3 bg-black/10 border">{t('app.descartar')}</button>
          </div>
        ) : pending ? (
          <div className="h-full overflow-y-auto">
            <ConfirmScreen expense={pending.exp} photo={{ base64: pending.img, mime: pending.mime }} onDone={() => { setPending(null); try { window.dispatchEvent(new CustomEvent('hash:data-changed')); } catch (_) {} siguienteDoc(); }} />
          </div>
        ) : tab === 'capturar' ? (
          busy ? <div className="p-6">{t('app.procesando')}</div>
               : esPersonal ? (
                 // Modo personal: Captura ES el chat con KALY (burbujas). El bloque
                 // de captura de foto/archivo queda abajo. Sin tarjeta de saldo.
                 <div className="h-full flex flex-col">
                   <div className="flex-1 min-h-0"><KalyAgent chat /></div>
                   <div className="shrink-0 border-t border-slate-200/50 p-3 bg-white">
                     <p className="px-1 mb-2 opacity-70 text-xs font-bold">{t('app.captura_gasto_personal')}</p>
                     <EvidenceIntake maxEvidence={10} value={[]} onChange={onChange} showNativeCapture />
                   </div>
                 </div>
               ) : (
                 <div className="h-full overflow-y-auto p-4">
                   <p className="px-2 mb-2 opacity-70 text-xs font-bold">{t('app.captura_comprobante')}</p>
                   <EvidenceIntake maxEvidence={10} value={[]} onChange={onChange} showNativeCapture />
                 </div>
               )
        ) : tab === 'mis' ? (
          <div className="h-full flex flex-col">
            <div className="shrink-0 border-b overflow-hidden" style={{ height: '40%' }}>
              <KalyAgent />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto"><MyExpenses /></div>
          </div>
        ) : (tab === 'chat' && chatHabilitado) ? (
          <ChatView />
        ) : tab === 'dashboard' ? (
          <PersonalDashboard />
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
            <span>{t('app.tab_captura')}</span>
          </button>
          <button className={`flex-1 flex flex-col justify-center items-center text-[10.5px] font-bold border-r border-slate-300 transition-all duration-200 ${tab === 'mis' ? 'text-[#C9A24B] bg-slate-50/50' : 'text-neutral-500 opacity-60 hover:opacity-100'}`} onClick={() => setTab('mis')}>
            <span>{t('app.tab_movimientos')}</span>
          </button>
          <button className={`flex-1 flex flex-col justify-center items-center text-[10.5px] font-bold border-r border-slate-300 transition-all duration-200 ${tab === (esPersonal ? 'dashboard' : 'transaccional') ? 'text-[#C9A24B] bg-slate-50/50' : 'text-neutral-500 opacity-60 hover:opacity-100'}`} onClick={() => setTab(esPersonal ? 'dashboard' : 'transaccional')}>
            <span>{esPersonal ? t('app.tab_panel') : t('app.tab_transaccional')}</span>
          </button>
          {chatHabilitado && (
          <button className={`flex-1 flex flex-col justify-center items-center text-[10.5px] font-bold border-r border-slate-300 transition-all duration-200 ${tab === 'chat' ? 'text-[#C9A24B] bg-slate-50/50' : 'text-neutral-500 opacity-60 hover:opacity-100'}`} onClick={() => setTab('chat')}>
            <span>{t('app.tab_chat')}</span>
          </button>
          )}
          <button className={`flex-1 flex flex-col justify-center items-center text-[10.5px] font-bold transition-all duration-200 ${tab === 'match' ? 'bg-[#b91c1c] text-white font-bold' : 'text-[#b91c1c] opacity-80 hover:opacity-100 hover:bg-red-50/30'}`} onClick={() => setTab('match')}>
            <span>{t('app.tab_match')}</span>
          </button>
        </nav>
      )}
    </div>
    </AgentInteractionProvider>
  );
}
