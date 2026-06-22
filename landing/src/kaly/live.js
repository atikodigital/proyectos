// Port web de openLiveSession (Gemini Live, WS BidiGenerateContent v1alpha).
// La landing pública conecta vía opts.wsUrl (proxy del backend que pone la API key
// server-side); en modo directo usa opts.token. El navegador NUNCA ve la API key.
import { createVadGate } from './vad';

const WS_HOST = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

export function openLiveSession(opts) {
  const { token, model, systemPrompt, tools, voice, wsUrl, onAudioLevel, onState, onUserTranscript, onToolCall, onClose, wsFactory, audio = true, onReady } = opts;
  const url = wsUrl || `${WS_HOST}?key=${encodeURIComponent(token)}`;
  const ws = (wsFactory || ((u) => new WebSocket(u)))(url);
  let closed = false; let micStop = null; let player = null; let muted = false;
  let sessionReady = false;
  const queue = [];
  // Ahorro de costo: VAD (no manda silencio) + corte por inactividad.
  const gate = createVadGate({ threshold: opts.vadThreshold || 0.01, hangoverMs: opts.vadHangoverMs || 800 });
  const idleMs = opts.idleMs || 20000;
  let lastActivity = Date.now();
  let idleTimer = null;
  const bump = () => { lastActivity = Date.now(); };
  const startIdle = () => { if (idleTimer || !audio) return; idleTimer = setInterval(() => { if (Date.now() - lastActivity > idleMs) { try { ws.close(); } catch (e) {} } }, 4000); };
  const stopIdle = () => { if (idleTimer) { clearInterval(idleTimer); idleTimer = null; } };

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
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || 'Aoede' } }, languageCode: 'es-US' } },
      systemInstruction: { parts: [{ text: systemPrompt }] },
      tools: [{ functionDeclarations: tools }],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    } });
  };

  const sessionInstance = {
    sendText(text) { send({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } }); },
    sendToolResponse(id, name, response) { send({ toolResponse: { functionResponses: [{ id, name, response }] } }); },
    close() { cleanup(); try { ws.close(); } catch (e) {} },
    setMuted(m) { muted = !!m; },
  };

  ws.onmessage = async (ev) => {
    let data = ev.data;
    if (data instanceof Blob) data = await data.text();
    let msg; try { msg = JSON.parse(data); } catch (e) { return; }
    if (msg.setupComplete) {
      setState('listening');
      sessionReady = true;
      while (queue.length > 0) {
        const q = queue.shift();
        try { ws.send(JSON.stringify(q)); } catch (e) {}
      }
      if (audio) micStop = await startMic(send, onAudioLevel, gate, bump).catch(() => null);
      if (audio) player = createPlayer(onAudioLevel, setState, () => muted);
      startIdle();
      if (onReady) {
        onReady(sessionInstance);
      }
      return;
    }
    if (msg.toolCall && msg.toolCall.functionCalls) { for (const fc of msg.toolCall.functionCalls) onToolCall && onToolCall(fc); return; }
    const sc = msg.serverContent;
    if (!sc) return;
    if (sc.inputTranscription && sc.inputTranscription.text) onUserTranscript && onUserTranscript(sc.inputTranscription.text);
    if (sc.outputTranscription && sc.outputTranscription.text) opts.onAgentTranscript && opts.onAgentTranscript(sc.outputTranscription.text);
    if (sc.interrupted) { if (player) player.flush(); setState('listening'); }
    if (sc.modelTurn && sc.modelTurn.parts) {
      let textContent = '';
      for (const p of sc.modelTurn.parts) {
        if (p.inlineData && p.inlineData.data) { bump(); setState('speaking'); if (player) player.push(p.inlineData.data); }
        if (p.text) textContent += p.text;
      }
      if (textContent && opts.onAgentTranscript) {
        opts.onAgentTranscript(textContent);
      }
    }
    if (sc.turnComplete) { if (player) player.onDrain(() => setState('listening')); else setState('listening'); }
  };

  ws.onerror = () => setState('error');
  ws.onclose = () => { cleanup(); onClose && onClose(); };

  function cleanup() { if (closed) return; closed = true; stopIdle(); if (micStop) micStop(); if (player) player.stop(); }

  return sessionInstance;
}

// ── Browser audio helpers ────────────────────────────────────────────────────

export async function startMic(send, onLevel, gate, onVoiced) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    const ctx = new AudioContext({ sampleRate: 16000 });
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (e) => {
      try {
        const float32 = e.inputBuffer.getChannelData(0);
        const len = float32.length;
        const int16 = new Int16Array(len);
        let sumSq = 0;
        for (let i = 0; i < len; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]));
          int16[i] = s < 0 ? s * 32768 : s * 32767;
          sumSq += s * s;
        }
        // VAD: solo mandamos cuando hay voz (o dentro del hangover). Corta el silencio.
        const rms = Math.sqrt(sumSq / len);
        const gated = gate ? gate.feed(rms, Date.now()) : { send: true, voiced: true };
        if (gated.voiced && onVoiced) onVoiced();
        if (gated.send) {
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

    const resume = () => {
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('click', resume);
      window.addEventListener('touchstart', resume, { passive: true });
    }

    return function stop() {
      if (typeof window !== 'undefined') {
        window.removeEventListener('click', resume);
        window.removeEventListener('touchstart', resume);
      }
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
  let ctx;
  try { ctx = new AudioContext({ sampleRate: 24000 }); } catch (_) { return { push() {}, flush() {}, onDrain() {}, stop() {} }; }

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

  const resume = () => {
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('click', resume);
    window.addEventListener('touchstart', resume, { passive: true });
  }

  return {
    push(b64) {
      if (isMuted && isMuted()) { return; }
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      try {
        const binary = atob(b64);
        const len = binary.length >> 1;
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
      if (typeof window !== 'undefined') {
        window.removeEventListener('click', resume);
        window.removeEventListener('touchstart', resume);
      }
      try {
        activeSources.forEach((s) => { try { s.stop(); } catch (_) {} });
        activeSources.clear();
        pending = 0;
        drainCb = null;
      } catch (_) {}
      try { ctx.close(); } catch (_) {}
    },
  };
}
