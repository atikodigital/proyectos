/* eslint-disable no-undef */
/**
 * Kaly Agent — orquestador de sesión Gemini Live con Chat interactivo.
 *
 * state: 'off' | 'connecting' | 'live' | 'listening' | 'speaking' | 'error'
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import KalyOrb from './KalyOrb.jsx';
import { openLiveSession } from './live.js';
import { TOOL_DECLARATIONS, executeTool } from './tools.js';
import { buildSystemPrompt, instruccionInicial } from './prompt.js';
import {
  decideAutoStart,
  esNegativa,
  hoyStr,
  SILENCE_MS,
  INACTIVITY_MS,
} from './logic.js';

const LIVE_MODEL_FALLBACK =
  typeof __KALY_LIVE_MODEL__ !== 'undefined'
    ? __KALY_LIVE_MODEL__
    : 'gemini-2.5-flash-native-audio-preview-09-2025';
/* eslint-enable no-undef */

export default function KalyAgent() {
  const [state, setState] = useState('off');
  const [level, setLevel] = useState(0);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');

  const sessionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const inactivityTimerRef = useRef(null);
  const contextRef = useRef(null);
  const messagesEndRef = useRef(null);

  // ── scroll control ────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // ── helpers ────────────────────────────────────────────────────────────────

  function clearSilenceTimer() {
    if (silenceTimerRef.current != null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }

  function armSilenceTimer(stopFn) {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      silenceTimerRef.current = null;
      stopFn();
    }, SILENCE_MS);
  }

  // ── stop ───────────────────────────────────────────────────────────────────

  const stop = useCallback(() => {
    clearSilenceTimer();
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    setState('off');
    setMessages([]);
  }, []);

  // ── start ──────────────────────────────────────────────────────────────────

  const start = useCallback(
    async (motivo) => {
      if (sessionRef.current) return; // already running

      setState('connecting');
      setMessages([{ sender: 'kaly', text: 'Conectando con Kaly...', isSystem: true }]);

      let s;
      try {
        s = await api.agentSession();
      } catch (_) {
        setState('error');
        setMessages([{ sender: 'kaly', text: 'Kaly no disponible. Intente más tarde.', isSystem: true }]);
        setTimeout(() => stop(), 3000);
        return;
      }

      contextRef.current = s.context;

      // Correct motivo if user is already onboarded
      if (motivo === 'onboarding' && s.context && s.context.onboarded) {
        motivo = 'saludo';
      }

      // Persist onboarding flag
      if (s.context && s.context.onboarded) {
        localStorage.setItem('kaly_onboarded', '1');
      }

      // Callbacks wired to the session

      const onState = (newState) => {
        setState(newState);
        if (newState === 'live') {
          setMessages((prev) => [
            ...prev.filter((m) => !m.isSystem),
            { sender: 'kaly', text: 'Kaly activa y escuchando.', isSystem: true },
          ]);
        } else if (newState === 'listening') {
          // Arm silence timer — stop if no user speech comes
          armSilenceTimer(stop);
        } else if (newState === 'speaking') {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.sender === 'kaly' && last.text === '🔊 [Hablando...]') {
              return prev;
            }
            return [...prev, { sender: 'kaly', text: '🔊 [Hablando...]' }];
          });
        }
      };

      const onAudioLevel = (_dir, v) => {
        setLevel(v);
      };

      const onUserTranscript = (text) => {
        // User spoke — cancel silence timer
        clearSilenceTimer();
        setMessages((prev) => [...prev, { sender: 'user', text }]);
        if (esNegativa(text)) {
          // Leave time for KALY to say goodbye, then stop
          setTimeout(() => stop(), 2500);
        }
      };

      const onAgentTranscript = (text) => {
        setMessages((prev) => {
          // Remove the "🔊 [Hablando...]" placeholder if present
          const filtered = prev.filter((m) => m.text !== '🔊 [Hablando...]');
          const last = filtered[filtered.length - 1];
          if (last && last.sender === 'kaly' && !last.isSystem) {
            return [...filtered.slice(0, -1), { sender: 'kaly', text: last.text + ' ' + text }];
          }
          return [...filtered, { sender: 'kaly', text }];
        });
      };

      const onToolCall = async (fc) => {
        const out = await executeTool(fc.name, fc.args, {
          onPrefsSaved: (p) => {
            contextRef.current = {
              ...contextRef.current,
              ...p,
              onboarded: true,
            };
            localStorage.setItem('kaly_onboarded', '1');
          },
        });
        if (sessionRef.current) {
          sessionRef.current.sendToolResponse(fc.id, fc.name, out);
        }
      };

      const onClose = () => {
        sessionRef.current = null;
        setState('off');
        setMessages([]);
      };

      const session = openLiveSession({
        token: s.token,
        model: s.model || LIVE_MODEL_FALLBACK,
        systemPrompt: buildSystemPrompt(s.context),
        tools: TOOL_DECLARATIONS,
        audio: true,
        onState,
        onAudioLevel,
        onUserTranscript,
        onAgentTranscript,
        onToolCall,
        onClose,
      });

      sessionRef.current = session;

      // Send the initial instruction to kick off conversation
      session.sendText(instruccionInicial(s.context, motivo));

      // Record today's greeting date so we don't repeat it
      if (motivo === 'saludo') {
        localStorage.setItem('kaly_last_greet', hoyStr());
      }
    },
    [stop],
  );

  // ── auto-start on mount ────────────────────────────────────────────────────

  useEffect(() => {
    const onboarded = localStorage.getItem('kaly_onboarded') === '1';
    const motivo = decideAutoStart({ onboarded });
    if (motivo) {
      start(motivo);
    }
    // Intentional: run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── inactivity timer ───────────────────────────────────────────────────────

  useEffect(() => {
    function resetInactivity() {
      if (inactivityTimerRef.current != null) {
        clearTimeout(inactivityTimerRef.current);
      }
      inactivityTimerRef.current = setTimeout(() => {
        inactivityTimerRef.current = null;
        // Use a functional check with a ref so we read current state
        setState((current) => {
          if (current === 'off') {
            // Can't call start directly here without stale closure issues,
            // so schedule it in the next tick.
            setTimeout(() => start('inactividad'), 0);
          }
          return current;
        });
      }, INACTIVITY_MS);
    }

    resetInactivity();

    window.addEventListener('click', resetInactivity);
    window.addEventListener('touchstart', resetInactivity);

    return () => {
      if (inactivityTimerRef.current != null) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      window.removeEventListener('click', resetInactivity);
      window.removeEventListener('touchstart', resetInactivity);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  // ── cleanup on unmount ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      clearSilenceTimer();
      if (inactivityTimerRef.current != null) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      if (sessionRef.current) {
        sessionRef.current.close();
        sessionRef.current = null;
      }
    };
  }, []);

  // ── tap handler ────────────────────────────────────────────────────────────

  const handleTap = useCallback(() => {
    if (state === 'off') {
      start('manual');
    } else {
      stop();
    }
  }, [state, start, stop]);

  // ── send text handler ──────────────────────────────────────────────────────

  const handleSendText = () => {
    if (!inputText.trim()) return;
    const txt = inputText.trim();
    setInputText('');
    clearSilenceTimer();
    setMessages((prev) => [...prev, { sender: 'user', text: txt }]);
    if (sessionRef.current) {
      sessionRef.current.sendText(txt);
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col items-center pt-2 pb-2 bg-slate-50/50 border border-slate-200/40 rounded-2xl shadow-sm px-4">
      <KalyOrb state={state} audioLevel={level} onTap={handleTap} />
      {state === 'error' ? (
        <p className="text-[10px] text-red-400 mt-1 font-bold">Kaly no disponible</p>
      ) : null}

      {/* Chat History View */}
      {state !== 'off' && (
        <div className="w-full mt-2.5 flex flex-col transition-all duration-300">
          <div className="w-full h-28 overflow-y-auto bg-white border border-slate-200 rounded-xl p-2.5 flex flex-col gap-1.5 shadow-inner">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex flex-col max-w-[85%] ${
                  msg.sender === 'user' ? 'self-end items-end' : 'self-start items-start'
                }`}
              >
                <div
                  className={`px-3 py-1.5 rounded-2xl text-[11px] leading-snug font-semibold ${
                    msg.isSystem
                      ? 'bg-neutral-100 text-neutral-500 text-[9px] py-1 px-2.5 rounded-lg'
                      : msg.sender === 'user'
                      ? 'bg-[#C9A24B] text-white rounded-tr-none'
                      : 'bg-sky-100 text-sky-800 rounded-tl-none border border-sky-200/50'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Text Input Bar */}
          <div className="flex items-center gap-2 mt-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendText();
              }}
              placeholder="Escribe a Kaly..."
              className="flex-1 px-3 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C9A24B] bg-white text-slate-800 font-medium"
            />
            <button
              onClick={handleSendText}
              disabled={!inputText.trim()}
              className="px-3 py-1.5 text-[11px] bg-[#C9A24B] hover:bg-[#b08b3a] disabled:opacity-40 disabled:hover:bg-[#C9A24B] text-white rounded-lg font-black transition-colors"
            >
              Enviar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
