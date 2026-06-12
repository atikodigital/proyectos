const WS_HOST = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

export function openLiveSession(opts) {
  const { token, model, systemPrompt, tools, onAudioLevel, onState, onUserTranscript, onToolCall, onClose, wsFactory, audio = true } = opts;
  const ws = (wsFactory || ((url) => new WebSocket(url)))(`${WS_HOST}?access_token=${encodeURIComponent(token)}`);
  let closed = false; let micStop = null; let player = null;

  const send = (obj) => { try { ws.send(JSON.stringify(obj)); } catch (e) {} };
  const setState = (s) => { if (onState) onState(s); };

  ws.onopen = () => {
    send({ setup: {
      model: `models/${model}`,
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } }, languageCode: 'es-US' } },
      systemInstruction: { parts: [{ text: systemPrompt }] },
      tools: [{ functionDeclarations: tools }],
      inputAudioTranscription: {},
    } });
  };

  ws.onmessage = async (ev) => {
    let data = ev.data;
    if (data instanceof Blob) data = await data.text();
    let msg; try { msg = JSON.parse(data); } catch (e) { return; }
    if (msg.setupComplete) { setState('live'); if (audio) micStop = await startMic(send, onAudioLevel).catch(() => null); if (audio) player = createPlayer(onAudioLevel, setState); return; }
    if (msg.toolCall && msg.toolCall.functionCalls) { for (const fc of msg.toolCall.functionCalls) onToolCall && onToolCall(fc); return; }
    const sc = msg.serverContent;
    if (!sc) return;
    if (sc.inputTranscription && sc.inputTranscription.text) onUserTranscript && onUserTranscript(sc.inputTranscription.text);
    if (sc.interrupted) { if (player) player.flush(); setState('listening'); }
    if (sc.modelTurn && sc.modelTurn.parts) {
      for (const p of sc.modelTurn.parts) {
        if (p.inlineData && p.inlineData.data) { setState('speaking'); if (player) player.push(p.inlineData.data); }
      }
    }
    if (sc.turnComplete) { if (player) player.onDrain(() => setState('listening')); else setState('listening'); }
  };

  ws.onerror = () => setState('error');
  ws.onclose = () => { cleanup(); onClose && onClose(); };

  function cleanup() { if (closed) return; closed = true; if (micStop) micStop(); if (player) player.stop(); }

  return {
    sendText(text) { send({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } }); },
    sendToolResponse(id, name, response) { send({ toolResponse: { functionResponses: [{ id, name, response }] } }); },
    close() { cleanup(); try { ws.close(); } catch (e) {} },
  };
}

// ── Browser audio helpers ────────────────────────────────────────────────────
// These only run on a real device (jsdom has no AudioContext / getUserMedia).
// The openLiveSession caller passes audio:false in tests to skip them entirely.

export async function startMic(send, onLevel) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    const ctx = new AudioContext({ sampleRate: 16000 });
    const source = ctx.createMediaStreamSource(stream);
    // ScriptProcessor is deprecated but universally available in browsers; worklets
    // would require an extra file and HTTPS blob URL which complicates testing paths.
    const processor = ctx.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (e) => {
      try {
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

        // Int16Array → base64 via binary string (no Buffer)
        const bytes = new Uint8Array(int16.buffer);
        const CHUNK = 8192;
        let binary = '';
        for (let i = 0; i < bytes.length; i += CHUNK) {
          binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        }
        const data = btoa(binary);

        send({ realtimeInput: { audio: { data, mimeType: 'audio/pcm;rate=16000' } } });

        if (onLevel) {
          const rms = Math.sqrt(sumSq / len);
          onLevel('in', rms);
        }
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

export function createPlayer(onLevel, setState) {
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

  return {
    push(b64) {
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
