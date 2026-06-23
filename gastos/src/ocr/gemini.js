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
    'Eres un extractor de datos de comprobantes chilenos (boletas, facturas y comprobantes de transferencia/depósito).',
    'Primero determina el campo tipo:',
    '- "gasto" si es una boleta o factura (un comercio nos cobra).',
    '- "ingreso" si es un comprobante de transferencia/depósito recibido (entra plata).',
    '- "cartola" si es un listado de movimientos bancarios con cargos, abonos y saldos (cartola bancaria).',
    '- "libro_compra_venta" si es un registro del SII con múltiples folios y RUTs de compras o ventas.',
    'Devuelve SOLO un JSON con estos campos:',
    'tipo (gasto|ingreso|cartola|libro_compra_venta), tipo_documento (boleta|factura|transferencia|deposito|otro),',
    'rut_emisor (RUT de quien EMITE el documento — el vendedor/proveedor — NUNCA el RUT del receptor o empresa compradora),',
    'folio, nro_operacion (N° de operación/transacción si es transferencia),',
    'direccion_emisor (dirección del emisor/vendedor),',
    'proveedor: para GASTO es la razón social del EMISOR (quien vende y cobra, el que aparece en el encabezado como "EMISOR" o "VENDEDOR"); NUNCA uses la razón social del RECEPTOR (a quien va dirigida la factura — ese es el comprador). Para INGRESO es el nombre de quien envía el pago.',
    'receptor_rut (RUT de quien RECIBE la factura — el comprador; extrae del bloque RECEPTOR o "RAZÓN SOCIAL RECEPTOR"; si no aparece usa ""),',
    'receptor_nombre (razón social del RECEPTOR/comprador; si no aparece usa ""),',
    'fecha (dd/mm/aaaa), neto, iva, total (en pesos CLP enteros),',
    `categoria (una de: ${CATEGORIES.join(', ')}; solo para gasto), glosa (descripción corta).`,
    'lineas (arreglo del detalle del documento; SOLO para gasto/factura con ítems): cada elemento { descripcion, cantidad, unidad (kg|g|L|ml|kWh|m3|m2|un|hora), neto, iva, total } en CLP entero. Si no hay detalle de ítems, usa [].',
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
