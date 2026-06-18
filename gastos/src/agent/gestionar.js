// Gestionar (M3): reconcilia cada hecho nuevo contra la memoria existente
// (dedupe semántico + contradicciones) usando un LLM-juez. Reusa kaly_memory
// y el soft-delete (borrarMemoria) para "reemplazar". Sin pgvector.
const axios = require('axios');
const { normalizeMemoria, listMemorias, crearMemoria, borrarMemoria } = require('./memory');

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

const ACCIONES = ['insertar', 'duplicado', 'reemplaza'];

function normalizeVeredicto(data, n) {
  const accion = ACCIONES.includes(data && data.accion) ? data.accion : 'insertar';
  let indice = Number(data && data.indice);
  if (!Number.isInteger(indice) || indice < 1 || indice > n) indice = null;
  if (accion === 'insertar' || indice === null) return { accion: 'insertar', indice: null };
  return { accion, indice };
}

function buildJuezPrompt(hechoNuevo, existentes) {
  const lista = existentes.map((m, i) => `${i + 1}. ${m.contenido}`).join('\n');
  return [
    'Eres el gestor de memoria de KALY, la asistente de una pyme chilena.',
    'Tengo una lista de hechos que YA SÉ del negocio, y un HECHO NUEVO.',
    'Decide la relación del hecho nuevo con la lista:',
    '- "insertar": información nueva, no está en la lista y no contradice nada.',
    '- "duplicado": significa lo mismo que un hecho de la lista, aunque esté redactado distinto (ej. "cierra domingos" = "no atiende los domingos").',
    '- "reemplaza": contradice un hecho de la lista — mismo tema, valor distinto (ej. cambió un horario, un precio, una dirección).',
    'Devuelve SOLO un JSON: { "accion": "insertar|duplicado|reemplaza", "indice": <número del hecho de la lista, o null si insertar> }.',
    'HECHOS QUE YA SÉ:',
    lista,
    `HECHO NUEVO: ${hechoNuevo.contenido}`,
  ].join('\n');
}

async function juzgarHecho({ hechoNuevo, existentes, http } = {}) {
  const client = http || axios;
  const model = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
  const key = process.env.GEMINI_API_KEY;
  const lista = existentes || [];
  const body = {
    model,
    messages: [{ role: 'user', content: buildJuezPrompt(hechoNuevo, lista) }],
    temperature: 0,
  };
  const res = await client.post(BASE, body, {
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    timeout: 30000,
  });
  const content = (res && res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message && res.data.choices[0].message.content) || '';
  return normalizeVeredicto(parseJsonLoose(content), lista.length);
}

module.exports = { juzgarHecho, normalizeVeredicto, parseJsonLoose };
