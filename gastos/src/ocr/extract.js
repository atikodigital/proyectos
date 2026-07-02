const { documentAiExtract } = require('./documentai');
const { geminiExtract } = require('./gemini');
const { preprocessForOcr } = require('./preprocess');
const { computeTotals } = require('../domain/money');
const { normalizeRut, isValidRut, parseFecha } = require('../domain/normalize');
const { isValidCategory, mapCategoryToSii } = require('../domain/categories');
const { normalizeLineas } = require('../domain/lineas');

function pick(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== '' && v !== 0) return v;
  }
  return '';
}

async function extractExpense({ imageBuffer, mimeType = 'image/jpeg' }) {
  const processed = await preprocessForOcr(imageBuffer);
  const b64 = processed.toString('base64');

  // Antes ambos motores se tragaban CUALQUIER error en silencio (.catch(() => ({})))
  // — si los dos fallaban (cuota, API key, timeout, etc.) el usuario veía la pantalla
  // de confirmación con todos los campos vacíos, sin ningún rastro en los logs para
  // diagnosticar la causa real. Ahora se loguea el motivo antes de devolver vacío.
  const [docai, gem] = await Promise.all([
    documentAiExtract(processed, mimeType).catch((e) => { console.error('[ocr] documentAiExtract falló:', e && (e.message || e)); return {}; }),
    geminiExtract(b64, mimeType).catch((e) => { console.error('[ocr] geminiExtract falló:', e && (e.response && e.response.data ? JSON.stringify(e.response.data).slice(0, 300) : (e.message || e))); return {}; }),
  ]);

  // Tipo de documento → exento (sin IVA) / nota de crédito (resta).
  const tipoDoc = String(gem.tipo_documento || 'otro').toLowerCase();
  const esExento = /exent/.test(tipoDoc) || tipoDoc === '34';
  const esNotaCredito = /cr[eé]dito/.test(tipoDoc) || tipoDoc === '61';

  // Montos: DocAI manda; si falta, Gemini.
  const totals = computeTotals({
    neto: pick(docai.neto, gem.neto) || 0,
    iva: pick(docai.iva, gem.iva) || 0,
    total: pick(docai.total, gem.total) || 0,
    exento: esExento,
  });
  // Nota de crédito: invierte el signo para que RESTE en la contabilidad.
  const signo = esNotaCredito ? -1 : 1;
  const montoNeto = signo * totals.neto;
  const montoIva = signo * totals.iva;
  const montoTotal = signo * totals.total;

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

  const rutNorm = gem.rut_emisor ? normalizeRut(gem.rut_emisor) : '';
  const receptorRut = gem.receptor_rut ? normalizeRut(gem.receptor_rut) : '';
  const receptorNombre = String(gem.receptor_nombre || '').trim();

  return {
    tipo,
    tipo_documento: tipoDoc,
    es_nota_credito: esNotaCredito,
    exento: esExento,
    rut_emisor: rutNorm,
    receptor_rut: receptorRut,
    receptor_nombre: receptorNombre,
    rut_valido: rutNorm ? isValidRut(rutNorm) : null,
    folio: String(gem.folio || '').trim(),
    nro_operacion,
    direccion_emisor: direccion,
    proveedor,
    fecha,
    neto: montoNeto,
    iva: montoIva,
    total: montoTotal,
    moneda: 'CLP',
    categoria,
    cuenta_sii_codigo: sii.codigo,
    cuenta_sii_nombre: sii.nombre,
    glosa: String(gem.glosa || '').trim(),
    confianza,
    lineas: normalizeLineas(gem.lineas),
    raw_ocr: { docai, gemini: gem },
  };
}

module.exports = { extractExpense };
