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

module.exports = { esSustancial, parseJsonLoose };
