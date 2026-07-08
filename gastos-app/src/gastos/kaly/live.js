import { createVadGate } from './vad';

const WS_HOST = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

export function openLiveSession(opts) {
  const { token, model, systemPrompt, tools, voice, onAudioLevel, onState, onUserTranscript, onToolCall, onClose, wsFactory, audio = true } = opts;
  // Manos libres (chat personal): el mic queda abierto todo el rato, así que hay que
  // cancelar por hardware el eco del PROPIO altavoz (si no, KALY se oye a sí misma y
  // se auto-responde en bucle). En empresa/Bluetooth se deja apagado (routing A2DP).
  const echoCancellation = !!opts.echoCancellation;
  // Tiempo que el mic sigue MUDO después de que KALY terminó de hablar (cola de
  // seguridad para que la última sílaba por el parlante no entre como "usuario").
  const halfDuplexTailMs = opts.halfDuplexTailMs || 250;
  // Ahorro de costo: VAD (no manda silencio) + corte por inactividad.
  const gate = createVadGate({ threshold: opts.vadThreshold || 0.012, hangoverMs: opts.vadHangoverMs || 800 });
  const idleMs = opts.idleMs || 25000;
  let lastActivity = Date.now();
  let idleTimer = null;
  const bump = () => { lastActivity = Date.now(); };
  const startIdle = () => {
    if (idleTimer || !audio) return;
    idleTimer = setInterval(() => { if (Date.now() - lastActivity > idleMs) { try { ws.close(); } catch (e) {} } }, 4000);
  };
  const stopIdle = () => { if (idleTimer) { clearInterval(idleTimer); idleTimer = null; } };
  // El token efímero se pasa como `key` (Gemini lo acepta en lugar de la API key real).
  const ws = (wsFactory || ((url) => new WebSocket(url)))(`${WS_HOST}?key=${encodeURIComponent(token)}`);
  let closed = false; let micStop = null; let player = null; let muted = false; let agentSpeaking = false;
  let sessionReady = false;
  const queue = [];

  const send = (obj) => {
    if (obj.setup) {
      try { ws.send(JSON.stringify(obj)); } catch (e) {}
    } else if (sessionReady && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(obj)); } catch (e) {}
    } else {
      queue.push(obj);
    }
  };
  const setState = (s) => { if (onState) onState(s); };

  ws.onopen = () => {
    send({ setup: {
      model: `models/${model}`,
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || 'Charon' } }, languageCode: 'es-US' } },
      systemInstruction: { parts: [{ text: systemPrompt }] },
      tools: [{ functionDeclarations: tools }],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    } });
  };

  ws.onmessage = async (ev) => {
    let data = ev.data;
    if (data instanceof Blob) data = await data.text();
    let msg; try { msg = JSON.parse(data); } catch (e) { return; }
    if (msg.setupComplete) {
      setState('live');
      sessionReady = true;
      while (queue.length > 0) {
        const q = queue.shift();
        try { ws.send(JSON.stringify(q)); } catch (e) {}
      }
      if (audio) micStop = await startMic(send, onAudioLevel, () => agentSpeaking, gate, bump, { echoCancellation }).catch(() => null);
      if (audio) player = createPlayer(onAudioLevel, setState, () => muted);
      startIdle();
      return;
    }
    if (msg.toolCall && msg.toolCall.functionCalls) { for (const fc of msg.toolCall.functionCalls) onToolCall && onToolCall(fc); return; }
    const sc = msg.serverContent;
    if (!sc) return;
    if (sc.inputTranscription && sc.inputTranscription.text) onUserTranscript && onUserTranscript(sc.inputTranscription.text);
    if (sc.outputTranscription && sc.outputTranscription.text) opts.onAgentTranscript && opts.onAgentTranscript(sc.outputTranscription.text);
    if (sc.interrupted) { if (player) player.flush(); agentSpeaking = false; setState('listening'); }
    if (sc.modelTurn && sc.modelTurn.parts) {
      let textContent = '';
      for (const p of sc.modelTurn.parts) {
        if (p.inlineData && p.inlineData.data) { agentSpeaking = true; bump(); setState('speaking'); if (player) player.push(p.inlineData.data); }
        if (p.text) textContent += p.text;
      }
      if (textContent && opts.onAgentTranscript) {
        opts.onAgentTranscript(textContent);
      }
    }
    if (sc.turnComplete) {
      if (player) player.onDrain(() => { setState('listening'); setTimeout(() => { agentSpeaking = false; }, halfDuplexTailMs); });
      else { agentSpeaking = false; setState('listening'); }
    }
  };

  ws.onerror = () => setState('error');
  ws.onclose = (ev) => { cleanup(); onClose && onClose({ code: ev && ev.code, reason: ev && ev.reason, wasClean: ev && ev.wasClean }); };

  function cleanup() { if (closed) return; closed = true; stopIdle(); if (micStop) micStop(); if (player) player.stop(); }

  return {
    sendText(text) { send({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } }); },
    sendToolResponse(id, name, response) { send({ toolResponse: { functionResponses: [{ id, name, response }] } }); },
    close() { cleanup(); try { ws.close(); } catch (e) {} },
    setMuted(m) { muted = !!m; },
  };
}

// ── Browser audio helpers ────────────────────────────────────────────────────
// These only run on a real device (jsdom has no AudioContext / getUserMedia).
// The openLiveSession caller passes audio:false in tests to skip them entirely.

// AudioContext de reproducción COMPARTIDO y desbloqueado por gesto del usuario.
// En WebView Android el AudioContext nace 'suspended' y solo se puede reanudar
// dentro de un gesto. Si lo creáramos al recibir setupComplete (tras el handshake
// WS, ya fuera del gesto), el saludo no sonaría hasta el siguiente toque. Por eso
// usamos UNO solo, lo desbloqueamos en el primer gesto, y lo reutilizamos.
let _playCtx = null;
function _getPlayCtx() {
  if (typeof window === 'undefined') return null;
  if (!_playCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { _playCtx = new AC(); } catch (_) { return null; }
  }
  return _playCtx;
}

// Desbloquea (reanuda) el audio. Seguro de llamar muchas veces. Llamar SIEMPRE
// dentro de un gesto del usuario (tap en la esfera, enviar texto, etc.).
export function unlockAudio() {
  const ctx = _getPlayCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') { try { ctx.resume(); } catch (_) {} }
  try {
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource();
    s.buffer = b; s.connect(ctx.destination); s.start(0);
  } catch (_) {}
}

// Diagnóstico: estado del contexto de audio (para mostrar en pantalla).
export function audioDiag() {
  const ctx = _playCtx;
  return { estado: ctx ? ctx.state : 'sin-contexto', sampleRate: ctx ? Math.round(ctx.sampleRate) : 0 };
}

// Reproduce un beep por el MISMO camino de audio que la voz de los agentes.
// Si se escucha → la salida de audio funciona (el problema sería la sesión Gemini).
// Si NO se escucha → el problema es la salida/volumen/ruteo del dispositivo.
export function playTestTone() {
  unlockAudio();
  const ctx = _getPlayCtx();
  if (!ctx) return 'sin-contexto';
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 660;
    g.gain.value = 0.001;
    osc.connect(g); g.connect(ctx.destination);
    const t = ctx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    osc.start(t); osc.stop(t + 0.72);
  } catch (_) {}
  return ctx.state;
}

// Red de seguridad: desbloquear en el PRIMER gesto del usuario en toda la app.
if (typeof window !== 'undefined' && !window.__kalyAudioUnlockHooked) {
  window.__kalyAudioUnlockHooked = true;
  const onFirstGesture = () => { unlockAudio(); };
  window.addEventListener('pointerdown', onFirstGesture, { passive: true });
  window.addEventListener('touchstart', onFirstGesture, { passive: true });
  window.addEventListener('click', onFirstGesture, { passive: true });
}

export async function startMic(send, onLevel, isAgentSpeaking, gate, onVoiced, micOpts = {}) {
  try {
    // OJO Android/Bluetooth: pedir echoCancellation/noiseSuppression/AGC hace que el
    // WebView entre en "modo comunicación" (como una llamada) y enrute el audio al
    // parlante o a Bluetooth SCO en vez de A2DP (audífonos), y manda el volumen al
    // stream de llamada. Por eso en empresa se dejan en false (modo multimedia, A2DP).
    // En manos libres (chat personal) el eco del PROPIO altavoz haría que KALY se
    // oiga y se auto-responda en bucle → ahí SÍ activamos la cancelación de eco.
    const ec = !!micOpts.echoCancellation;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: ec, noiseSuppression: ec, autoGainControl: false },
    });
    const ctx = new AudioContext({ sampleRate: 16000 });
    const source = ctx.createMediaStreamSource(stream);
    // ScriptProcessor is deprecated but universally available in browsers; worklets
    // would require an extra file and HTTPS blob URL which complicates testing paths.
    const processor = ctx.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (e) => {
      try {
        // Half-duplex: mic callado mientras el agente habla, para que su propia voz
        // (recogida por el mic sin echoCancellation) no se interprete como interrupción.
        if (isAgentSpeaking && isAgentSpeaking()) return;
        const float32 = e.inputBuffer.getChannelData(0);
        const len = float32.length;

        // Float32 → Int16 (clamp ±1 → *32767)
        const int16 = new Int16Array(len);
        let sumSq = 0;
        for (let i = 0; i < len; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]));
          int16[i] = s < 0 ? s * 32768 : s * 32767;
          sumSq += s * s;
        }

        // VAD: solo mandamos cuando hay voz (o dentro del hangover). Corta el silencio
        // y el ruido de fondo → baja fuerte el costo, sin perder lo que el usuario dice.
        const rms = Math.sqrt(sumSq / len);
        const gated = gate ? gate.feed(rms, Date.now()) : { send: true, voiced: true };
        if (gated.voiced && onVoiced) onVoiced();

        if (gated.send) {
          // Int16Array → base64 via binary string (no Buffer)
          const bytes = new Uint8Array(int16.buffer);
          const CHUNK = 8192;
          let binary = '';
          for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
          }
          const data = btoa(binary);
          send({ realtimeInput: { audio: { data, mimeType: 'audio/pcm;rate=16000' } } });
        }

        if (onLevel) onLevel('in', rms);
      } catch (_) {}
    };

    source.connect(processor);
    processor.connect(ctx.destination);

    return function stop() {
      try { processor.disconnect(); } catch (_) {}
      try { source.disconnect(); } catch (_) {}
      try { stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
      try { ctx.close(); } catch (_) {}
    };
  } catch (e) {
    return () => {};
  }
}

export function createPlayer(onLevel, setState, isMuted) {
  const ctx = _getPlayCtx();
  if (!ctx) { return { push() {}, flush() {}, onDrain() {}, stop() {} }; }
  if (ctx.state === 'suspended') { try { ctx.resume(); } catch (_) {} }

  let cursor = ctx.currentTime;
  let pending = 0;
  let drainCb = null;
  const activeSources = new Set();

  function checkDrain() {
    if (pending === 0 && drainCb) {
      const cb = drainCb;
      drainCb = null;
      cb();
    }
  }

  return {
    push(b64) {
      if (isMuted && isMuted()) { return; }
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      try {
        // atob → binary string → Int16Array (little-endian pairs)
        const binary = atob(b64);
        const len = binary.length >> 1; // each sample = 2 bytes
        const dv = new DataView(new ArrayBuffer(binary.length));
        for (let i = 0; i < binary.length; i++) dv.setUint8(i, binary.charCodeAt(i));

        const float32 = new Float32Array(len);
        let sumSq = 0;
        for (let i = 0; i < len; i++) {
          const s = dv.getInt16(i * 2, true) / 32768;
          float32[i] = s;
          sumSq += s * s;
        }

        const buffer = ctx.createBuffer(1, len, 24000);
        buffer.copyToChannel(float32, 0);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);

        const at = Math.max(ctx.currentTime, cursor);
        const duration = len / 24000;
        source.start(at);
        cursor = at + duration;
        pending++;
        activeSources.add(source);

        if (onLevel) {
          const rms = Math.sqrt(sumSq / Math.max(1, len));
          onLevel('out', rms);
        }

        source.onended = () => {
          activeSources.delete(source);
          pending--;
          checkDrain();
        };
      } catch (_) {}
    },

    flush() {
      try {
        activeSources.forEach((s) => { try { s.stop(); } catch (_) {} });
        activeSources.clear();
        pending = 0;
        cursor = ctx.currentTime;
        drainCb = null;
      } catch (_) {}
    },

    onDrain(cb) {
      drainCb = cb;
      checkDrain();
    },

    stop() {
      // No cerramos el AudioContext compartido; solo detenemos las fuentes activas.
      try {
        activeSources.forEach((s) => { try { s.stop(); } catch (_) {} });
        activeSources.clear();
        pending = 0;
        drainCb = null;
      } catch (_) {}
    },
  };
}
