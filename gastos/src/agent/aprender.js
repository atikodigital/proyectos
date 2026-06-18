// Aprender automático (M2): al cerrar una conversación sustancial, extrae los
// hechos nuevos del negocio/dueño y los guarda en kaly_memory (origen 'auto').
const axios = require('axios');
const { listMemorias, crearMemoria, normalizeMemoria, formatMemoriaBlock } = require('./memory');

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

function esSustancial(transcripcion) {
  const arr = Array.isArray(transcripcion) ? transcripcion : [];
  const conTexto = arr.filter((t) => t && String(t.text || '').trim());
  return conTexto.length >= 4;
}

function buildExtractPrompt(memoriaActual) {
  const memTxt = formatMemoriaBlock(memoriaActual) || '(sin memoria previa)';
  return [
    'Eres el extractor de memoria de KALY, la asistente de una pyme chilena.',
    'Lee la conversación entre el dueño y KALY y extrae SOLO hechos DURADEROS del negocio o del dueño',
    '(horarios, productos/servicios, ubicación, formas de pago, preferencias, datos del dueño).',
    'NADA de saludos, chit-chat ni cosas del momento.',
    'NO repitas hechos que ya estén en esta memoria actual:',
    memTxt,
    'Devuelve SOLO un JSON con esta forma exacta: { "hechos": [{ "tipo": "negocio|dueño|preferencia|hecho", "contenido": "<frase corta>" }] }.',
    'Si no hay nada nuevo que valga la pena recordar, devuelve { "hechos": [] }.',
  ].join(' ');
}

function transcripcionToText(transcripcion) {
  const arr = Array.isArray(transcripcion) ? transcripcion : [];
  return arr
    .map((t) => `${t && t.role === 'kaly' ? 'KALY' : 'Dueño'}: ${String((t && t.text) || '').trim()}`)
    .filter((l) => l.length > 7)
    .join('\n');
}

async function extraerHechos({ transcripcion, memoriaActual, http } = {}) {
  const client = http || axios;
  const model = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
  const key = process.env.GEMINI_API_KEY;
  const body = {
    model,
    messages: [
      { role: 'user', content: `${buildExtractPrompt(memoriaActual)}\n\nCONVERSACIÓN:\n${transcripcionToText(transcripcion)}` },
    ],
    temperature: 0.1,
  };
  const res = await client.post(BASE, body, {
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    timeout: 30000,
  });
  const content = (res && res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message && res.data.choices[0].message.content) || '';
  const data = parseJsonLoose(content);
  const arr = Array.isArray(data && data.hechos) ? data.hechos : [];
  return arr.map((h) => normalizeMemoria(h)).filter(Boolean);
}

module.exports = { esSustancial, extraerHechos, parseJsonLoose };
