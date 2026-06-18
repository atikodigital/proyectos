/* eslint-disable no-undef */
/**
 * VarasVoice — orquestador de sesión Gemini Live para VARAS (voz).
 * A diferencia de KALY: NO hay onboarding, NO hay auto-start, NO hay timers de
 * inactividad/silencio. VARAS arranca SOLO cuando el usuario toca la esfera.
 * state: 'off' | 'connecting' | 'live' | 'listening' | 'speaking' | 'error'
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import VarasOrb from './VarasOrb.jsx';
import { openLiveSession } from '../kaly/live.js';
import { TOOL_DECLARATIONS, executeVarasVoiceTool } from './voice/tools.js';
import { buildVarasVoicePrompt, instruccionInicialVoz } from './voice/prompt.js';

const LIVE_MODEL_FALLBACK =
  typeof __KALY_LIVE_MODEL__ !== 'undefined'
    ? __KALY_LIVE_MODEL__
    : 'gemini-2.5-flash-native-audio-preview-09-2025';
/* eslint-enable no-undef */

const ORO = '#C9A24B';

export default function VarasVoice() {
  const [state, setState] = useState('off');
  const [level, setLevel] = useState(0);
  const [ultima, setUltima] = useState('');
  const [muted, setMutedState] = useState(false);

  const sessionRef = useRef(null);
  const mutedRef = useRef(muted);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const stop = useCallback(() => {
    if (sessionRef.current) { sessionRef.current.close(); sessionRef.current = null; }
    setState('off');
  }, []);

  const start = useCallback(async (motivo = 'manual') => {
    if (sessionRef.current) return;
    setState('connecting');
    setUltima('');

    let s;
    try { s = await api.agentSession(); }
    catch (_) { setState('error'); setTimeout(() => stop(), 3000); return; }

    const onState = (newState) => setState(newState);
    const onAudioLevel = (_dir, v) => setLevel(v);
    const onAgentTranscript = (text) => {
      setUltima((prev) => (prev ? prev + ' ' + text : text));
    };
    const onToolCall = async (fc) => {
      const out = await executeVarasVoiceTool(fc.name, fc.args);
      if (sessionRef.current) sessionRef.current.sendToolResponse(fc.id, fc.name, out);
    };
    const onClose = () => { sessionRef.current = null; setState('off'); };

    const session = openLiveSession({
      token: s.token,
      model: s.model || LIVE_MODEL_FALLBACK,
      voice: 'Gacrux',
      systemPrompt: buildVarasVoicePrompt(s.context || {}),
      tools: TOOL_DECLARATIONS,
      audio: true,
      onState, onAudioLevel, onAgentTranscript, onToolCall, onClose,
    });

    sessionRef.current = session;
    if (mutedRef.current && session.setMuted) session.setMuted(true);
    session.sendText(instruccionInicialVoz(motivo));
  }, [stop]);

  useEffect(() => () => {
    if (sessionRef.current) { sessionRef.current.close(); sessionRef.current = null; }
  }, []);

  const handleTap = useCallback(() => {
    if (state === 'off') start('manual'); else stop();
  }, [state, start, stop]);

  const toggleMute = useCallback(() => {
    const nv = !mutedRef.current;
    setMutedState(nv);
    if (sessionRef.current && sessionRef.current.setMuted) sessionRef.current.setMuted(nv);
  }, []);

  return (
    <div className="w-full flex flex-col items-center pt-1 pb-2">
      <div className="flex items-center gap-3">
        <VarasOrb state={state} audioLevel={level} onTap={handleTap} />
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? 'Activar voz de VARAS' : 'Silenciar VARAS'}
          className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm border ${muted ? 'text-white' : 'bg-white text-slate-500 border-slate-200'}`}
          style={muted ? { background: ORO, borderColor: ORO } : undefined}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      {state === 'error' ? <p className="text-[10px] text-red-400 mt-1 font-bold">VARAS no disponible</p> : null}

      {ultima ? (
        <p className="w-full text-[12px] mt-2 px-3 py-1.5 rounded-xl leading-snug line-clamp-2"
          style={{ background: ORO + '1a', color: '#3a2f12' }}>
          {ultima}
        </p>
      ) : null}
    </div>
  );
}
