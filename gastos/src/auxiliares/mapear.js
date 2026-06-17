// gastos/src/auxiliares/mapear.js
// Mapea líneas de factura a auxiliares (insumos). Capa determinística + IA.

// Normaliza una descripción a una "clave" comparable: minúsculas, sin tildes,
// sin números/unidades/tamaños/multiplicadores, espacios colapsados.
function normalizarDescripcion(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')      // tildes
    .replace(/\b\d+([.,]\d+)?\s*(kg|kgs|kilo|kilos|g|gr|grs|l|lt|lts|litro|litros|ml|cc|kwh|kw|m3|m2|un|und|unidad|unidades|cc|pack|caja|cajas|saco|sacos)\b/g, ' ') // cantidad+unidad
    .replace(/\bx\s*\d+\b/g, ' ')                          // multiplicador "x3"
    .replace(/\b\d+\b/g, ' ')                              // números sueltos
    .replace(/[^a-z0-9 ]/g, ' ')                           // símbolos
    .replace(/\s+/g, ' ')
    .trim();
}

// Busca un auxiliar existente cuyo nombre o sinónimo coincida con la descripción
// normalizada (igualdad o inclusión por tokens). Devuelve el auxiliar o null.
function matchExistente(descripcion, auxiliares) {
  const d = normalizarDescripcion(descripcion);
  if (!d) return null;
  for (const a of (auxiliares || [])) {
    const claves = [normalizarDescripcion(a.nombre), ...((a.sinonimos || []).map(normalizarDescripcion))].filter(Boolean);
    for (const k of claves) {
      if (!k) continue;
      if (d === k || d.includes(k) || k.includes(d)) return a;
    }
  }
  return null;
}

const axios = require('axios');
const BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

function buildPromptMapeo({ lineas = [], auxiliares = [], giro = '' } = {}) {
  const cat = auxiliares.map((a) => a.nombre).filter(Boolean);
  return [
    'Eres el clasificador de insumos de una contabilidad analítica.',
    giro ? ('El rubro del negocio es: ' + giro + '.') : '',
    'Tienes un CATÁLOGO de auxiliares (insumos) existentes: ' + JSON.stringify(cat) + '.',
    'Para cada LÍNEA de factura, asígnala a un auxiliar del catálogo si corresponde (mismo insumo, agrupando tamaños/marcas), o propone uno NUEVO con un nombre CANÓNICO y corto (ej. "Harina", "Mantequilla", "Electricidad").',
    'Líneas: ' + JSON.stringify(lineas) + '.',
    'Responde SOLO JSON { "mapeos": [ { "idx": <n>, "auxiliar": "<nombre canónico>", "existe": true|false, "naturaleza": "insumo|servicio|energia|otro", "unidad": "kg|g|L|ml|kWh|m3|m2|un|hora|fijo", "cuentaClave": "<opcional>" } ] }.',
    'No inventes insumos que no estén en la línea. Un nombre canónico por insumo.',
  ].filter(Boolean).join('\n');
}

function parseMapeo(content) {
  let obj = {};
  const s = String(content || '');
  const fenced = s.replace(/```json/gi, '```').split('```');
  for (const c of [s, ...fenced]) {
    const a = c.indexOf('{'); const b = c.lastIndexOf('}');
    if (a >= 0 && b > a) { try { obj = JSON.parse(c.slice(a, b + 1)); break; } catch { /* sigue */ } }
  }
  const arr = Array.isArray(obj.mapeos) ? obj.mapeos : [];
  return arr.map((m) => ({
    idx: Number(m.idx),
    auxiliar: String(m.auxiliar || '').trim(),
    existe: !!m.existe,
    naturaleza: m.naturaleza || 'insumo',
    unidad: m.unidad || 'un',
    cuentaClave: m.cuentaClave || null,
  })).filter((m) => Number.isFinite(m.idx) && m.auxiliar);
}

async function componerMapeo(payload, { http = axios, apiKey = process.env.GEMINI_API_KEY, model } = {}) {
  const m = model || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  const body = { model: m, messages: [{ role: 'user', content: buildPromptMapeo(payload) }], temperature: 0.1 };
  const res = await http.post(BASE, body, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 30000 });
  const content = res && res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message && res.data.choices[0].message.content || '';
  return parseMapeo(content);
}

// Devuelve las líneas con `auxiliar_id` asignado. Crea auxiliares 'sugerido' cuando hace falta.
// `componer` inyectable (default componerMapeo). Si la IA falla, las no matcheadas quedan null.
// Lazy-require de repo y cuentas para evitar el ciclo circular (repo.js → mapear.js → repo.js).
async function mapearLineas(db, companyId, lineas, { giro = '', componer } = {}) {
  // eslint-disable-next-line global-require
  const auxRepo = require('./repo');
  // eslint-disable-next-line global-require
  const { getCuentaId } = require('../contabilidad/cuentas');

  const _componer = componer || ((payload) => componerMapeo(payload, {}));
  const out = (lineas || []).map((l) => ({ ...l, auxiliar_id: null }));

  // 1) Match determinístico contra el catálogo existente.
  const pendientes = [];
  for (let i = 0; i < out.length; i++) {
    const hit = await auxRepo.findMatch(db, companyId, out[i].descripcion);
    if (hit) { out[i].auxiliar_id = hit.id; }
    else { pendientes.push({ idx: i, descripcion: out[i].descripcion }); }
  }
  if (!pendientes.length) return out;

  // 2) IA para lo no reconocido (una llamada). Si falla, quedan null.
  let mapeos = [];
  try {
    const auxiliares = await auxRepo.listAuxiliares(db, companyId);
    mapeos = await _componer({ lineas: pendientes, auxiliares, giro });
  } catch (e) { return out; }

  for (const m of mapeos) {
    const i = m.idx;
    if (i == null || !out[i]) continue;
    // ¿existe ya por nombre? (la IA puede decir "existe" o proponer uno que ya está)
    let aux = await auxRepo.findMatch(db, companyId, m.auxiliar);
    if (!aux) {
      let cuenta_id = null;
      if (m.cuentaClave) { try { cuenta_id = await getCuentaId(db, companyId, m.cuentaClave); } catch (e) { cuenta_id = null; } }
      aux = await auxRepo.createAuxiliar(db, companyId, {
        nombre: m.auxiliar, naturaleza: m.naturaleza, unidad_principal: m.unidad, cuenta_id, estado: 'sugerido',
        sinonimos: [out[i].descripcion],
      });
    } else {
      // agrega la descripción cruda como sinónimo para futuros matches deterministas
      try { await auxRepo.addSinonimo(db, aux.id, out[i].descripcion); } catch (e) { /* noop */ }
    }
    out[i].auxiliar_id = aux.id;
  }
  return out;
}

module.exports = { normalizarDescripcion, matchExistente, buildPromptMapeo, parseMapeo, componerMapeo, mapearLineas };
