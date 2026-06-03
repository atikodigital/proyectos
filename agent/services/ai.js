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

// Modelos según configuración
const CONV_MODEL = provider === 'deepseek' 
  ? (process.env.DEEPSEEK_MODEL || 'deepseek-chat')
  : (process.env.AGENT_CONVERSATION_MODEL || 'gpt-4o-mini');

const VISION_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';
// Voz: gpt-4o-mini-tts suena mucho más natural que tts-1 y acepta "instructions" de tono.
const TTS_MODEL = process.env.AGENT_TTS_MODEL || 'gpt-4o-mini-tts';
const TTS_VOICE = process.env.AGENT_TTS_VOICE || 'onyx';
// Tono tipo J.A.R.V.I.S.: mayordomo digital, calmado, grave, eficiente.
const TTS_INSTRUCTIONS = process.env.AGENT_TTS_INSTRUCTIONS ||
  'Habla en español neutro-chileno como un asistente tipo J.A.R.V.I.S.: voz grave, serena y segura, ' +
  'tono de mayordomo digital sofisticado, ritmo pausado pero eficiente, cálido pero profesional. ' +
  'Nada robótico ni monótono: entona con naturalidad y leve calidez.';
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

      const visionRes = await openaiClient.chat.completions.create({
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

  // 3. Determinar cliente y modelo de llamada
  const activeClient = provider === 'deepseek' ? deepseekClient : openaiClient;
  
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

    // Tratar de enriquecer datos de contacto (leads)
    extractLeadData(session, userMessage);

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
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY no configurada');
  }
  const { Readable } = require('stream');
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

module.exports = {
  chat,
  textToSpeech,
  textToSpeechStream,
  speechToText,
  getLeadData,
  getHistory,
  resetSession,
  getStats
};
