const { documentAiExtract } = require('./documentai');
const { geminiExtract } = require('./gemini');
const { preprocessForOcr } = require('./preprocess');
const { computeTotals } = require('../domain/money');
const { normalizeRut, parseFecha } = require('../domain/normalize');
const { isValidCategory, mapCategoryToSii } = require('../domain/categories');

function pick(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== '' && v !== 0) return v;
  }
  return '';
}

async function extractExpense({ imageBuffer, mimeType = 'image/jpeg' }) {
  const processed = await preprocessForOcr(imageBuffer);
  const b64 = processed.toString('base64');

  const [docai, gem] = await Promise.all([
    documentAiExtract(processed, mimeType).catch(() => ({})),
    geminiExtract(b64, mimeType).catch(() => ({})),
  ]);

  // Montos: DocAI manda; si falta, Gemini.
  const totals = computeTotals({
    neto: pick(docai.neto, gem.neto) || 0,
    iva: pick(docai.iva, gem.iva) || 0,
    total: pick(docai.total, gem.total) || 0,
  });

  const proveedor = String(pick(docai.proveedor, gem.proveedor) || '').trim();
  const fecha = parseFecha(pick(docai.fecha, gem.fecha));
  const direccion = String(pick(docai.direccion_emisor, gem.direccion_emisor) || '').trim();

  const tipoRaw = String(gem.tipo || '').toLowerCase();
  let tipo;
  if (tipoRaw === 'cartola' || tipoRaw === 'libro_compra_venta') {
    tipo = tipoRaw;
  } else if (tipoRaw === 'ingreso') {
    tipo = 'ingreso';
  } else {
    tipo = 'gasto';
  }
  const nro_operacion = String(gem.nro_operacion || '').trim();

  let categoria;
  let sii;
  if (tipo === 'cartola' || tipo === 'libro_compra_venta') {
    categoria = '';
    sii = { codigo: '', nombre: '' };
  } else if (tipo === 'ingreso') {
    categoria = 'Ingreso';
    sii = { codigo: '', nombre: '' };
  } else {
    categoria = String(gem.categoria || '').trim();
    if (!isValidCategory(categoria)) categoria = 'Otros gastos';
    sii = mapCategoryToSii(categoria);
  }

  // Confianza simple: cuántos campos clave salieron.
  const keys = [totals.total, proveedor, fecha, gem.rut_emisor];
  const got = keys.filter((k) => k && String(k).trim() !== '').length;
  const confianza = Math.round((got / keys.length) * 100);

  return {
    tipo,
    tipo_documento: String(gem.tipo_documento || 'otro').toLowerCase(),
    rut_emisor: gem.rut_emisor ? normalizeRut(gem.rut_emisor) : '',
    folio: String(gem.folio || '').trim(),
    nro_operacion,
    direccion_emisor: direccion,
    proveedor,
    fecha,
    neto: totals.neto,
    iva: totals.iva,
    total: totals.total,
    moneda: 'CLP',
    categoria,
    cuenta_sii_codigo: sii.codigo,
    cuenta_sii_nombre: sii.nombre,
    glosa: String(gem.glosa || '').trim(),
    confianza,
    raw_ocr: { docai, gemini: gem },
  };
}

module.exports = { extractExpense };
