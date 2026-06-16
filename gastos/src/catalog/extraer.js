// Extrae productos {nombre, precio} de una foto de menú/lista con Gemini visión (OpenAI-compat).
const axios = require('axios');

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

function normalizeProductos(data) {
  const arr = Array.isArray(data && data.productos) ? data.productos : [];
  return arr.slice(0, 100).map((p) => ({
    nombre: String((p && p.nombre) || '').trim().slice(0, 120),
    precio: Math.max(0, Math.round(Number(p && p.precio) || 0)),
  })).filter((p) => p.nombre);
}

function buildPrompt() {
  return [
    'Eres un asistente que lee un MENÚ o LISTA DE PRECIOS de un negocio chileno.',
    'Extrae los productos con su precio en pesos CLP.',
    'Devuelve SOLO un JSON con esta forma exacta: { "productos": [{ "nombre": "<texto>", "precio": <entero CLP> }] }.',
    'Ignora títulos de sección, teléfonos, direcciones y todo lo que no sea un producto con precio.',
    'Si un precio no se ve, usa 0. No inventes productos.',
  ].join(' ');
}

async function extraerProductos(imageBase64, mimeType = 'image/jpeg', opts = {}) {
  const http = opts.http || axios;
  const model = process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash';
  const key = process.env.GEMINI_API_KEY;
  const body = {
    model,
    messages: [{ role: 'user', content: [
      { type: 'text', text: buildPrompt() },
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
    ] }],
    temperature: 0.1,
  };
  const res = await http.post(BASE, body, { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 30000 });
  const content = (res && res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message && res.data.choices[0].message.content) || '';
  return { productos: normalizeProductos(parseJsonLoose(content)) };
}

module.exports = { extraerProductos, normalizeProductos, parseJsonLoose };
