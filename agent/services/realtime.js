// ═══════════════════════════════════════════════════════════════
// ATIKO AGENT · Voz en tiempo real (multi-proveedor)
// Relay WebSocket navegador <──> servidor <──> (Gemini Live | OpenAI Realtime).
//
// Proveedor: REALTIME_PROVIDER (o AGENT_PROVIDER) = 'gemini' | 'openai'.
// La API key vive SOLO en el servidor. El navegador nunca la ve.
//
// Protocolo navegador ⇄ servidor (IGUAL para ambos proveedores, no cambia el widget):
//   Navegador → Servidor:
//     · binario  = chunk de audio del micrófono (PCM16 mono 24 kHz LE)
//     · texto JSON {type:'text', text}      → mensaje escrito del usuario
//     · texto JSON {type:'interrupt'}       → cortar la respuesta en curso
//   Servidor → Navegador:
//     · binario  = chunk de audio a reproducir (PCM16 mono 24 kHz LE)
//     · texto JSON {type:'ready'}            → sesión lista
//     · texto JSON {type:'user_speaking'}    → el usuario empezó a hablar (barge-in)
//     · texto JSON {type:'user_transcript', text}
//     · texto JSON {type:'assistant_transcript', text, done}
//     · texto JSON {type:'speaking', value}  → KAI está emitiendo audio (true/false)
//     · texto JSON {type:'error', message}
// ═══════════════════════════════════════════════════════════════

const WebSocket = require('ws');
const { SYSTEM_PROMPT } = require('../config/prompt');

const PROVIDER = (process.env.REALTIME_PROVIDER || process.env.AGENT_PROVIDER || 'openai').toLowerCase();

// ── OpenAI Realtime ──
const REALTIME_MODEL = process.env.REALTIME_MODEL || 'gpt-realtime';
const REALTIME_VOICE = process.env.REALTIME_VOICE || 'ballad';
const OPENAI_URL = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(REALTIME_MODEL)}`;

// ── Gemini Live (audio nativo, voz JARVIS estilo "Mark-XXXIX") ──
const GEMINI_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'models/gemini-2.5-flash-native-audio-preview-12-2025';
const GEMINI_LIVE_VOICE = process.env.GEMINI_LIVE_VOICE || 'Charon';
const GEMINI_LIVE_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const BROWSER_RATE = 24000; // el widget manda/recibe 24 kHz
const GEMINI_IN_RATE = 16000; // Gemini Live exige entrada PCM16 16 kHz

// Instrucciones de personalidad para la sesión de voz (reusa el prompt de Kai
// + matices específicos de voz estilo J.A.R.V.I.S.).
const VOICE_INSTRUCTIONS = `${SYSTEM_PROMPT}

## MODO VOZ (tiempo real)
- Estás conversando por voz, no por texto. Responde de forma natural, breve y conversacional (1-3 frases salvo que pidan detalle).
- Voz y acento tipo J.A.R.V.I.S. de Iron Man: un mayordomo digital británico, elegante y sofisticado. Voz grave, serena y segura, con la dicción y el refinamiento de un caballero inglés — un leve acento británico, aunque hables español. Cálido pero impecablemente formal. Nada robótico.
- Hablas en español (cliente chileno), pero con esa elegancia y corte inglés en la entonación.
- No leas listas largas ni markdown en voz alta; resume y ofrece enviar el detalle por escrito o WhatsApp.
- Si te interrumpen, detente y escucha.`;

// Remuestreo lineal de PCM16 mono (para bajar 24 kHz → 16 kHz hacia Gemini).
function resamplePcm16(buf, fromRate, toRate) {
  if (fromRate === toRate || !buf || buf.length < 2) return buf;
  const inSamples = Math.floor(buf.length / 2);
  const ratio = fromRate / toRate;
  const outSamples = Math.floor(inSamples / ratio);
  const out = Buffer.alloc(outSamples * 2);
  for (let i = 0; i < outSamples; i++) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, inSamples - 1);
    const frac = srcPos - i0;
    const s0 = buf.readInt16LE(i0 * 2);
    const s1 = buf.readInt16LE(i1 * 2);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s0 + (s1 - s0) * frac))), i * 2);
  }
  return out;
}

/**
 * Punto de entrada: enruta al proveedor configurado.
 * @param {WebSocket} clientWs  socket del navegador (ya aceptado)
 */
function handleConnection(clientWs, opts) {
  opts = opts || {};
  if (PROVIDER === 'gemini') return handleGeminiConnection(clientWs, opts);
  return handleOpenAIConnection(clientWs, opts);
}

// ═══════════════════════════════════════════════════════════════
// GEMINI LIVE
// ═══════════════════════════════════════════════════════════════
function handleGeminiConnection(clientWs, opts) {
  opts = opts || {};
  if (!process.env.GEMINI_API_KEY) {
    safeSend(clientWs, JSON.stringify({ type: 'error', message: 'GEMINI_API_KEY no configurada en el servidor' }));
    clientWs.close();
    return;
  }

  console.log('[Realtime/Gemini] Cliente conectado, abriendo sesión Live (' + GEMINI_LIVE_VOICE + ')...');

  const url = GEMINI_LIVE_URL + '?key=' + encodeURIComponent(process.env.GEMINI_API_KEY);
  const upstream = new WebSocket(url);

  let ready = false;
  let speaking = false;
  const pending = []; // audio del mic antes de setupComplete
  // Captura al CRM: acumulamos las transcripciones del turno y, al completarse, lo registramos.
  const voiceSid = opts.sessionId || ('voice_' + Date.now());
  let turnUser = '', turnKai = '';
  function flushTurn() {
    const u = turnUser.trim(), k = turnKai.trim();
    turnUser = ''; turnKai = '';
    if (!u && !k) return;
    try { require('./ai').recordVoiceTurn(voiceSid, u, k, 'web'); } catch (e) {}
  }

  upstream.on('open', () => {
    upstream.send(JSON.stringify({
      setup: {
        model: GEMINI_LIVE_MODEL,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_LIVE_VOICE } },
          },
        },
        systemInstruction: { parts: [{ text: VOICE_INSTRUCTIONS }] },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: { automaticActivityDetection: {} },
      },
    }));
  });

  upstream.on('message', (data) => {
    let evt;
    try { evt = JSON.parse(data.toString()); } catch (e) { return; }

    // Sesión lista
    if (evt.setupComplete) {
      if (!ready) {
        ready = true;
        for (const chunk of pending) sendAudio(chunk);
        pending.length = 0;
        safeSend(clientWs, JSON.stringify({ type: 'ready' }));
      }
      return;
    }

    const sc = evt.serverContent;
    if (sc) {
      // Barge-in: el usuario interrumpió → cortar reproducción en el navegador
      if (sc.interrupted) {
        speaking = false;
        safeSend(clientWs, JSON.stringify({ type: 'user_speaking' }));
        safeSend(clientWs, JSON.stringify({ type: 'speaking', value: false }));
      }

      // Audio de salida (PCM16 24 kHz) → binario al navegador
      const parts = (sc.modelTurn && sc.modelTurn.parts) || [];
      for (const p of parts) {
        const inline = p.inlineData || p.inline_data;
        if (inline && inline.data) {
          if (!speaking) { speaking = true; safeSend(clientWs, JSON.stringify({ type: 'speaking', value: true })); }
          safeSend(clientWs, Buffer.from(inline.data, 'base64'));
        }
      }

      // Transcripciones (subtítulos + acumulación para el CRM)
      const ot = sc.outputTranscription || sc.output_transcription;
      if (ot && ot.text) { turnKai += ot.text; safeSend(clientWs, JSON.stringify({ type: 'assistant_transcript', text: ot.text, done: false })); }
      const it = sc.inputTranscription || sc.input_transcription;
      if (it && it.text) { turnUser += it.text; safeSend(clientWs, JSON.stringify({ type: 'user_transcript', text: it.text })); }

      // Fin de turno → registrar la conversación de voz en el CRM
      if (sc.turnComplete || sc.generationComplete) {
        if (speaking) { speaking = false; safeSend(clientWs, JSON.stringify({ type: 'speaking', value: false })); }
        safeSend(clientWs, JSON.stringify({ type: 'assistant_transcript', text: '', done: true }));
        flushTurn();
      }
      return;
    }

    if (evt.error) {
      const m = evt.error.message || 'Error en la sesión de voz';
      console.error('[Realtime/Gemini] Error:', m);
      safeSend(clientWs, JSON.stringify({ type: 'error', message: m }));
    }
  });

  upstream.on('close', (code, reason) => {
    console.log('[Realtime/Gemini] Live cerró:', code, reason && reason.toString().slice(0, 120));
    safeClose(clientWs);
  });
  upstream.on('error', (err) => {
    console.error('[Realtime/Gemini] Error upstream:', err.message);
    safeSend(clientWs, JSON.stringify({ type: 'error', message: 'No se pudo conectar con el servicio de voz (Gemini)' }));
    safeClose(clientWs);
  });

  // Envía un chunk de audio del mic a Gemini (remuestreado a 16 kHz)
  function sendAudio(buf24k) {
    if (upstream.readyState !== WebSocket.OPEN) return;
    const buf16k = resamplePcm16(buf24k, BROWSER_RATE, GEMINI_IN_RATE);
    upstream.send(JSON.stringify({
      realtimeInput: { audio: { data: buf16k.toString('base64'), mimeType: 'audio/pcm;rate=' + GEMINI_IN_RATE } },
    }));
  }

  clientWs.on('message', (data, isBinary) => {
    if (isBinary) {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (ready) sendAudio(buf); else pending.push(buf);
      return;
    }
    let msg;
    try { msg = JSON.parse(data.toString()); } catch (e) { return; }
    if (msg.type === 'text' && msg.text) {
      if (upstream.readyState !== WebSocket.OPEN) return;
      upstream.send(JSON.stringify({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: String(msg.text).slice(0, 2000) }] }],
          turnComplete: true,
        },
      }));
    } else if (msg.type === 'interrupt') {
      // Con VAD automático Gemini gestiona el barge-in; reforzamos cortando el audio local.
      if (speaking) { speaking = false; safeSend(clientWs, JSON.stringify({ type: 'speaking', value: false })); }
    }
  });

  clientWs.on('close', () => { console.log('[Realtime/Gemini] Cliente desconectado'); flushTurn(); safeClose(upstream); });
  clientWs.on('error', (err) => { console.error('[Realtime/Gemini] Error cliente:', err.message); flushTurn(); safeClose(upstream); });
}

// ═══════════════════════════════════════════════════════════════
// OPENAI REALTIME (respaldo)
// ═══════════════════════════════════════════════════════════════
function handleOpenAIConnection(clientWs, opts) {
  opts = opts || {};
  if (!process.env.OPENAI_API_KEY) {
    safeSend(clientWs, JSON.stringify({ type: 'error', message: 'OPENAI_API_KEY no configurada en el servidor' }));
    clientWs.close();
    return;
  }

  console.log('[Realtime] Cliente conectado, abriendo sesión con OpenAI...');

  const upstream = new WebSocket(OPENAI_URL, {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  });

  let upstreamReady = false;
  const pendingAudio = [];
  // Captura al CRM
  const voiceSid = opts.sessionId || ('voice_' + Date.now());
  let turnUser = '', turnKai = '';
  function flushTurn() {
    const u = turnUser.trim(), k = turnKai.trim();
    turnUser = ''; turnKai = '';
    if (!u && !k) return;
    try { require('./ai').recordVoiceTurn(voiceSid, u, k, 'web'); } catch (e) {}
  }

  upstream.on('open', () => {
    console.log('[Realtime] Conectado a OpenAI:', REALTIME_MODEL);
    upstream.send(JSON.stringify({
      type: 'session.update',
      session: {
        type: 'realtime',
        output_modalities: ['audio'],
        instructions: VOICE_INSTRUCTIONS,
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            transcription: { model: 'whisper-1' },
            turn_detection: {
              type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300,
              silence_duration_ms: 600, create_response: true, interrupt_response: true,
            },
          },
          output: { format: { type: 'audio/pcm', rate: 24000 }, voice: REALTIME_VOICE, speed: 1 },
        },
      },
    }));
  });

  upstream.on('message', (data) => {
    let evt;
    try { evt = JSON.parse(data.toString()); } catch (e) { return; }
    switch (evt.type) {
      case 'session.updated':
        if (!upstreamReady) {
          upstreamReady = true;
          for (const chunk of pendingAudio) appendAudio(chunk);
          pendingAudio.length = 0;
          safeSend(clientWs, JSON.stringify({ type: 'ready' }));
        }
        break;
      case 'input_audio_buffer.speech_started':
        safeSend(clientWs, JSON.stringify({ type: 'user_speaking' }));
        break;
      case 'response.output_audio.delta':
        if (evt.delta) safeSend(clientWs, Buffer.from(evt.delta, 'base64'));
        break;
      case 'response.output_audio.done':
        safeSend(clientWs, JSON.stringify({ type: 'speaking', value: false }));
        break;
      case 'response.output_audio_transcript.delta':
        if (evt.delta) safeSend(clientWs, JSON.stringify({ type: 'assistant_transcript', text: evt.delta, done: false }));
        break;
      case 'response.output_audio_transcript.done':
        turnKai = evt.transcript || '';
        safeSend(clientWs, JSON.stringify({ type: 'assistant_transcript', text: evt.transcript || '', done: true }));
        flushTurn();
        break;
      case 'conversation.item.input_audio_transcription.completed':
        turnUser = evt.transcript || '';
        safeSend(clientWs, JSON.stringify({ type: 'user_transcript', text: evt.transcript || '' }));
        break;
      case 'response.created':
        safeSend(clientWs, JSON.stringify({ type: 'speaking', value: true }));
        break;
      case 'error':
        console.error('[Realtime] Error OpenAI:', evt.error && evt.error.message);
        safeSend(clientWs, JSON.stringify({ type: 'error', message: (evt.error && evt.error.message) || 'Error en la sesión de voz' }));
        break;
    }
  });

  upstream.on('close', (code) => { console.log('[Realtime] OpenAI cerró la sesión:', code); safeClose(clientWs); });
  upstream.on('error', (err) => {
    console.error('[Realtime] Error upstream:', err.message);
    safeSend(clientWs, JSON.stringify({ type: 'error', message: 'No se pudo conectar con el servicio de voz' }));
    safeClose(clientWs);
  });

  function appendAudio(buf) {
    if (upstream.readyState !== WebSocket.OPEN) return;
    upstream.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: buf.toString('base64') }));
  }

  clientWs.on('message', (data, isBinary) => {
    if (isBinary) {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (upstreamReady) appendAudio(buf); else pendingAudio.push(buf);
      return;
    }
    let msg;
    try { msg = JSON.parse(data.toString()); } catch (e) { return; }
    if (msg.type === 'text' && msg.text) {
      if (upstream.readyState !== WebSocket.OPEN) return;
      upstream.send(JSON.stringify({
        type: 'conversation.item.create',
        item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: String(msg.text).slice(0, 2000) }] },
      }));
      upstream.send(JSON.stringify({ type: 'response.create' }));
    } else if (msg.type === 'interrupt') {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(JSON.stringify({ type: 'response.cancel' }));
    }
  });

  clientWs.on('close', () => { console.log('[Realtime] Cliente desconectado'); flushTurn(); safeClose(upstream); });
  clientWs.on('error', (err) => { console.error('[Realtime] Error cliente:', err.message); flushTurn(); safeClose(upstream); });
}

function safeSend(ws, payload) {
  try { if (ws && ws.readyState === WebSocket.OPEN) ws.send(payload); } catch (e) { /* noop */ }
}
function safeClose(ws) {
  try { if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) ws.close(); } catch (e) { /* noop */ }
}

module.exports = {
  handleConnection, PROVIDER,
  REALTIME_MODEL, REALTIME_VOICE,
  GEMINI_LIVE_MODEL, GEMINI_LIVE_VOICE,
  // export para pruebas
  resamplePcm16, VOICE_INSTRUCTIONS,
};
