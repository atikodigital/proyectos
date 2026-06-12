/* eslint-disable no-undef */
/**
 * K.A.L.Y. Agent — orquestador de sesión Gemini Live.
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

// Fallback model — the backend always returns `model` in the session but we
// guard against missing Vite define so the module works under Jest too.
const LIVE_MODEL_FALLBACK =
  typeof __KALY_LIVE_MODEL__ !== 'undefined'
    ? __KALY_LIVE_MODEL__
    : 'gemini-2.5-flash-native-audio-preview-09-2025';
/* eslint-enable no-undef */

export default function KalyAgent() {
  const [state, setState] = useState('off');
  const [level, setLevel] = useState(0);

  const sessionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const inactivityTimerRef = useRef(null);
  const contextRef = useRef(null);

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
  }, []);

  // ── start ──────────────────────────────────────────────────────────────────

  const start = useCallback(
    async (motivo) => {
      if (sessionRef.current) return; // already running

      setState('connecting');

      let s;
      try {
        s = await api.agentSession();
      } catch (_) {
        setState('error');
        setTimeout(() => setState('off'), 3000);
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
        if (newState === 'listening') {
          // Arm silence timer — stop if no user speech comes
          armSilenceTimer(stop);
        }
      };

      const onAudioLevel = (_dir, v) => {
        setLevel(v);
      };

      const onUserTranscript = (text) => {
        // User spoke — cancel silence timer
        clearSilenceTimer();
        if (esNegativa(text)) {
          // Leave time for KALY to say goodbye, then stop
          setTimeout(() => stop(), 2500);
        }
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

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center pt-2 pb-1">
      <KalyOrb state={state} audioLevel={level} onTap={handleTap} />
      {state === 'error' ? (
        <p className="text-xs text-red-400">Kaly no disponible</p>
      ) : null}
    </div>
  );
}
