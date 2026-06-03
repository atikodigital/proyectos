// ═══════════════════════════════════════════════════════════════
// ATIKO AGENT · Webhook WhatsApp Business API (Meta)
// GET  /api/whatsapp/webhook  → verificación inicial de Meta
// POST /api/whatsapp/webhook  → mensajes entrantes
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const aiService = require('../services/ai');
const whatsappService = require('../services/whatsapp');

// Mensajes que actualmente están siendo procesados (evitar duplicados)
const processingMessages = new Set();

// ── GET: Verificación del webhook (Meta lo llama una sola vez al configurar) ──
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[WhatsApp] Webhook verificado correctamente ✓');
    return res.status(200).send(challenge);
  }

  console.warn('[WhatsApp] Intento de verificación fallido — token incorrecto');
  res.status(403).json({ error: 'Token de verificación incorrecto' });
});

// ── POST: Mensajes entrantes ──
router.post('/', async (req, res) => {
  // Meta espera un 200 inmediato, el procesamiento es asíncrono
  res.sendStatus(200);

  try {
    const body = req.body;

    // Validar que sea una notificación de WhatsApp Business
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        const messages = value.messages || [];

        for (const message of messages) {
          await handleIncomingMessage(message, value);
        }
      }
    }
  } catch (error) {
    console.error('[WhatsApp Webhook] Error general:', error.message);
  }
});

/**
 * Procesa un mensaje entrante de WhatsApp
 */
async function handleIncomingMessage(message, value) {
  const messageId = message.id;

  // Evitar procesar el mismo mensaje dos veces (Meta puede enviar duplicados)
  if (processingMessages.has(messageId)) return;
  processingMessages.add(messageId);
  setTimeout(() => processingMessages.delete(messageId), 60000); // limpiar tras 1 min

  const from = message.from; // número del usuario (ej: 56912345678)
  const timestamp = message.timestamp;

  console.log(`[WhatsApp] Mensaje de ${from} (${new Date(timestamp * 1000).toISOString()})`);

  // Marcar como leído
  await whatsappService.markAsRead(messageId);

  // Extraer texto del mensaje
  const text = whatsappService.extractMessageText(message);

  if (!text) {
    // Mensaje de tipo no soportado (imagen, audio, video, etc.)
    await whatsappService.sendText(from,
      '👋 Hola, por ahora solo puedo leer mensajes de texto. Si tienes alguna consulta sobre los servicios de Atiko, escríbela acá o llámanos al +56 9 2713 0792'
    );
    return;
  }

  // Usar el número de WhatsApp como sessionId (así se mantiene el contexto de la conversación)
  const sessionId = `wa_${from}`;

  try {
    // Obtener respuesta del agente IA
    const reply = await aiService.chat(sessionId, text, { channel: 'whatsapp' });

    // Enviar respuesta
    await whatsappService.sendText(from, reply);

    console.log(`[WhatsApp] Respuesta enviada a ${from}`);
  } catch (error) {
    console.error(`[WhatsApp] Error procesando mensaje de ${from}:`, error.message);
    await whatsappService.sendText(from,
      'Ups, tuve un problema técnico 😅. Por favor contáctanos directamente: atikodigital@gmail.com o al +56 9 2713 0792'
    );
  }
}

module.exports = router;
