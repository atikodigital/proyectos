/* eslint-disable no-undef */
/**
 * Kaly Agent — orquestador de sesión Gemini Live, compacto.
 * Esfera (voz) + barra de texto siempre visible + última respuesta + botón silenciar.
 * state: 'off' | 'connecting' | 'live' | 'listening' | 'speaking' | 'error'
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import KalyOrb from './KalyOrb.jsx';
import { openLiveSession } from './live.js';
import { TOOL_DECLARATIONS, executeTool } from './tools.js';
import { buildSystemPrompt, instruccionInicial } from './prompt.js';
import { decideAutoStart, esNegativa, hoyStr, SILENCE_MS, INACTIVITY_MS } from './logic.js';

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
  const [muted, setMutedState] = useState(() => {
    try { return localStorage.getItem('kaly_muted') === '1'; } catch (_) { return false; }
  });

  const sessionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const inactivityTimerRef = useRef(null);
  const contextRef = useRef(null);
  const mutedRef = useRef(muted);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  function clearSilenceTimer() {
    if (silenceTimerRef.current != null) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
  }
  function armSilenceTimer(stopFn) {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => { silenceTimerRef.current = null; stopFn(); }, SILENCE_MS);
  }

  const aplicarMute = useCallback((nv) => {
    setMutedState(nv);
    try { localStorage.setItem('kaly_muted', nv ? '1' : '0'); } catch (_) {}
    if (sessionRef.current && sessionRef.current.setMuted) sessionRef.current.setMuted(nv);
  }, []);

  const stop = useCallback(() => {
    clearSilenceTimer();
    if (sessionRef.current) { sessionRef.current.close(); sessionRef.current = null; }
    setState('off');
    setMessages([]);
  }, []);

  const start = useCallback(
    async (motivo) => {
      if (sessionRef.current) return;
      setState('connecting');
      setMessages([{ sender: 'kaly', text: 'Conectando con Kaly...', isSystem: true }]);

      let s;
      try { s = await api.agentSession(); }
      catch (_) {
        setState('error');
        setMessages([{ sender: 'kaly', text: 'Kaly no disponible. Intente más tarde.', isSystem: true }]);
        setTimeout(() => stop(), 3000);
        return;
      }

      contextRef.current = s.context;
      if (motivo === 'onboarding' && s.context && s.context.onboarded) motivo = 'saludo';
      if (s.context && s.context.onboarded) localStorage.setItem('kaly_onboarded', '1');

      const onState = (newState) => {
        setState(newState);
        if (newState === 'listening') armSilenceTimer(stop);
      };
      const onAudioLevel = (_dir, v) => setLevel(v);
      const onUserTranscript = (text) => {
        clearSilenceTimer();
        setMessages((prev) => [...prev, { sender: 'user', text }]);
        if (esSilenciar(text)) { aplicarMute(true); return; }
        if (esNegativa(text)) setTimeout(() => stop(), 2500);
      };
      const onAgentTranscript = (text) => {
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
        });
        if (sessionRef.current) sessionRef.current.sendToolResponse(fc.id, fc.name, out);
      };
      const onClose = () => { sessionRef.current = null; setState('off'); setMessages([]); };

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
    const motivo = decideAutoStart({ onboarded });
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
    if (state === 'off') start('manual'); else stop();
  }, [state, start, stop]);

  const handleSendText = useCallback(async () => {
    const txt = inputText.trim();
    if (!txt) return;
    setInputText('');
    if (!sessionRef.current) { await start('manual'); }
    clearSilenceTimer();
    setMessages((prev) => [...prev, { sender: 'user', text: txt }]);
    if (sessionRef.current) sessionRef.current.sendText(txt);
  }, [inputText, start]);

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
          disabled={!inputText.trim()}
          className="px-3 py-1.5 text-[12px] bg-[#C9A24B] hover:bg-[#b08b3a] disabled:opacity-40 text-white rounded-lg font-black transition-colors"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
