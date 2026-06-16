// gastos/src/ocr/libro-sii.js
// Lee un libro de compras/ventas del SII (imagen/PDF) → lista de DTE normalizados.
// parseLibroSii es la lógica pura testeable; geminiExtractLibroSii es el wrapper.
const axios = require('axios');
const { parseFecha, parseAmountClp } = require('../domain/normalize');
const { computeTotals } = require('../domain/money');
const BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

function looseParse(input) {
  if (input && typeof input === 'object') return input;
  const s = String(input || '');
  const fenced = s.replace(/```json/gi, '```').split('```');
  for (const c of [s, ...fenced]) {
    const a = c.indexOf('{'); const b = c.lastIndexOf('}');
    const a2 = c.indexOf('['); const b2 = c.lastIndexOf(']');
    for (const t of [a >= 0 && b > a ? c.slice(a, b + 1) : null, a2 >= 0 && b2 > a2 ? c.slice(a2, b2 + 1) : null]) {
      if (t) { try { return JSON.parse(t); } catch { /* sigue */ } }
    }
  }
  return {};
}

function parseLibroSii(input) {
  const obj = looseParse(input);
  const arr = Array.isArray(obj) ? obj : (obj.documentos || obj.docs || obj.movimientos || []);
  const out = [];
  for (const raw of (Array.isArray(arr) ? arr : [])) {
    if (!raw || typeof raw !== 'object') continue;
    const folio = String(raw.folio || raw.nro || '').trim();
    if (!folio) continue;
    const t = computeTotals({ neto: parseAmountClp(raw.neto), iva: parseAmountClp(raw.iva), total: parseAmountClp(raw.total) });
    if (t.total <= 0) continue;
    const clase = String(raw.clase || raw.tipo || '').toLowerCase().indexOf('vent') >= 0 ? 'venta' : 'compra';
    out.push({
      clase,
      tipo_doc: String(raw.tipo_doc || raw.tipo_documento || 'factura').toLowerCase(),
      rut: String(raw.rut || raw.rut_contraparte || '').trim(),
      folio,
      fecha: parseFecha(raw.fecha) || null,
      neto: t.neto, iva: t.iva, total: t.total,
    });
  }
  return out;
}

function buildLibroPrompt() {
  return [
    'Eres un extractor del libro de compras y ventas del SII de Chile.',
    'Devuelve SOLO un JSON { "documentos": [ ... ] }.',
    'Cada documento: clase ("compra" o "venta"), tipo_doc (factura|boleta|nota_credito|nota_debito|otro),',
    'rut (RUT de la contraparte), folio (número del documento), fecha (dd/mm/aaaa),',
    'neto (CLP entero), iva (CLP entero), total (CLP entero). No inventes; si falta, usa "" o 0.',
  ].join(' ');
}

async function geminiExtractLibroSii(imageBase64, mimeType = 'image/jpeg', { http = axios, apiKey = process.env.GEMINI_API_KEY } = {}) {
  const model = process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash';
  const body = { model, messages: [{ role: 'user', content: [
    { type: 'text', text: buildLibroPrompt() },
    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
  ] }], temperature: 0.1 };
  const res = await http.post(BASE, body, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 60000 });
  const content = res && res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message && res.data.choices[0].message.content || '';
  return parseLibroSii(content);
}

module.exports = { parseLibroSii, geminiExtractLibroSii };
