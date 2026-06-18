// gastos/src/varas/gemini.js
// Adaptador Gemini (OpenAI-compat) para VARAS, estilo ReAct: el modelo emite un JSON
// {"tool":...,"args":...} para llamar una tool, o responde texto. Encaja con responder().
const axios = require('axios');
const BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

function buildPromptChat({ systemPrompt = '', tools = [], messages = [] }) {
  const herramientas = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');
  const transcript = (messages || []).map((m) => {
    if (m.role === 'tool') return `RESULTADO de ${m.name || 'tool'}: ${m.text}`;
    if (m.role === 'assistant') return `VARAS: ${m.text}`;
    return `USUARIO: ${m.text}`;
  }).join('\n');
  return [
    systemPrompt,
    'Tienes estas herramientas:',
    herramientas,
    'Para usar UNA herramienta, responde EXACTAMENTE un JSON {"tool":"<nombre>","args":{...}} y NADA más.',
    'Cuando ya tengas los datos para responder, escribe la respuesta al usuario en texto normal (sin JSON).',
    'Conversación:',
    transcript,
  ].join('\n');
}

function parseSalida(content) {
  const s = String(content || '').trim();
  const fenced = s.replace(/```json/gi, '```').split('```');
  for (const c of [s, ...fenced]) {
    const a = c.indexOf('{'); const b = c.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        const obj = JSON.parse(c.slice(a, b + 1));
        if (obj && typeof obj.tool === 'string') return { tool: { name: obj.tool, args: obj.args || {} } };
      } catch (_) { /* no es JSON de tool */ }
    }
  }
  return { text: s };
}

async function geminiChat(payload, { http = axios, apiKey = process.env.GEMINI_API_KEY, model } = {}) {
  const m = model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const body = { model: m, messages: [{ role: 'user', content: buildPromptChat(payload) }], temperature: 0.1 };
  const res = await http.post(BASE, body, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 30000 });
  const content = res && res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message && res.data.choices[0].message.content || '';
  return parseSalida(content);
}

module.exports = { geminiChat, buildPromptChat, parseSalida };
