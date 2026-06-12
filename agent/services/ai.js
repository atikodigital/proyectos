// ═══════════════════════════════════════════════════════════════
// ATIKO AGENT · Servicio AI Unificado (OpenAI & DeepSeek Dual)
// ═══════════════════════════════════════════════════════════════

const OpenAI = require('openai');
const { SYSTEM_PROMPT } = require('../config/prompt');

const provider = process.env.AGENT_PROVIDER || 'openai';

// Cliente OpenAI
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Cliente DeepSeek
const deepseekClient = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

// Cliente Gemini (vía endpoint compatible con OpenAI de Google AI Studio)
const geminiClient = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
});

// Modelos según configuración
const CONV_MODEL = provider === 'gemini'
  ? (process.env.GEMINI_MODEL || 'gemini-2.5-flash')
  : provider === 'deepseek'
  ? (process.env.DEEPSEEK_MODEL || 'deepseek-chat')
  : (process.env.AGENT_CONVERSATION_MODEL || 'gpt-4o-mini');

// Visión: Gemini Flash es multimodal; con OpenAI usamos gpt-4o-mini.
const VISION_MODEL = provider === 'gemini'
  ? (process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash')
  : (process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini');
// Cliente para visión según proveedor (TTS/STT/voz siguen en OpenAI).
const visionClient = provider === 'gemini' ? geminiClient : openaiClient;
// Voz: gpt-4o-mini-tts suena mucho más natural que tts-1 y acepta "instructions" de tono.
const TTS_MODEL = process.env.AGENT_TTS_MODEL || 'gpt-4o-mini-tts';
const TTS_VOICE = process.env.AGENT_TTS_VOICE || 'onyx';
// Tono tipo J.A.R.V.I.S. con corte inglés: mayordomo digital británico, refinado.
const TTS_INSTRUCTIONS = process.env.AGENT_TTS_INSTRUCTIONS ||
  'Habla como J.A.R.V.I.S. de Iron Man: un mayordomo digital británico, elegante y sofisticado. ' +
  'Voz grave, serena y segura, con la dicción y el refinamiento de un caballero inglés — un leve acento ' +
  'británico, incluso al hablar español. Ritmo pausado pero eficiente, cálido pero impecablemente formal. ' +
  'Nada robótico ni monótono: entona con naturalidad y elegancia contenida.';
const STT_MODEL = process.env.AGENT_STT_MODEL || 'whisper-1';

// gpt-4o-mini-tts (y familia gpt-4o-audio) aceptan `instructions`; tts-1/tts-1-hd aceptan `speed`.
const TTS_SUPPORTS_INSTRUCTIONS = /gpt-4o/i.test(TTS_MODEL);

function buildTtsParams(text, voice, extra) {
  const params = {
    model: TTS_MODEL,
    voice: voice || TTS_VOICE,
    input: text,
    ...extra,
  };
  if (TTS_SUPPORTS_INSTRUCTIONS) {
    params.instructions = TTS_INSTRUCTIONS;
  } else {
    params.speed = 1.12; // solo tts-1/tts-1-hd
  }
  return params;
}

// ── TTS con Gemini (misma voz que la conversación en vivo, ej. "Charon" JARVIS) ──
// Por defecto sigue al proveedor del agente: si AGENT_PROVIDER=gemini, el TTS también es Gemini,
// para que el saludo y el chat suenen igual que la voz en tiempo real.
const axios = require('axios');
const TTS_PROVIDER = (process.env.TTS_PROVIDER || process.env.AGENT_PROVIDER || 'openai').toLowerCase();
const TTS_IS_GEMINI = TTS_PROVIDER === 'gemini';
const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const GEMINI_TTS_VOICE = process.env.GEMINI_TTS_VOICE || process.env.GEMINI_LIVE_VOICE || 'Charon';
// Directiva de estilo corta (Gemini la interpreta como tono, no la lee en voz alta).
const GEMINI_TTS_STYLE = process.env.GEMINI_TTS_STYLE ||
  'Lee con voz de mayordomo digital británico, sereno, grave y refinado, estilo J.A.R.V.I.S., con leve acento inglés';

// Modo del TTS de Gemini: 'live' usa el MISMO modelo native-audio que la conversación en vivo
// (mismo motor + voz Charon) → el saludo suena IDÉNTICO al resto de la charla. 'tts' usa el
// modelo preview-tts por REST (puede sonar levemente distinto). Default: 'live'.
const GEMINI_TTS_MODE = (process.env.GEMINI_TTS_MODE || 'live').toLowerCase();
const GEMINI_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'models/gemini-2.5-flash-native-audio-preview-12-2025';
const GEMINI_LIVE_VOICE = process.env.GEMINI_LIVE_VOICE || GEMINI_TTS_VOICE; // Charon

// TTS con el modelo Live native-audio (vía WebSocket, un disparo): lee el texto tal cual,
// con el MISMO motor/voz que la conversación en vivo. Devuelve PCM 24kHz 16-bit mono.
function geminiLiveTts(text, voice) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return Promise.reject(new Error('GEMINI_API_KEY no configurada'));
  const WS = require('ws');
  const voiceName = voice || GEMINI_LIVE_VOICE;
  const url = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=' + encodeURIComponent(key);
  return new Promise((resolve, reject) => {
    const ws = new WS(url);
    const chunks = [];
    let settled = false;
    const finish = (err) => {
      if (settled) return; settled = true;
      try { ws.close(); } catch (e) {}
      if (err) reject(err); else resolve(Buffer.concat(chunks));
    };
    const timer = setTimeout(() => finish(chunks.length ? null : new Error('Live TTS timeout')), 20000);
    ws.on('open', () => ws.send(JSON.stringify({
      setup: {
        model: GEMINI_LIVE_MODEL,
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
        systemInstruction: { parts: [{ text: 'Actúas como lector de voz en off. Lee EN VOZ ALTA el texto del usuario EXACTAMENTE como está, palabra por palabra, en español de Chile. No respondas, no saludes de vuelta, no agregues ni quites nada: solo léelo.' }] },
      },
    })));
    ws.on('message', (data) => {
      let evt; try { evt = JSON.parse(data.toString()); } catch (e) { return; }
      if (evt.setupComplete) {
        ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: String(text).slice(0, 1500) }] }], turnComplete: true } }));
        return;
      }
      const sc = evt.serverContent;
      if (sc) {
        for (const p of (sc.modelTurn && sc.modelTurn.parts) || []) {
          const inl = p.inlineData || p.inline_data;
          if (inl && inl.data) chunks.push(Buffer.from(inl.data, 'base64'));
        }
        if (sc.turnComplete || sc.generationComplete) { clearTimeout(timer); finish(null); }
        return;
      }
      if (evt.error) { clearTimeout(timer); finish(new Error(evt.error.message || 'Live TTS error')); }
    });
    ws.on('error', (e) => { clearTimeout(timer); finish(e); });
  });
}

// Voz unificada de Gemini: prefiere el modelo Live (idéntico a la conversación); si falla,
// cae al modelo preview-tts. Devuelve PCM 24kHz 16-bit mono en ambos casos.
async function geminiSpeak(text, voice) {
  if (GEMINI_TTS_MODE === 'live') {
    try { return await geminiLiveTts(text, voice); }
    catch (e) { console.error('[AI-Service] Live TTS falló, uso preview-tts:', e.message); }
  }
  return geminiTts(text, voice);
}

// Genera audio PCM 24kHz 16-bit mono con Gemini TTS. Devuelve un Buffer.
async function geminiTts(text, voice) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY no configurada');
  const voiceName = voice || GEMINI_TTS_VOICE;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{ parts: [{ text: `${GEMINI_TTS_STYLE}: ${text}` }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
    },
  };
  const r = await axios.post(url, body, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
  const parts = (((r.data || {}).candidates || [])[0] || {}).content;
  const audio = parts && parts.parts && parts.parts.find(p => p.inlineData && p.inlineData.data);
  if (!audio) throw new Error('Gemini TTS no devolvió audio');
  return Buffer.from(audio.inlineData.data, 'base64'); // PCM L16 24kHz mono
}

// Envuelve PCM crudo en un contenedor WAV (para el fallback <audio> del widget).
function pcmToWav(pcm, sampleRate = 24000, channels = 1, bits = 16) {
  const blockAlign = channels * bits / 8;
  const byteRate = sampleRate * blockAlign;
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22); h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(byteRate, 28);
  h.writeUInt16LE(blockAlign, 32); h.writeUInt16LE(bits, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// Memoria de sesiones (conversaciones en memoria)
const conversations = new Map();
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos
const MAX_HISTORY_MESSAGES = Number(process.env.AGENT_HISTORY_MESSAGES || 8) * 2; // N turnos (user+assistant)

// Intervalo de limpieza de sesiones inactivas
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of conversations) {
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
      conversations.delete(id);
    }
  }
}, 5 * 60 * 1000);

/**
 * Obtiene o crea la sesión de chat
 */
function getSession(sessionId) {
  if (!conversations.has(sessionId)) {
    conversations.set(sessionId, {
      messages: [],
      createdAt: Date.now(),
      lastActivity: Date.now(),
      channel: 'web',
      leadData: {},
    });
  }
  const session = conversations.get(sessionId);
  session.lastActivity = Date.now();
  return session;
}

/**
 * Procesa la conversación del agente (soporta imágenes y texto)
 */
async function chat(sessionId, userMessage, options = {}) {
  const session = getSession(sessionId);
  if (options.channel) session.channel = options.channel;
  if (options.client) session.clientSlug = String(options.client).trim().toLowerCase(); // multi-tenant
  // Datos del contacto que trae el canal (ej: nombre de perfil + número de WhatsApp).
  if (options.contactName && !session.leadData.name) session.leadData.name = String(options.contactName).slice(0, 120);
  if (options.contactPhone && !session.leadData.phone) session.leadData.phone = String(options.contactPhone).slice(0, 40);

  // 1. Pre-análisis de imágenes vía GPT-4o Vision si están presentes
  let imageContext = '';
  if (options.images && options.images.length > 0) {
    try {
      console.log(`[AI-Service] Analizando ${options.images.length} imagen(es) con OpenAI Vision...`);
      const visionContent = [
        { 
          type: 'text', 
          text: 'Describe esta imagen detalladamente. Extrae todo el texto visible, temas principales, logotipos y propósitos. Traduce y formatea limpiamente en español.' 
        }
      ];
      
      for (const img of options.images.slice(0, 5)) {
        const b64 = img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;
        visionContent.push({ 
          type: 'image_url', 
          image_url: { url: b64, detail: 'high' } 
        });
      }

      const visionRes = await visionClient.chat.completions.create({
        model: VISION_MODEL,
        messages: [{ role: 'user', content: visionContent }],
        max_tokens: 1000,
      });

      imageContext = visionRes.choices[0]?.message?.content || '';
      console.log('[AI-Service] Análisis de imagen completado.');
    } catch (visErr) {
      console.error('[AI-Service] Error en análisis Vision:', visErr.message);
      imageContext = '(No se pudo procesar la imagen)';
    }
  }

  // 2. Preparar el mensaje de usuario final
  let finalMessageContent = userMessage;
  if (imageContext) {
    finalMessageContent = `[IMÁGENES ADJUNTAS ANALIZADAS]:\n${imageContext}\n\n[MENSAJE DEL USUARIO]:\n${userMessage}`;
  }

  // Guardar mensaje en historial
  session.messages.push({ role: 'user', content: finalMessageContent });

  // Truncar historial si excede el tamaño máximo (mantener los más recientes)
  if (session.messages.length > MAX_HISTORY_MESSAGES) {
    session.messages = session.messages.slice(-MAX_HISTORY_MESSAGES);
  }

  // Enriquecer datos de contacto y CAPTURAR el lead + su mensaje ANTES de llamar a OpenAI.
  // Así la conversación queda registrada en el CRM aunque KAI falle (p.ej. cuota de OpenAI
  // agotada / 429). La calificación de NEXO y la respuesta se registran luego, si hay éxito.
  extractLeadData(session, userMessage);
  try { await captureInbound(sessionId, session, userMessage); }
  catch (e) { console.error('[capture-in] error:', e.message); }

  // Handoff omnicanal: si un ejecutivo tomó el chat, KAI queda en pausa y NO responde.
  if (session._kaiPaused) {
    console.log('[KAI] en pausa (handoff a humano) →', sessionId, '· no auto-responde');
    return null;
  }

  // Tracking de pedidos: si pregunta por su pedido y el cliente tiene el módulo, inyectamos el estado real.
  if (session._leadId && /\bpedido\b|\borden\b|despach|env[ií]o|cu[aá]ndo llega|estado de mi|mi compra|seguimiento|\btrack/i.test(userMessage)) {
    try {
      const crm = require('./crm');
      const feats = await crm.getClientFeaturesById(session._clientId);
      if (feats.tracking) {
        const peds = await crm.listPedidos(session._clientId, session._leadId);
        let info;
        if (peds && peds.length) {
          const p = peds[0];
          info = '[DATO INTERNO · estado del pedido del cliente, úsalo para responder] Pedido por ' + crm.fmtCLP(p.total) +
            ', estado: "' + p.estado + '"' + (p.tracking ? ', seguimiento: ' + p.tracking : '') + '. Explícaselo en simple y cordial.';
        } else {
          info = '[DATO INTERNO] El cliente no tiene pedidos registrados. Si pregunta por su pedido, pídele su número o dile que un ejecutivo lo revisa.';
        }
        session.messages.splice(session.messages.length - 1, 0, { role: 'system', content: info });
      }
    } catch (e) { /* best-effort */ }
  }

  // 3. Determinar cliente y modelo de llamada
  const activeClient = provider === 'gemini' ? geminiClient
    : provider === 'deepseek' ? deepseekClient
    : openaiClient;

  try {
    console.log(`[AI-Service] Llamando a ${provider} con modelo ${CONV_MODEL}...`);
    const response = await activeClient.chat.completions.create({
      model: CONV_MODEL,
      max_tokens: Number(process.env.AGENT_MAX_TOKENS || 500),
      temperature: 0.3,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...session.messages,
      ],
    });

    const reply = response.choices[0].message.content;

    // Guardar respuesta del asistente en historial (con texto limpio, no con el prompt de imágenes interno)
    session.messages.push({ role: 'assistant', content: reply });

    // Registrar la respuesta de KAI + calificar con NEXO (best-effort, no bloquea la respuesta)
    captureReplyAndQualify(session, reply).catch(e => console.error('[capture-reply] error:', e.message));

    return reply;

  } catch (error) {
    console.error(`[AI-Service] Error al llamar a la API de ${provider}:`, error.message);
    throw new Error('El agente no está disponible en este momento. Contáctanos al +56 9 2713 0792');
  }
}

/**
 * Text-to-Speech (TTS) - Generar archivo de audio MP3 vía OpenAI
 */
async function textToSpeech(text, voice) {
  if (TTS_IS_GEMINI) {
    console.log(`[AI-Service] Generando TTS (Gemini ${GEMINI_TTS_MODE === 'live' ? GEMINI_LIVE_MODEL : GEMINI_TTS_MODEL}) voz ${voice || GEMINI_LIVE_VOICE}...`);
    const pcm = await geminiSpeak(text, voice);
    return pcmToWav(pcm); // WAV para el fallback <audio> del widget
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY no configurada');
  }
  const useVoice = voice || TTS_VOICE;
  console.log(`[AI-Service] Generando TTS (${TTS_MODEL}) con voz ${useVoice}...`);
  const response = await openaiClient.audio.speech.create(
    buildTtsParams(text, useVoice)
  );

  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer;
}

/**
 * Text-to-Speech Streaming (PCM) - Stream 24kHz 16-bit mono PCM para reproducción inmediata
 */
async function textToSpeechStream(text, voice) {
  const { Readable } = require('stream');
  if (TTS_IS_GEMINI) {
    console.log(`[AI-Service] Generando TTS streaming (Gemini ${GEMINI_TTS_MODE === 'live' ? GEMINI_LIVE_MODEL : GEMINI_TTS_MODEL}) voz ${voice || GEMINI_LIVE_VOICE}...`);
    const pcm = await geminiSpeak(text, voice); // PCM 24kHz: lo que el widget espera
    return Readable.from(pcm);
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY no configurada');
  }
  const useVoice = voice || TTS_VOICE;
  console.log(`[AI-Service] Generando TTS streaming PCM (${TTS_MODEL}) con voz ${useVoice}...`);
  const response = await openaiClient.audio.speech.create(
    buildTtsParams(text, useVoice, { response_format: 'pcm' }) // 24000 Hz, 16-bit, mono, little-endian
  );
  // Compatibilidad entre versiones del SDK: response.body puede ser un web ReadableStream
  // (SDK nuevo) o un stream Node ya listo (SDK antiguo en el VPS).
  const body = response.body;
  if (body && typeof body.getReader === 'function') {
    return Readable.fromWeb(body); // web ReadableStream → Node Readable
  }
  return body; // ya es un stream Node
}

/**
 * Speech-to-Text (STT) - Transcribir audio vía OpenAI Whisper
 */
async function speechToText(fileStream) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY no configurada');
  }
  console.log('[AI-Service] Transcribiendo audio con Whisper...');
  const transcription = await openaiClient.audio.transcriptions.create({
    file: fileStream,
    model: STT_MODEL,
    language: 'es',
  });
  return transcription.text;
}

/**
 * Transcribe un audio (nota de voz) a texto. Usa Gemini (multimodal) si es el proveedor
 * activo; si no, cae a OpenAI Whisper. Devuelve el texto transcrito.
 */
async function transcribeAudio(buffer, mimeType) {
  if (provider === 'gemini' && process.env.GEMINI_API_KEY) {
    const model = process.env.GEMINI_TRANSCRIBE_MODEL || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
    const body = {
      contents: [{ parts: [
        { text: 'Transcribe este audio EXACTAMENTE a texto, en español de Chile. Devuelve SOLO la transcripción, sin comillas ni comentarios.' },
        { inlineData: { mimeType: mimeType || 'audio/ogg', data: buffer.toString('base64') } },
      ] }],
    };
    console.log(`[AI-Service] Transcribiendo audio con Gemini (${model})...`);
    const r = await axios.post(url, body, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
    const content = (((r.data || {}).candidates || [])[0] || {}).content;
    const t = content && content.parts && content.parts.map(p => p.text).filter(Boolean).join(' ');
    return (t || '').trim();
  }
  // Fallback: OpenAI Whisper
  const { Readable } = require('stream');
  const stream = Readable.from(buffer); stream.path = 'audio.ogg';
  return await speechToText(stream);
}

/**
 * Extrae email y teléfono del mensaje para enriquecer el lead
 */
function extractLeadData(session, userMessage) {
  const emailMatch = userMessage.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) session.leadData.email = emailMatch[0];

  const phoneMatch = userMessage.match(/(\+56\s?9?\s?\d{4}\s?\d{4}|9\d{8})/);
  if (phoneMatch) session.leadData.phone = phoneMatch[0].replace(/\s/g, '');

  if (userMessage.length > 20) {
    session.leadData.lastMessage = userMessage.substring(0, 200);
  }
}

function getLeadData(sessionId) {
  const session = conversations.get(sessionId);
  return session ? session.leadData : null;
}

function getHistory(sessionId) {
  const session = conversations.get(sessionId);
  return session ? session.messages : [];
}

function resetSession(sessionId) {
  conversations.delete(sessionId);
}

function getStats() {
  return {
    activeSessions: conversations.size,
    provider,
    model: CONV_MODEL,
    channels: {
      web: [...conversations.values()].filter(s => s.channel === 'web').length,
      whatsapp: [...conversations.values()].filter(s => s.channel === 'whatsapp').length,
    }
  };
}

/**
 * Captura el lead al CRM Atiko y registra su mensaje ENTRANTE.
 * Se llama ANTES de invocar a OpenAI, para que la conversación quede guardada
 * aunque KAI falle. Guarda el leadId en la sesión para la fase de respuesta.
 * Best-effort: si el CRM falla, NO afecta la conversación.
 */
async function captureInbound(sessionId, session, userMessage) {
  const crm = require('./crm');
  // Multi-tenant: el lead se asigna al cliente del origen (canal/widget). Por defecto 'atiko'.
  const clientId = (await crm.getClientIdBySlug(session.clientSlug || 'atiko')) || (await crm.getAtikoClientId());
  if (!clientId) return;
  session._clientId = clientId;

  const channel = session.channel || 'web';
  const ld = session.leadData || {};
  const { id: leadId } = await crm.upsertLeadFromConversation(clientId, {
    channel, externalId: sessionId,
    name: ld.name, email: ld.email, phone: ld.phone,
    message: userMessage,
  });
  session._leadId = leadId;
  // Handoff: si un humano tomó este chat, KAI no debe auto-responder.
  try { session._kaiPaused = await crm.isKaiPausedById(leadId); }
  catch (e) { session._kaiPaused = false; }
}

/**
 * Registra la respuesta de KAI y dispara la calificación de NEXO.
 * Se llama DESPUÉS de una respuesta exitosa. Usa el leadId capturado en la fase entrante.
 * Best-effort: si el CRM o NEXO fallan, NO afecta la conversación.
 */
async function captureReplyAndQualify(session, reply) {
  const crm = require('./crm');
  const nexo = require('./nexo');
  const leadId = session._leadId;
  if (!leadId) return; // la captura entrante no pudo registrar el lead

  // Guardar la respuesta de KAI para ver la conversación completa en el CRM
  if (reply) { try { await crm.logReply(leadId, reply); } catch (e) {} }

  // NEXO califica cuando ya hay conversación real (>= 2 mensajes del lead)
  const userMsgs = session.messages.filter(m => m.role === 'user');
  if (userMsgs.length >= 2) {
    const convo = session.messages
      .map(m => (m.role === 'user' ? 'Lead: ' : 'KAI: ') + m.content)
      .join('\n');
    // Gating por plan del cliente: NEXO y agendamiento solo si los tiene contratados.
    let feats = { nexo: true, agendamiento: true };
    try { feats = await crm.getClientFeaturesById(session._clientId); } catch (e) {}

    if (feats.nexo) {
      try {
        const q = await nexo.qualify(convo);
        await crm.applyNexo(leadId, q);
        console.log(`[NEXO] lead ${leadId.slice(0, 8)} → ${q.stage} (score ${q.score}, ${q.temperatura})`);
      } catch (e) {
        console.error('[NEXO] error:', e.message);
      }
    }

    // Agendamiento: si la charla menciona reservar/cita/hora, NEXO extrae la cita y la guarda.
    const convoLower = convo.toLowerCase();
    if (feats.agendamiento && /agend|cita|reserv|\bhora\b|\bturno\b|\bcuándo\b|\bcuando\b|disponib|\bd[ií]a\b|\bmañana\b|\bhoy\b/.test(convoLower)) {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const cita = await nexo.detectAppointment(convo, today);
        if (cita.quiere_agendar && session._clientId) {
          const { created } = await crm.upsertCitaFromKai(session._clientId, leadId, cita);
          console.log(`[CITA] lead ${leadId.slice(0, 8)} → ${created ? 'nueva' : 'actualizada'} (${cita.fecha || cita.fecha_texto || 's/fecha'} ${cita.hora || ''})`);
        }
      } catch (e) {
        console.error('[CITA] error:', e.message);
      }
    }

    // Postventa: detectar reclamos / devoluciones y marcarlos para atención humana.
    if (feats.postventa && /reclam|devoluc|reembols|garant[ií]a|defect|no funciona|no sirve|p[eé]sim|estafa|\bqueja\b|lleg[oó] mal|roto|fall|nunca lleg/i.test(convoLower)) {
      try {
        const rec = await nexo.detectReclamo(convo);
        if (rec.es_reclamo && session._clientId) {
          await crm.flagReclamo(session._clientId, leadId, rec);
          console.log(`[RECLAMO] lead ${leadId.slice(0, 8)} → ${rec.tipo} (${rec.urgencia})`);
        }
      } catch (e) {
        console.error('[RECLAMO] error:', e.message);
      }
    }
  }
}

/**
 * Registra un turno de la conversación por VOZ (Gemini Live / Realtime) en el CRM.
 * Reusa la misma sesión que el chat de texto (mismo sessionId = omnicanal) y toda la
 * lógica de captura + NEXO. userText = lo que dijo el usuario; assistantText = lo que respondió KAI.
 * Best-effort: si el CRM/NEXO fallan, NO afecta la conversación de voz.
 */
async function recordVoiceTurn(sessionId, userText, assistantText, channel) {
  if (!sessionId) return;
  const session = getSession(sessionId);
  if (channel) session.channel = channel;
  userText = (userText || '').trim();
  assistantText = (assistantText || '').trim();

  if (userText) {
    session.messages.push({ role: 'user', content: userText });
    if (session.messages.length > MAX_HISTORY_MESSAGES) session.messages = session.messages.slice(-MAX_HISTORY_MESSAGES);
    extractLeadData(session, userText);
    try { await captureInbound(sessionId, session, userText); }
    catch (e) { console.error('[capture-voice-in] error:', e.message); }
  }
  if (assistantText) {
    session.messages.push({ role: 'assistant', content: assistantText });
    captureReplyAndQualify(session, assistantText).catch(e => console.error('[capture-voice-reply] error:', e.message));
  }
}

module.exports = {
  chat,
  textToSpeech,
  textToSpeechStream,
  speechToText,
  transcribeAudio,
  recordVoiceTurn,
  getLeadData,
  getHistory,
  resetSession,
  getStats,
  TTS_IS_GEMINI, // true si el TTS usa Gemini (audio WAV en el fallback)
};
