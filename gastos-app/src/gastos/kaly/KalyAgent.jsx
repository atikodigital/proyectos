/* eslint-disable no-undef */
/**
 * Kaly Agent — orquestador de sesión Gemini Live, compacto.
 * Esfera (voz) + barra de texto siempre visible + última respuesta + botón silenciar.
 * state: 'off' | 'connecting' | 'live' | 'listening' | 'speaking' | 'error'
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { t } from '../i18n';
import KalyOrb from './KalyOrb.jsx';
import { openLiveSession, unlockAudio } from './live.js';
import { TOOL_DECLARATIONS, executeTool } from './tools.js';
import { buildSystemPrompt, instruccionInicial } from './prompt.js';
import { decideAutoStart, esNegativa, marcarSaludado, saludoReciente, ultimoSaludoMs, kalyHizoPregunta, SILENCE_MS, SILENCE_ANSWER_MS, INACTIVITY_MS } from './logic.js';
import { useAgentInteraction } from '../agente/AgentInteractionProvider.jsx';

const LIVE_MODEL_FALLBACK =
  typeof __KALY_LIVE_MODEL__ !== 'undefined'
    ? __KALY_LIVE_MODEL__
    : 'gemini-2.5-flash-native-audio-preview-09-2025';
/* eslint-enable no-undef */

const esSilenciar = (t) => /(c[áa]llate|silencio|no hables|\bcalla\b)/i.test(String(t || ''));

export default function KalyAgent({ chat = false }) {
  const [state, setState] = useState('off');
  const [level, setLevel] = useState(0);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [busyText, setBusyText] = useState(false);
  const [muted, setMutedState] = useState(() => {
    try { return localStorage.getItem('kaly_muted') === '1'; } catch (_) { return false; }
  });

  const sessionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const inactivityTimerRef = useRef(null);
  const diagTimerRef = useRef(null);
  const contextRef = useRef(null);
  const mutedRef = useRef(muted);
  const turnosRef = useRef([]);
  const scrollRef = useRef(null);
  // Evita abrir DOS sesiones si start() se llama dos veces en el hueco async
  // (antes de que sessionRef quede seteado).
  const startingRef = useRef(false);
  // Timestamp hasta el cual ignorar transcripciones del usuario (eco del altavoz).
  const echoGuardRef = useRef(0);
  // Throttle del nivel de audio para no re-renderizar en cada frame.
  const lastLevelRef = useRef(0);
  // Historial accesible desde callbacks (start/onClose) sin depender del closure.
  const messagesRef = useRef([]);
  // true cuando el usuario apagó a KALY tocando el orbe: NO auto-reconectar.
  const manualStopRef = useRef(false);
  const reconnectTimerRef = useRef(null);
  const reconnectFailsRef = useRef(0);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  // En modo chat (burbujas), baja el scroll al último mensaje cuando llega uno nuevo.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const { proponer, pedirEvidencia, interaccionAbierta } = useAgentInteraction();

  // OJO: antes esto silenciaba la voz de KALY mientras la tarjeta de confirmación
  // estaba abierta (interaccionAbierta) → el usuario decía un gasto y KALY "no
  // hablaba al tiro" (su respuesta salía muteada). Ahora KALY sigue hablando con
  // la tarjeta abierta; solo respeta el mute manual del usuario.
  useEffect(() => {
    if (sessionRef.current && sessionRef.current.setMuted) {
      sessionRef.current.setMuted(mutedRef.current);
    }
  }, [interaccionAbierta]);

  function clearSilenceTimer() {
    if (silenceTimerRef.current != null) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
  }
  function armSilenceTimer(stopFn, ms = SILENCE_MS) {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => { silenceTimerRef.current = null; stopFn(); }, ms);
  }
  // true cuando KALY acaba de PREGUNTAR algo (espera respuesta): mientras tanto no
  // cortamos la conversación por silencio corto ni tratamos un "no" como despedida.
  const esperaRespuestaRef = useRef(false);
  function pushTurn(role, text) {
    const t = String(text || '').trim();
    if (!t) return;
    const arr = turnosRef.current;
    const last = arr[arr.length - 1];
    if (last && last.role === role) last.text = `${last.text} ${t}`;
    else arr.push({ role, text: t });
  }
  function flushAprender() {
    const turnos = turnosRef.current;
    turnosRef.current = [];
    if (turnos.length >= 4) { api.kalyAprender({ transcripcion: turnos }).catch(() => {}); }
  }

  const aplicarMute = useCallback((nv) => {
    setMutedState(nv);
    try { localStorage.setItem('kaly_muted', nv ? '1' : '0'); } catch (_) {}
    if (sessionRef.current && sessionRef.current.setMuted) sessionRef.current.setMuted(nv);
  }, []);

  const stop = useCallback(() => {
    startingRef.current = false;
    flushAprender();
    clearSilenceTimer();
    if (diagTimerRef.current) { clearTimeout(diagTimerRef.current); diagTimerRef.current = null; }
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    if (sessionRef.current) { sessionRef.current.close(); sessionRef.current = null; }
    setState('off');
    // En modo chat NO borramos el historial: la conversación (voz + texto) debe
    // seguir visible aunque la sesión de voz se cierre por silencio.
    if (!chat) setMessages([]);
  }, [chat]);

  const start = useCallback(
    async (motivo) => {
      if (sessionRef.current || startingRef.current) return;
      startingRef.current = true;
      // Desbloquea (reanuda) el AudioContext ANTES de conectar. El WebView Android lo
      // crea 'suspended'; en el AUTO-saludo no hay un toque previo que lo reactive, así
      // que el saludo salía MUDO en una app recién abierta. El WebView permite autoplay
      // (setMediaPlaybackRequiresUserGesture=false), por lo que resume() funciona aquí.
      try { unlockAudio(); } catch (_) {}
      // Marcar ANTES de conectar: si KalyAgent se desmonta/remonta a mitad de la
      // conexión (navegación entre pestañas), el remontaje no debe repetir el saludo.
      if (motivo === 'saludo' || motivo === 'onboarding') marcarSaludado();
      // Tras el onboarding, recuérdalo en el celular para que los próximos días
      // salude normal (no vuelva a hacer el onboarding largo cada día).
      if (motivo === 'onboarding') { try { localStorage.setItem('kaly_onboarded', '1'); } catch (_) {} }
      setState('connecting');
      // En modo chat conservamos el historial (voz + texto); no lo pisamos con el
      // aviso de conexión (el color del orbe ya indica el estado).
      if (!chat) setMessages([{ sender: 'kaly', text: 'Conectando con Kaly...', isSystem: true }]);

      let s;
      try { s = await api.agentSession(); }
      catch (e) {
        setState('error');
        const detalle = e && (e.status ? `HTTP ${e.status}` : '') + (e && e.data && e.data.error ? ' · ' + e.data.error : (e.message || ''));
        { const msg = { sender: 'kaly', text: 'Kaly no disponible. ' + (detalle || 'Intente más tarde.'), isSystem: true };
          setMessages((prev) => (chat ? [...prev, msg] : [msg])); }
        startingRef.current = false;
        setTimeout(() => stop(), 4000);
        return;
      }

      // Diagnóstico: si a los 10s la sesión no llegó a 'live', el problema está en
      // la conexión WebSocket a Gemini (token/red), no en el backend. onState limpia
      // este timer apenas conecta.
      diagTimerRef.current = setTimeout(() => {
        setMessages((prev) => [...prev, { sender: 'kaly', text: 'DIAG: la conexión de voz con Gemini no respondió en 10s (revisa conexión a internet del teléfono).', isSystem: true }]);
      }, 10000);

      contextRef.current = s.context;
      if (motivo === 'onboarding' && s.context && s.context.onboarded) motivo = 'saludo';
      if (s.context && s.context.onboarded) localStorage.setItem('kaly_onboarded', '1');

      let everLive = false;
      const onState = (newState) => {
        if (newState === 'live' || newState === 'listening' || newState === 'speaking') {
          everLive = true;
          if (diagTimerRef.current) { clearTimeout(diagTimerRef.current); diagTimerRef.current = null; }
        }
        setState(newState);
        // Guardia anti-eco (manos libres): mientras KALY habla y ~800ms después,
        // ignoramos cualquier "transcripción de usuario" — casi seguro es su propia
        // voz colándose por el altavoz. Evita el bucle de auto-respuesta.
        if (chat) {
          if (newState === 'speaking') echoGuardRef.current = Number.MAX_SAFE_INTEGER;
          else if (newState === 'listening') echoGuardRef.current = Date.now() + 200;
        }
        // Si KALY acaba de preguntar algo, da más tiempo para responder (no cortar).
        // En modo chat NO se corta por silencio: la conversación queda siempre
        // abierta (manos libres); solo el usuario la apaga tocando el orbe.
        if (newState === 'listening' && !chat) armSilenceTimer(stop, esperaRespuestaRef.current ? SILENCE_ANSWER_MS : SILENCE_MS);
      };
      const onAudioLevel = (_dir, v) => {
        // El nivel llega ~8 veces/seg (in y out). Actualizar el estado en CADA frame
        // re-renderiza KALY y compite con el audio en el hilo principal → entrecortes.
        // Con ~16 fps el orbe se ve fluido igual y baja mucho la carga.
        const now = Date.now();
        if (now - lastLevelRef.current < 60) return;
        lastLevelRef.current = now;
        setLevel(v);
      };
      const onUserTranscript = (text) => {
        // Descarta el eco del propio altavoz de KALY (ver echoGuardRef).
        if (chat && Date.now() < echoGuardRef.current) return;
        pushTurn('user', text);
        clearSilenceTimer();
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.sender === 'user' && !last.isSystem) {
            const nuevoTexto = `${last.text} ${text}`.replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
            return [...prev.slice(0, -1), { sender: 'user', text: nuevoTexto }];
          }
          return [...prev, { sender: 'user', text }];
        });
        if (esSilenciar(text)) { aplicarMute(true); return; }
        // Si KALY acababa de preguntar, esto es la RESPUESTA (ej. "no" a "¿lo
        // pagaste?"): NO cerrar la sesión, aunque el texto parezca negativo.
        if (esperaRespuestaRef.current) { esperaRespuestaRef.current = false; return; }
        // En modo chat un "no, gracias" NO apaga la conversación: KALY se despide
        // en una frase y sigue escuchando (manos libres).
        if (!chat && esNegativa(text)) setTimeout(() => stop(), 2500);
      };
      const onAgentTranscript = (text) => {
        pushTurn('kaly', text);
        // Detecta si KALY hizo una pregunta (espera respuesta) para no cortar la charla.
        if (kalyHizoPregunta(text)) esperaRespuestaRef.current = true;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.sender === 'kaly' && !last.isSystem) {
            return [...prev.slice(0, -1), { sender: 'kaly', text: last.text + ' ' + text }];
          }
          return [...prev, { sender: 'kaly', text }];
        });
      };
      const onToolCall = async (fc) => {
        const out = await executeTool(fc.name, fc.args, {
          onPrefsSaved: (p) => {
            contextRef.current = { ...contextRef.current, ...p, onboarded: true };
            localStorage.setItem('kaly_onboarded', '1');
          },
          proponer,
          pedirEvidencia,
        });
        // Si el tool cambió movimientos (registró/pagó/anuló/capturó), avisa a la app
        // para que BalanceCard y la lista de movimientos se refresquen al instante.
        const CAMBIA_DATOS = new Set(['crear_movimiento_manual', 'marcar_pagada', 'anular_movimiento', 'pedir_documento']);
        if (out && !out.error && !out.cancelado && CAMBIA_DATOS.has(fc.name)) {
          try { window.dispatchEvent(new CustomEvent('hash:data-changed')); } catch (_) {}
        }
        if (sessionRef.current) sessionRef.current.sendToolResponse(fc.id, fc.name, out);
      };
      const onClose = (info) => {
        flushAprender();
        sessionRef.current = null;
        if (diagTimerRef.current) { clearTimeout(diagTimerRef.current); diagTimerRef.current = null; }
        if (!everLive && info) {
          const dmsg = { sender: 'kaly', text: `DIAG: la conexión con Gemini se cerró antes de conectar (código ${info.code || '?'}${info.reason ? ' · ' + info.reason : ''}).`, isSystem: true };
          setMessages((prev) => (chat ? [...prev, dmsg] : [dmsg]));
          setState('error');
          setTimeout(() => { setState('off'); if (!chat) setMessages([]); }, 5000);
          // Reintenta la conexión un par de veces (red móvil inestable), sin loop infinito.
          if (chat && !manualStopRef.current && reconnectFailsRef.current < 2) {
            reconnectFailsRef.current += 1;
            reconnectTimerRef.current = setTimeout(() => { reconnectTimerRef.current = null; start('reconexion'); }, 6000);
          }
          return;
        }
        setState('off');
        if (!chat) setMessages([]);
        // Modo chat: si la sesión se cerró SOLA (Gemini corta ~10 min, caída de red),
        // reconecta al tiro SIN saludar, pasando el historial. La conversación se
        // siente UNA sola, siempre disponible. Si el usuario la apagó (orbe), no.
        if (chat && !manualStopRef.current) {
          reconnectFailsRef.current = 0;
          // Reconexión casi inmediata para minimizar el hueco sordo entre sesiones.
          reconnectTimerRef.current = setTimeout(() => { reconnectTimerRef.current = null; start('reconexion'); }, 300);
        }
      };

      const session = openLiveSession({
        token: s.token,
        model: s.model || LIVE_MODEL_FALLBACK,
        systemPrompt: buildSystemPrompt(s.context),
        tools: TOOL_DECLARATIONS,
        audio: true,
        // Manos libres (chat): cancela el eco del altavoz en el mic y deja el mic
        // mudo más rato tras hablar, para que KALY no se oiga a sí misma y no entre
        // en bucle de auto-respuesta.
        echoCancellation: chat,
        halfDuplexTailMs: chat ? 200 : 250,
        idleMs: chat ? 10 * 60 * 1000 : 25000,
        // En chat el mic tiene AGC (sube la voz baja); con eso un umbral VAD más bajo
        // capta mejor cuando hablas suave o lejos, sin descartar tu voz.
        vadThreshold: chat ? 0.008 : 0.012,
        onState, onAudioLevel, onUserTranscript, onAgentTranscript, onToolCall, onClose,
      });

      sessionRef.current = session;
      startingRef.current = false;
      if (mutedRef.current && session.setMuted) session.setMuted(true);
      // Pasa la conversación reciente (voz + texto) para que la sesión nueva
      // CONTINÚE donde quedó, en vez de partir de cero saludando.
      session.sendText(instruccionInicial(s.context, motivo, messagesRef.current), motivo !== 'reconexion');
    },
    [stop, aplicarMute, chat],
  );

  useEffect(() => {
    const onboarded = localStorage.getItem('kaly_onboarded') === '1';
    const motivo = decideAutoStart({ onboarded, ultimoSaludo: ultimoSaludoMs() });
    if (motivo) start(motivo);
    // Modo chat manos libres: si ya saludó en esta apertura (volviste a la pestaña),
    // reconecta al tiro SIN saludar. La conexión queda lista apenas entras.
    else if (chat) start('reconexion');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function resetInactivity() {
      if (inactivityTimerRef.current != null) clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => {
        inactivityTimerRef.current = null;
        // Si el usuario apagó a KALY a propósito (orbe), respeta el silencio.
        if (manualStopRef.current) return;
        setState((current) => { if (current === 'off') setTimeout(() => start('inactividad'), 0); return current; });
      }, INACTIVITY_MS);
    }
    resetInactivity();
    window.addEventListener('click', resetInactivity);
    window.addEventListener('touchstart', resetInactivity);
    return () => {
      if (inactivityTimerRef.current != null) { clearTimeout(inactivityTimerRef.current); inactivityTimerRef.current = null; }
      window.removeEventListener('click', resetInactivity);
      window.removeEventListener('touchstart', resetInactivity);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  useEffect(() => () => {
    clearSilenceTimer();
    // Al desmontar (cambio de pestaña), que el onClose de la sesión no re-agende
    // una reconexión huérfana.
    manualStopRef.current = true;
    if (reconnectTimerRef.current != null) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    if (inactivityTimerRef.current != null) { clearTimeout(inactivityTimerRef.current); inactivityTimerRef.current = null; }
    if (sessionRef.current) { sessionRef.current.close(); sessionRef.current = null; }
  }, []);

  const handleTap = useCallback(() => {
    unlockAudio(); // desbloquea el audio dentro del gesto, para que el saludo suene al tiro
    if (state === 'off') {
      manualStopRef.current = false;
      reconnectFailsRef.current = 0;
      // Si ya saludó en esta apertura de la app, reencender NO debe saludar de
      // nuevo: continúa la conversación (reconexion). Solo la primera vez saluda.
      start(chat && saludoReciente() ? 'reconexion' : 'manual');
    } else {
      manualStopRef.current = true; // apagado a propósito: no auto-reconectar
      stop();
    }
  }, [state, start, stop, chat]);

  // El texto NO usa la sesión de voz Live (mezclar audio + turnos de texto es
  // inestable y a veces no responde). Va por un chat HTTP dedicado que devuelve
  // { reply, accionPropuesta }; las acciones se confirman con la tarjeta (proponer)
  // y se ejecutan con executeTool (que refresca la app).
  const handleSendText = useCallback(async () => {
    const txt = inputText.trim();
    if (!txt || busyText) return;
    setInputText('');
    const historial = messages
      .filter((m) => !m.isSystem)
      .map((m) => ({ role: m.sender === 'kaly' ? 'assistant' : 'user', text: m.text }))
      .concat([{ role: 'user', text: txt }]);
    setMessages((prev) => [...prev, { sender: 'user', text: txt }]);
    setBusyText(true);
    try {
      const r = await api.kalyChat(historial);
      if (r && r.reply) setMessages((prev) => [...prev, { sender: 'kaly', text: r.reply }]);
      if (r && r.accionPropuesta) {
        const out = await executeTool(r.accionPropuesta.tipo, r.accionPropuesta.args, {
          onPrefsSaved: (p) => { contextRef.current = { ...contextRef.current, ...p, onboarded: true }; localStorage.setItem('kaly_onboarded', '1'); },
          proponer, pedirEvidencia,
        });
        const CAMBIA = new Set(['crear_movimiento_manual', 'marcar_pagada', 'anular_movimiento', 'pedir_documento']);
        if (out && !out.error && !out.cancelado) {
          if (CAMBIA.has(r.accionPropuesta.tipo)) { try { window.dispatchEvent(new CustomEvent('hash:data-changed')); } catch (_) {} }
          setMessages((prev) => [...prev, { sender: 'kaly', text: '✅ Listo, quedó registrado.' }]);
        } else if (out && out.error) {
          setMessages((prev) => [...prev, { sender: 'kaly', text: 'No pude completar la acción.' }]);
        }
      }
    } catch (_e) {
      setMessages((prev) => [...prev, { sender: 'kaly', text: 'No pude procesar tu mensaje.' }]);
    } finally {
      setBusyText(false);
    }
  }, [inputText, busyText, messages, proponer, pedirEvidencia]);

  const toggleMute = useCallback(() => { aplicarMute(!mutedRef.current); }, [aplicarMute]);

  const ultimaKaly = [...messages].reverse().find((m) => m.sender === 'kaly' && !m.isSystem);

  // Modo chat: conversación con burbujas estilo WhatsApp (orbe chico arriba,
  // burbujas al medio con auto-scroll, barra de texto abajo). Reusa messages,
  // handleSendText, handleTap y toggleMute del modo compacto.
  if (chat) {
    return (
      <div className="w-full h-full flex flex-col bg-slate-50/40">
        {/* Orbe grande (voz) arriba, centrado — se ve la animación al hablar.
            Usamos `zoom` (WebView = Chromium) para achicarlo un poco SIN romper el
            layout como haría transform:scale. */}
        <div className="shrink-0 relative flex flex-col items-center pt-0.5">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? 'Activar voz de Kaly' : 'Silenciar Kaly'}
            className={`absolute right-2 top-1 z-10 w-9 h-9 rounded-full flex items-center justify-center text-base border ${muted ? 'bg-[#C9A24B] text-white border-[#C9A24B]' : 'bg-white text-slate-500 border-slate-200'}`}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <div style={{ zoom: 0.82 }}>
            <KalyOrb state={state} audioLevel={level} onTap={handleTap} />
          </div>
          <div className="text-[10px] text-slate-500 leading-tight text-center mb-1 px-6">
            {state === 'error' ? 'No disponible' : muted ? '🔇 En silencio — te respondo por texto' : t('kaly.chat_sub')}
          </div>
        </div>

        {/* Chat compacto (voz + texto) */}
        <div ref={scrollRef} data-testid="kaly-burbujas" className="flex-1 min-h-0 overflow-y-auto px-3 py-2 flex flex-col gap-1.5 border-t border-slate-200/50">
          {messages.length === 0 ? (
            <div className="m-auto text-center text-slate-400 text-sm px-6">{t('kaly.chat_vacio')}</div>
          ) : messages.map((m, i) => (
            m.isSystem ? (
              <div key={i} className="self-center my-1 px-3 py-1 text-[11px] text-slate-500 bg-slate-200/60 rounded-full max-w-[90%] text-center">{m.text}</div>
            ) : (
              <div
                key={i}
                data-role={m.sender === 'user' ? 'user' : 'kaly'}
                className="max-w-[82%] px-3 py-2 text-[13px] leading-snug shadow-sm break-words"
                style={m.sender === 'user'
                  ? { alignSelf: 'flex-end', background: '#dcf8c6', color: '#1f2b16', borderRadius: '14px 14px 4px 14px' }
                  : { alignSelf: 'flex-start', background: '#ffffff', color: '#1f2937', border: '1px solid rgba(201,162,75,0.3)', borderRadius: '14px 14px 14px 4px' }}
              >
                {m.text}
              </div>
            )
          ))}
        </div>

        {/* Barra de texto */}
        <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-200/50 shrink-0 bg-white">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSendText(); }}
            placeholder={t('kaly.chat_ph')}
            className="flex-1 px-3 py-2 text-[13px] border border-slate-200 rounded-full focus:outline-none focus:ring-1 focus:ring-[#C9A24B] bg-white text-slate-800"
          />
          <button
            onClick={handleSendText}
            disabled={busyText || !inputText.trim()}
            aria-label="Enviar"
            className="shrink-0 w-10 h-10 flex items-center justify-center text-base bg-[#C9A24B] hover:bg-[#b08b3a] disabled:opacity-40 text-white rounded-full font-black transition-colors"
          >
            {busyText ? '…' : '➤'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col items-center pt-2 pb-2 bg-slate-50/50 border border-slate-200/40 rounded-2xl shadow-sm px-4">
      <div className="flex items-center gap-3">
        <KalyOrb state={state} audioLevel={level} onTap={handleTap} />
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? 'Activar voz de Kaly' : 'Silenciar Kaly'}
          className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm border ${muted ? 'bg-[#C9A24B] text-white border-[#C9A24B]' : 'bg-white text-slate-500 border-slate-200'}`}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      {state === 'error' ? <p className="text-[10px] text-red-400 mt-1 font-bold">Kaly no disponible</p> : null}
      {muted ? (
        <p className="text-[10px] text-slate-500 mt-1 font-semibold text-center">🔇 En silencio — te respondo por texto. Toca 🔊 para la voz.</p>
      ) : null}

      {ultimaKaly ? (
        <p className="w-full text-[12px] text-sky-800 mt-2 px-3 py-1.5 bg-sky-100 border border-sky-200/50 rounded-xl leading-snug line-clamp-2">
          {ultimaKaly.text}
        </p>
      ) : null}

      <div className="flex items-center gap-2 mt-2 w-full">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSendText(); }}
          placeholder="Escribe a Kaly…"
          className="flex-1 px-3 py-1.5 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C9A24B] bg-white text-slate-800 font-medium"
        />
        <button
          onClick={handleSendText}
          disabled={busyText || !inputText.trim()}
          className="px-3 py-1.5 text-[12px] bg-[#C9A24B] hover:bg-[#b08b3a] disabled:opacity-40 text-white rounded-lg font-black transition-colors"
        >
          {busyText ? '…' : 'Enviar'}
        </button>
      </div>
    </div>
  );
}
