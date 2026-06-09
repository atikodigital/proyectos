const axios = require('axios');
const { CATEGORIES } = require('../domain/categories');

const BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

function parseJsonLoose(text) {
  const s = String(text || '');
  const fenced = s.replace(/```json/gi, '```').split('```');
  const candidates = [s, ...fenced];
  for (const c of candidates) {
    const start = c.indexOf('{');
    const end = c.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(c.slice(start, end + 1)); } catch { /* sigue */ }
    }
  }
  return {};
}

function buildPrompt() {
  return [
    'Eres un extractor de datos de boletas y facturas chilenas.',
    'Devuelve SOLO un JSON con estos campos:',
    'tipo_documento (boleta|factura|otro), rut_emisor, folio, direccion_emisor,',
    'proveedor, fecha (dd/mm/aaaa), neto, iva, total (en pesos CLP enteros),',
    `categoria (una de: ${CATEGORIES.join(', ')}), glosa (descripción corta).`,
    'Si un campo no aparece, usa "" o 0. No inventes montos.',
  ].join(' ');
}

async function geminiExtract(imageBase64, mimeType = 'image/jpeg') {
  const model = process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash';
  const key = process.env.GEMINI_API_KEY;
  const body = {
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildPrompt() },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ],
      },
    ],
    temperature: 0.1,
  };
  const res = await axios.post(BASE, body, {
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    timeout: 30000,
  });
  const content = res?.data?.choices?.[0]?.message?.content || '';
  return parseJsonLoose(content);
}

module.exports = { geminiExtract, parseJsonLoose };
