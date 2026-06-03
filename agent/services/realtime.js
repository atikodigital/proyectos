// ═══════════════════════════════════════════════════════════════
// ATIKO AGENT · Voz en tiempo real (OpenAI Realtime API — GA)
// Relay WebSocket navegador <──> servidor <──> OpenAI Realtime.
//
// La API key vive SOLO en el servidor. El navegador nunca la ve.
// Audio: PCM16 mono 24 kHz little-endian en ambos sentidos.
// Protocolo GA (sin header OpenAI-Beta), modelo gpt-realtime.
//
// Protocolo navegador ⇄ servidor:
//   Navegador → Servidor:
//     · binario  = chunk de audio del micrófono (PCM16 24kHz)
//     · texto JSON {type:'text', text}      → mensaje escrito del usuario
//     · texto JSON {type:'interrupt'}       → cortar la respuesta en curso
//   Servidor → Navegador:
//     · binario  = chunk de audio a reproducir (PCM16 24kHz)
//     · texto JSON {type:'ready'}            → sesión lista
//     · texto JSON {type:'user_speaking'}    → el usuario empezó a hablar (barge-in)
//     · texto JSON {type:'user_transcript', text}
//     · texto JSON {type:'assistant_transcript', text, done}
//     · texto JSON {type:'speaking', value}  → KAI está emitiendo audio (true/false)
//     · texto JSON {type:'error', message}
// ═══════════════════════════════════════════════════════════════

const WebSocket = require('ws');
const { SYSTEM_PROMPT } = require('../config/prompt');

const REALTIME_MODEL = process.env.REALTIME_MODEL || 'gpt-realtime';
const REALTIME_VOICE = process.env.REALTIME_VOICE || 'ballad';
const OPENAI_URL = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(REALTIME_MODEL)}`;

// Instrucciones de personalidad para la sesión de voz (reusa el prompt de Kai
// + matices específicos de voz estilo J.A.R.V.I.S.).
const VOICE_INSTRUCTIONS = `${SYSTEM_PROMPT}

## MODO VOZ (tiempo real)
- Estás conversando por voz, no por texto. Responde de forma natural, breve y conversacional (1-3 frases salvo que pidan detalle).
- Tono tipo J.A.R.V.I.S.: sereno, seguro, cálido y eficiente. Nada robótico.
- Español de Chile, natural. Trata al usuario con cercanía profesional.
- No leas listas largas ni markdown en voz alta; resume y ofrece enviar el detalle por escrito o WhatsApp.
- Si te interrumpen, detente y escucha.`;

/**
 * Maneja una conexión WebSocket entrante del navegador.
 * @param {WebSocket} clientWs  socket del navegador (ya aceptado)
 */
function handleConnection(clientWs) {
  if (!process.env.OPENAI_API_KEY) {
    safeSend(clientWs, JSON.stringify({ type: 'error', message: 'OPENAI_API_KEY no configurada en el servidor' }));
    clientWs.close();
    return;
  }

  console.log('[Realtime] Cliente conectado, abriendo sesión con OpenAI...');

  // Conexión upstream a OpenAI Realtime (GA: sin header OpenAI-Beta)
  const upstream = new WebSocket(OPENAI_URL, {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  });

  let upstreamReady = false;
  const pendingAudio = []; // audio del mic que llega antes de session.updated

  // ── Configuración inicial de la sesión (esquema GA) ────────
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
            // VAD del servidor de OpenAI → habilita barge-in natural
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 600,
              create_response: true,
              interrupt_response: true,
            },
          },
          output: {
            format: { type: 'audio/pcm', rate: 24000 },
            voice: REALTIME_VOICE,
            speed: 1,
          },
        },
      },
    }));
  });

  // ── OpenAI → Navegador ─────────────────────────────────────
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

      // El usuario empezó a hablar → barge-in: el navegador corta la reproducción
      case 'input_audio_buffer.speech_started':
        safeSend(clientWs, JSON.stringify({ type: 'user_speaking' }));
        break;

      // Audio de KAI → reenviar binario al navegador
      case 'response.output_audio.delta':
        if (evt.delta) safeSend(clientWs, Buffer.from(evt.delta, 'base64'));
        break;

      case 'response.output_audio.done':
        safeSend(clientWs, JSON.stringify({ type: 'speaking', value: false }));
        break;

      // Transcripción de lo que dice KAI (subtítulos en el chat)
      case 'response.output_audio_transcript.delta':
        if (evt.delta) safeSend(clientWs, JSON.stringify({ type: 'assistant_transcript', text: evt.delta, done: false }));
        break;
      case 'response.output_audio_transcript.done':
        safeSend(clientWs, JSON.stringify({ type: 'assistant_transcript', text: evt.transcript || '', done: true }));
        break;

      // Transcripción de lo que dijo el usuario
      case 'conversation.item.input_audio_transcription.completed':
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

  upstream.on('close', (code) => {
    console.log('[Realtime] OpenAI cerró la sesión:', code);
    safeClose(clientWs);
  });

  upstream.on('error', (err) => {
    console.error('[Realtime] Error upstream:', err.message);
    safeSend(clientWs, JSON.stringify({ type: 'error', message: 'No se pudo conectar con el servicio de voz' }));
    safeClose(clientWs);
  });

  // Añade un chunk de audio del mic al buffer de OpenAI
  function appendAudio(buf) {
    if (upstream.readyState !== WebSocket.OPEN) return;
    upstream.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: buf.toString('base64'),
    }));
  }

  // ── Navegador → OpenAI ─────────────────────────────────────
  clientWs.on('message', (data, isBinary) => {
    if (isBinary) {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (upstreamReady) appendAudio(buf);
      else pendingAudio.push(buf);
      return;
    }

    let msg;
    try { msg = JSON.parse(data.toString()); } catch (e) { return; }

    if (msg.type === 'text' && msg.text) {
      if (upstream.readyState !== WebSocket.OPEN) return;
      upstream.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: String(msg.text).slice(0, 2000) }],
        },
      }));
      upstream.send(JSON.stringify({ type: 'response.create' }));
    } else if (msg.type === 'interrupt') {
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(JSON.stringify({ type: 'response.cancel' }));
      }
    }
  });

  clientWs.on('close', () => {
    console.log('[Realtime] Cliente desconectado');
    safeClose(upstream);
  });

  clientWs.on('error', (err) => {
    console.error('[Realtime] Error cliente:', err.message);
    safeClose(upstream);
  });
}

function safeSend(ws, payload) {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(payload);
  } catch (e) { /* noop */ }
}

function safeClose(ws) {
  try {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) ws.close();
  } catch (e) { /* noop */ }
}

module.exports = { handleConnection, REALTIME_MODEL, REALTIME_VOICE };
