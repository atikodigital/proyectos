// Semilla de auxiliares por rubro. La IA propone el set inicial según el giro.
const axios = require('axios');
const auxRepo = require('./repo');
const { matchExistente } = require('./mapear');
const BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

function buildPromptSemilla(giro) {
  return [
    'Eres un contador que arma el catálogo inicial de insumos (auxiliares) de un negocio.',
    'Rubro: ' + (giro || 'general') + '.',
    'Lista entre 8 y 20 insumos/servicios típicos del rubro, con nombre canónico corto.',
    'Responde SOLO JSON { "auxiliares": [ { "nombre": "Harina", "naturaleza": "insumo|servicio|energia|otro", "unidad": "kg|L|kWh|m3|un|hora|fijo" } ] }.',
  ].join('\n');
}

function parseSemilla(content) {
  let obj = {};
  const s = String(content || '');
  const fenced = s.replace(/```json/gi, '```').split('```');
  for (const c of [s, ...fenced]) {
    const a = c.indexOf('{'); const b = c.lastIndexOf('}');
    if (a >= 0 && b > a) { try { obj = JSON.parse(c.slice(a, b + 1)); break; } catch { /* sigue */ } }
  }
  const arr = Array.isArray(obj.auxiliares) ? obj.auxiliares : [];
  return arr.map((x) => ({ nombre: String(x.nombre || '').trim(), naturaleza: x.naturaleza || 'insumo', unidad: x.unidad || 'un' })).filter((x) => x.nombre);
}

async function _componerSemilla(giro, { http = axios, apiKey = process.env.GEMINI_API_KEY, model } = {}) {
  const m = model || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  const body = { model: m, messages: [{ role: 'user', content: buildPromptSemilla(giro) }], temperature: 0.2 };
  const res = await http.post(BASE, body, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 30000 });
  const content = res && res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message && res.data.choices[0].message.content || '';
  return parseSemilla(content);
}

// Crea los auxiliares sugeridos por la IA para el rubro. Idempotente (no duplica por nombre).
async function sembrarPorRubro(db, companyId, giro, { componer } = {}) {
  const _componer = componer || ((g) => _componerSemilla(g, {}));
  let propuestos = [];
  try { propuestos = await _componer(giro); } catch (e) { return 0; }
  const existentes = await auxRepo.listAuxiliares(db, companyId);
  let creados = 0;
  for (const p of propuestos) {
    if (matchExistente(p.nombre, existentes)) continue;
    await auxRepo.createAuxiliar(db, companyId, { nombre: p.nombre, naturaleza: p.naturaleza, unidad_principal: p.unidad, estado: 'sugerido' });
    existentes.push({ nombre: p.nombre, sinonimos: [] });
    creados++;
  }
  return creados;
}

module.exports = { sembrarPorRubro, buildPromptSemilla, parseSemilla };
