// ═══════════════════════════════════════════════════════════════
// ATIKO AGENT · Servicio WhatsApp Business API (Meta)
// Envío de mensajes y utilidades
// ═══════════════════════════════════════════════════════════════

const axios = require('axios');

const WA_API_VERSION = 'v20.0';
const WA_BASE_URL = `https://graph.facebook.com/${WA_API_VERSION}`;

/**
 * Envía un mensaje de texto a un número de WhatsApp
 * @param {string} to - Número del destinatario (sin + ni espacios, ej: 56912345678)
 * @param {string} text - Texto del mensaje
 */
async function sendText(to, text) {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const token = process.env.WHATSAPP_TOKEN;

  if (!phoneId || !token) {
    throw new Error('WHATSAPP_PHONE_ID o WHATSAPP_TOKEN no configurados en .env');
  }

  // WhatsApp tiene límite de 4096 caracteres por mensaje
  // Si la respuesta es muy larga, la dividimos
  const chunks = splitMessage(text, 4000);

  for (const chunk of chunks) {
    await axios.post(
      `${WA_BASE_URL}/${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'text',
        text: { body: chunk },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Pequeño delay entre mensajes si son múltiples partes
    if (chunks.length > 1) {
      await sleep(500);
    }
  }
}

/**
 * Envía una plantilla (template) de WhatsApp
 * Útil para iniciar conversaciones proactivas
 * @param {string} to - Número del destinatario
 * @param {string} templateName - Nombre de la plantilla aprobada en Meta
 * @param {string} languageCode - Código de idioma (ej: 'es_AR', 'es_MX')
 * @param {Array} components - Parámetros de la plantilla
 */
async function sendTemplate(to, templateName, languageCode = 'es', components = []) {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const token = process.env.WHATSAPP_TOKEN;

  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
    },
  };

  if (components.length > 0) {
    body.template.components = components;
  }

  await axios.post(`${WA_BASE_URL}/${phoneId}/messages`, body, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Marca un mensaje como leído
 * @param {string} messageId - ID del mensaje de WhatsApp
 */
async function markAsRead(messageId) {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const token = process.env.WHATSAPP_TOKEN;

  await axios.post(
    `${WA_BASE_URL}/${phoneId}/messages`,
    {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  ).catch(() => {}); // No es crítico si falla
}

/**
 * Extrae el texto de un mensaje entrante de WhatsApp
 * @param {object} message - Objeto mensaje del webhook
 * @returns {string|null}
 */
function extractMessageText(message) {
  if (message.type === 'text') {
    return message.text?.body || null;
  }
  if (message.type === 'button') {
    return message.button?.text || null;
  }
  if (message.type === 'interactive') {
    if (message.interactive?.type === 'button_reply') {
      return message.interactive.button_reply?.title || null;
    }
    if (message.interactive?.type === 'list_reply') {
      return message.interactive.list_reply?.title || null;
    }
  }
  // Tipos no soportados (imagen, audio, video, etc.)
  return null;
}

/**
 * Divide un texto largo en partes respetando palabras completas
 */
function splitMessage(text, maxLength = 4000) {
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf('\n', maxLength);
    if (splitAt < maxLength * 0.6) splitAt = remaining.lastIndexOf(' ', maxLength);
    if (splitAt < 0) splitAt = maxLength;

    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trim();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { sendText, sendTemplate, markAsRead, extractMessageText };
