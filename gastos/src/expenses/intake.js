const { extractExpense } = require('../ocr/extract');
const { createExpense } = require('./repo');
const { findDuplicate } = require('./dedup');
const { imageHash } = require('./hash');
const realStorage = require('./storage');
const { createLineas } = require('./lineas-repo');
const { mapearLineas } = require('../auxiliares/mapear');
const { getGiro } = require('../companies/repo');
const { normalizeRut } = require('../domain/normalize');
const { consumirCredito } = require('../billing/creditos');

// Devuelve { expense, duplicado }.
// - duplicado fuerte sin override: expense = null (no se inserta).
// - duplicado suave o fuerte con override: inserta y devuelve el duplicado encontrado.
// - sin duplicado: inserta y duplicado = null.
async function intakeFromImage({
  db, companyId, employeeId, imageBuffer, mimeType = 'image/jpeg', canal = 'whatsapp',
  waMessageId, fotoPath, extract, override = false, waSenderName, waSenderPhone,
  storeImage, mapearAux, companyRut = '', overrideReceptor = false, forceIngreso = false,
}) {
  const run = extract || extractExpense;
  const _store = storeImage || realStorage.storeImage;
  // Cobra 1 crédito 'imagen' antes de gastar la llamada de IA. Si no hay saldo,
  // lanza SinCreditosError y NO se ejecuta el OCR.
  await consumirCredito(db, companyId, { tipo: 'imagen', cantidad: 1, meta: { canal } });
  const extracted = await run({ imageBuffer, mimeType });

  if (extracted.tipo === 'cartola' || extracted.tipo === 'libro_compra_venta') {
    return { expense: null, duplicado: null, documento: extracted.tipo };
  }

  // Detecta si la empresa es el EMISOR (factura de venta propia).
  // El ingreso queda pendiente hasta confirmar cobro con la cartola.
  if (!forceIngreso && companyRut && extracted.rut_emisor) {
    const rutNorm = normalizeRut(companyRut);
    if (rutNorm && extracted.rut_emisor === rutNorm) {
      return {
        expense: null, duplicado: null,
        es_venta: {
          receptor_rut: extracted.receptor_rut || '',
          receptor_nombre: extracted.receptor_nombre || '',
          preview: { total: extracted.total, folio: extracted.folio, tipo_documento: extracted.tipo_documento },
        },
      };
    }
  }

  // Valida que la factura esté dirigida a la empresa del usuario.
  // No aplica cuando: se forzó como ingreso, es una transferencia/depósito (tipo=ingreso), o no hay companyRut.
  if (!overrideReceptor && !forceIngreso && extracted.tipo !== 'ingreso' && extracted.receptor_rut && companyRut) {
    const rutEmpresa = normalizeRut(companyRut);
    if (rutEmpresa && extracted.receptor_rut !== rutEmpresa) {
      return {
        expense: null, duplicado: null,
        receptor_ajeno: {
          receptor_rut: extracted.receptor_rut,
          receptor_nombre: extracted.receptor_nombre || '',
          preview: { proveedor: extracted.proveedor, total: extracted.total, tipo_documento: extracted.tipo_documento },
        },
      };
    }
  }

  const image_hash = imageHash(imageBuffer);
  // forceIngreso: la empresa es el emisor (venta). El "proveedor" en este contexto es el cliente comprador.
  const tipo = forceIngreso ? 'ingreso' : (extracted.tipo === 'ingreso' ? 'ingreso' : 'gasto');
  const proveedor = forceIngreso
    ? (extracted.receptor_nombre || extracted.receptor_rut || extracted.proveedor || '')
    : extracted.proveedor;

  const duplicado = await findDuplicate(db, companyId, {
    tipo,
    rut_emisor: extracted.rut_emisor,
    folio: extracted.folio,
    nro_operacion: extracted.nro_operacion,
    image_hash,
    total: extracted.total,
    fecha: extracted.fecha,
    proveedor,
  });

  if (duplicado && duplicado.nivel === 'fuerte' && !override) {
    return { expense: null, duplicado };
  }

  const expense = await createExpense(db, {
    ...extracted,
    tipo,
    proveedor,
    image_hash,
    company_id: companyId,
    employee_id: employeeId,
    canal,
    wa_message_id: waMessageId,
    foto_path: fotoPath,
    wa_sender_name: waSenderName,
    wa_sender_phone: waSenderPhone,
    dedup_override: !!(override && duplicado && duplicado.nivel === 'fuerte'),
  });

  if (imageBuffer && imageBuffer.length) {
    const name = _store(imageBuffer, mimeType, expense.id);
    if (name) {
      await db.query('UPDATE expenses SET foto_path=$1 WHERE id=$2', [name, expense.id]);
      expense.foto_path = name;
    }
  }

  // Detalle línea-a-línea (auxiliares A2). Mapea a auxiliares antes de persistir.
  // Si el mapeo falla, las líneas se guardan igual (sin auxiliar_id). No rompe el alta.
  if (expense && Array.isArray(extracted.lineas) && extracted.lineas.length) {
    let lineas = extracted.lineas;
    try {
      const _map = mapearAux || (async (ls) => {
        let giro = ''; try { giro = await getGiro(db, companyId); } catch (e) { giro = ''; }
        return mapearLineas(db, companyId, ls, { giro });
      });
      lineas = await _map(lineas);
    } catch (e) { lineas = extracted.lineas; }
    try { await createLineas(db, expense.id, lineas); } catch (e) { /* noop */ }
  }

  return { expense, duplicado: duplicado || null };
}

module.exports = { intakeFromImage };
