// M1 — Extrae las LÍNEAS de una cartola bancaria (o voucher) y las normaliza
// para alimentar el motor de Match. La llamada a Gemini es el wrapper; la
// lógica testeable es parseCartolaLines.
const axios = require('axios');
const { parseFecha, parseAmountClp } = require('../domain/normalize');

const BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

function looseParse(input) {
  if (input && typeof input === 'object') return input;
  const s = String(input || '');
  const fenced = s.replace(/```json/gi, '```').split('```');
  for (const c of [s, ...fenced]) {
    const tries = [];
    const o1 = c.indexOf('{'); const o2 = c.lastIndexOf('}');
    const a1 = c.indexOf('['); const a2 = c.lastIndexOf(']');
    if (o1 >= 0 && o2 > o1) tries.push(c.slice(o1, o2 + 1));
    if (a1 >= 0 && a2 > a1) tries.push(c.slice(a1, a2 + 1));
    for (const t of tries) { try { return JSON.parse(t); } catch { /* sigue */ } }
  }
  return {};
}

function parseCartolaLines(input) {
  const obj = looseParse(input);
  const arr = Array.isArray(obj) ? obj : (obj.movimientos || obj.lineas || obj.lines || []);
  const out = [];
  for (const raw of (Array.isArray(arr) ? arr : [])) {
    if (!raw || typeof raw !== 'object') continue;
    const fecha = parseFecha(raw.fecha);
    if (!fecha) continue;
    let tipo; let monto;
    if (raw.monto != null && raw.tipo) {
      monto = parseAmountClp(raw.monto); tipo = raw.tipo;
    } else {
      const cargo = parseAmountClp(raw.cargo);
      const abono = parseAmountClp(raw.abono);
      if (cargo > 0) { tipo = 'cargo'; monto = cargo; }
      else if (abono > 0) { tipo = 'abono'; monto = abono; }
      else { monto = parseAmountClp(raw.monto); tipo = raw.tipo || 'cargo'; }
    }
    if (!monto || monto <= 0) continue;
    out.push({
      fecha,
      tipo,
      monto,
      glosa: raw.glosa || raw.descripcion || '',
      n_operacion: String(raw.n_operacion || raw.nro_operacion || raw.operacion || ''),
      rut: raw.rut || raw.rut_contraparte || '',
      saldo: raw.saldo != null ? parseAmountClp(raw.saldo) : null,
    });
  }
  return out;
}

function buildCartolaPrompt() {
  return [
    'Eres un extractor de cartolas bancarias y vouchers chilenos.',
    'Devuelve SOLO un JSON con la forma { "movimientos": [ ... ] }.',
    'Cada movimiento es un objeto con: fecha (dd/mm/aaaa), glosa (descripción del movimiento, incluye nombre del comercio o contraparte),',
    'cargo (monto si es un cargo/débito, en pesos CLP enteros, 0 si no aplica),',
    'abono (monto si es un abono/crédito, 0 si no aplica),',
    'saldo (saldo de la línea si aparece), n_operacion (N° de operación/transacción/documento si aparece),',
    'rut (RUT de la contraparte si aparece, ej. en transferencias).',
    'Incluye además, en el nivel raíz del JSON, `saldo_inicial` y `saldo_final` (saldos del período de la cartola, en CLP entero, si aparecen). No incluyas filas de saldo como movimientos.',
    'No inventes montos. Si un campo no aparece, usa "" o 0.',
  ].join(' ');
}

async function geminiExtractCartola(imageBase64, mimeType = 'image/jpeg') {
  const model = process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash';
  const key = process.env.GEMINI_API_KEY;
  const body = {
    model,
    messages: [{ role: 'user', content: [
      { type: 'text', text: buildCartolaPrompt() },
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
    ] }],
    temperature: 0.1,
  };
  const res = await axios.post(BASE, body, {
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    timeout: 60000,
  });
  const content = res?.data?.choices?.[0]?.message?.content || '';
  return parseCartolaLines(content);
}

function parseCartolaDoc(input) {
  const obj = looseParse(input);
  const lineas = parseCartolaLines(obj);
  const si = obj && (obj.saldo_inicial != null ? obj.saldo_inicial : obj.saldoInicial);
  const sf = obj && (obj.saldo_final != null ? obj.saldo_final : obj.saldoFinal);
  return {
    lineas,
    saldoInicial: si != null && si !== '' ? parseAmountClp(si) : null,
    saldoFinal: sf != null && sf !== '' ? parseAmountClp(sf) : null,
  };
}

module.exports = { parseCartolaLines, parseCartolaDoc, geminiExtractCartola };
