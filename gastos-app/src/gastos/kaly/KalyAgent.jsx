/* eslint-disable no-undef */
/**
 * Kaly Agent — orquestador de sesión Gemini Live, compacto.
 * Esfera (voz) + barra de texto siempre visible + última respuesta + botón silenciar.
 * state: 'off' | 'connecting' | 'live' | 'listening' | 'speaking' | 'error'
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import KalyOrb from './KalyOrb.jsx';
import { openLiveSession, unlockAudio } from './live.js';
import { TOOL_DECLARATIONS, executeTool } from './tools.js';
import { buildSystemPrompt, instruccionInicial } from './prompt.js';
import { decideAutoStart, esNegativa, hoyStr, marcarSaludado, yaSaludoHoy, SILENCE_MS, INACTIVITY_MS } from './logic.js';
import { useAgentInteraction } from '../agente/AgentInteractionProvider.jsx';

const LIVE_MODEL_FALLBACK =
  typeof __KALY_LIVE_MODEL__ !== 'undefined'
    ? __KALY_LIVE_MODEL__
    : 'gemini-2.5-flash-native-audio-preview-09-2025';
/* eslint-enable no-undef */

const esSilenciar = (t) => /(c[áa]llate|silencio|no hables|\bcalla\b)/i.test(String(t || ''));

export default function KalyAgent() {
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
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const { proponer, pedirEvidencia, interaccionAbierta } = useAgentInteraction();

  useEffect(() => {
    if (sessionRef.current && sessionRef.current.setMuted) {
      sessionRef.current.setMuted(interaccionAbierta || mutedRef.current);
    }
  }, [interaccionAbierta]);

  function clearSilenceTimer() {
    if (silenceTimerRef.current != null) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
  }
  function armSilenceTimer(stopFn) {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => { silenceTimerRef.current = null; stopFn(); }, SILENCE_MS);
  }
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
    flushAprender();
    clearSilenceTimer();
    if (diagTimerRef.current) { clearTimeout(diagTimerRef.current); diagTimerRef.current = null; }
    if (sessionRef.current) { sessionRef.current.close(); sessionRef.current = null; }
    setState('off');
    setMessages([]);
  }, []);

  const start = useCallback(
    async (motivo) => {
      if (sessionRef.current) return;
      // Marcar ANTES de conectar: si KalyAgent se desmonta/remonta a mitad de la
      // conexión (navegación entre pestañas), el remontaje no debe repetir el saludo.
      if (motivo === 'saludo' || motivo === 'onboarding') marcarSaludado();
      setState('connecting');
      setMessages([{ sender: 'kaly', text: 'Conectando con Kaly...', isSystem: true }]);

      let s;
      try { s = await api.agentSession(); }
      catch (e) {
        setState('error');
        const detalle = e && (e.status ? `HTTP ${e.status}` : '') + (e && e.data && e.data.error ? ' · ' + e.data.error : (e.message || ''));
        setMessages([{ sender: 'kaly', text: 'Kaly no disponible. ' + (detalle || 'Intente más tarde.'), isSystem: true }]);
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
        if (newState === 'listening') armSilenceTimer(stop);
      };
      const onAudioLevel = (_dir, v) => setLevel(v);
      const onUserTranscript = (text) => {
        pushTurn('user', text);
        clearSilenceTimer();
        setMessages((prev) => [...prev, { sender: 'user', text }]);
        if (esSilenciar(text)) { aplicarMute(true); return; }
        if (esNegativa(text)) setTimeout(() => stop(), 2500);
      };
      const onAgentTranscript = (text) => {
        pushTurn('kaly', text);
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
          setMessages([{ sender: 'kaly', text: `DIAG: la conexión con Gemini se cerró antes de conectar (código ${info.code || '?'}${info.reason ? ' · ' + info.reason : ''}).`, isSystem: true }]);
          setState('error');
          setTimeout(() => { setState('off'); setMessages([]); }, 5000);
          return;
        }
        setState('off');
        setMessages([]);
      };

      const session = openLiveSession({
        token: s.token,
        model: s.model || LIVE_MODEL_FALLBACK,
        systemPrompt: buildSystemPrompt(s.context),
        tools: TOOL_DECLARATIONS,
        audio: true,
        onState, onAudioLevel, onUserTranscript, onAgentTranscript, onToolCall, onClose,
      });

      sessionRef.current = session;
      if (mutedRef.current && session.setMuted) session.setMuted(true);
      session.sendText(instruccionInicial(s.context, motivo));
      if (motivo === 'saludo') localStorage.setItem('kaly_last_greet', hoyStr());
    },
    [stop, aplicarMute],
  );

  useEffect(() => {
    const onboarded = localStorage.getItem('kaly_onboarded') === '1';
    const motivo = decideAutoStart({ onboarded, yaSaludoHoy: yaSaludoHoy() });
    if (motivo) start(motivo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function resetInactivity() {
      if (inactivityTimerRef.current != null) clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => {
        inactivityTimerRef.current = null;
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
    if (inactivityTimerRef.current != null) { clearTimeout(inactivityTimerRef.current); inactivityTimerRef.current = null; }
    if (sessionRef.current) { sessionRef.current.close(); sessionRef.current = null; }
  }, []);

  const handleTap = useCallback(() => {
    unlockAudio(); // desbloquea el audio dentro del gesto, para que el saludo suene al tiro
    if (state === 'off') start('manual'); else stop();
  }, [state, start, stop]);

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
