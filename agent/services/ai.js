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
const TTS_MODEL = process.env.AGENT_TTS_MODEL || 'tts-1';
const STT_MODEL = process.env.AGENT_STT_MODEL || 'whisper-1';

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
async function textToSpeech(text, voice = 'nova') {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY no configurada');
  }
  console.log(`[AI-Service] Generando TTS con voz ${voice}...`);
  const response = await openaiClient.audio.speech.create({
    model: TTS_MODEL,
    voice: voice,
    input: text,
    speed: 1.12,
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer;
}

/**
 * Text-to-Speech Streaming (PCM) - Stream 24kHz 16-bit mono PCM para reproducción inmediata
 */
async function textToSpeechStream(text, voice = 'nova') {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY no configurada');
  }
  const { Readable } = require('stream');
  console.log(`[AI-Service] Generando TTS streaming PCM con voz ${voice}...`);
  const response = await openaiClient.audio.speech.create({
    model: TTS_MODEL,
    voice: voice,
    input: text,
    speed: 1.12,
    response_format: 'pcm', // 24000 Hz, 16-bit, mono, little-endian
  });
  return Readable.fromWeb(response.body);
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
