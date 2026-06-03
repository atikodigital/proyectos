// ═══════════════════════════════════════════════════════════════
// ATIKO AGENT · Ruta Chat Widget (API REST)
// Endpoints: POST /api/chat, POST /api/chat/tts, POST /api/chat/stt
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { Readable } = require('stream');
const aiService = require('../services/ai');

// Configuración de multer en memoria para recibir audios (STT)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // máx 10MB para clips de voz
});

/**
 * POST /api/chat
 * Body: { message: string, sessionId?: string, images?: string[] }
 * Response: { reply: string, sessionId: string }
 */
router.post('/', async (req, res) => {
  const { message, sessionId, images } = req.body;

  // Validaciones básicas
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'El campo "message" es requerido' });
  }

  if (message.trim().length === 0) {
    return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
  }

  if (message.length > 2000) {
    return res.status(400).json({ error: 'El mensaje es demasiado largo (máx 2000 caracteres)' });
  }

  // Generar o reutilizar sessionId
  const sid = sessionId || uuidv4();

  try {
    const reply = await aiService.chat(sid, message.trim(), { 
      channel: 'web',
      images: Array.isArray(images) ? images : []
    });

    res.json({
      reply,
      sessionId: sid,
    });
  } catch (error) {
    console.error('[Chat API] Error:', error.message);
    res.status(503).json({
      error: 'El agente no está disponible en este momento',
      fallback: 'Por favor contáctanos directamente al +56 9 2713 0792',
    });
  }
});

/**
 * POST /api/chat/tts
 * Body: { text: string, voice?: string }
 * Response: binary MP3 (audio/mpeg)
 */
router.post('/tts', async (req, res) => {
  const { text, voice = 'nova' } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'El campo "text" es requerido' });
  }

  if (text.length > 2000) {
    return res.status(400).json({ error: 'El texto es demasiado largo (máx 2000 caracteres)' });
  }

  try {
    const buffer = await aiService.textToSpeech(text, voice);
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': buffer.length,
      'Cache-Control': 'no-cache'
    });
    res.send(buffer);
  } catch (error) {
    console.error('[TTS API] Error:', error.message);
    res.status(500).json({ error: 'Error al generar voz artificial' });
  }
});

/**
 * POST /api/chat/tts/stream
 * Body: { text: string, voice?: string }
 * Response: chunked PCM stream — 24000 Hz, 16-bit, mono, little-endian
 * Permite reproducción inmediata (primer chunk suena sin esperar el archivo completo)
 */
router.post('/tts/stream', async (req, res) => {
  const { text, voice = 'nova' } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'El campo "text" es requerido' });
  }

  if (text.length > 2000) {
    return res.status(400).json({ error: 'El texto es demasiado largo (máx 2000 caracteres)' });
  }

  try {
    res.set({
      'Content-Type': 'audio/pcm',
      'X-Sample-Rate': '24000',
      'X-Channels': '1',
      'X-Bit-Depth': '16',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    });

    const stream = await aiService.textToSpeechStream(text, voice);
    stream.pipe(res);
    stream.on('error', (err) => {
      console.error('[TTS Stream] Error:', err.message);
      if (!res.writableEnded) res.end();
    });
  } catch (error) {
    console.error('[TTS Stream API] Error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error al generar voz artificial en streaming' });
    }
  }
});

/**
 * POST /api/chat/stt
 * Multipart Form-Data: audio (archivo de audio)
 * Response: { text: string }
 */
router.post('/stt', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se ha subido ningún archivo de audio en el campo "audio"' });
  }

  try {
    // Convertir el buffer en un stream legible con metadatos de nombre para Whisper API
    const stream = Readable.from(req.file.buffer);
    stream.path = req.file.originalname || 'speech.mp3';

    const text = await aiService.speechToText(stream);
    res.json({ text });
  } catch (error) {
    console.error('[STT API] Error:', error.message);
    res.status(500).json({ error: 'Error al transcribir el audio de voz' });
  }
});

/**
 * DELETE /api/chat/:sessionId
 * Reinicia una conversación
 */
router.delete('/:sessionId', (req, res) => {
  aiService.resetSession(req.params.sessionId);
  res.json({ success: true });
});

/**
 * GET /api/chat/stats
 * Estadísticas básicas (solo para admin)
 */
router.get('/stats', (req, res) => {
  // En producción, proteger con un token de admin
  res.json(aiService.getStats());
});

module.exports = router;
