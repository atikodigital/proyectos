const { extractExpense } = require('../ocr/extract');
const { createExpense } = require('./repo');
const { findDuplicate } = require('./dedup');
const { imageHash } = require('./hash');
const realStorage = require('./storage');

// Devuelve { expense, duplicado }.
// - duplicado fuerte sin override: expense = null (no se inserta).
// - duplicado suave o fuerte con override: inserta y devuelve el duplicado encontrado.
// - sin duplicado: inserta y duplicado = null.
async function intakeFromImage({
  db, companyId, employeeId, imageBuffer, mimeType = 'image/jpeg', canal = 'whatsapp',
  waMessageId, fotoPath, extract, override = false, waSenderName, waSenderPhone,
  storeImage,
}) {
  const run = extract || extractExpense;
  const _store = storeImage || realStorage.storeImage;
  const extracted = await run({ imageBuffer, mimeType });

  if (extracted.tipo === 'cartola' || extracted.tipo === 'libro_compra_venta') {
    return { expense: null, duplicado: null, documento: extracted.tipo };
  }

  const image_hash = imageHash(imageBuffer);
  const tipo = extracted.tipo === 'ingreso' ? 'ingreso' : 'gasto';

  const duplicado = await findDuplicate(db, companyId, {
    tipo,
    rut_emisor: extracted.rut_emisor,
    folio: extracted.folio,
    nro_operacion: extracted.nro_operacion,
    image_hash,
    total: extracted.total,
    fecha: extracted.fecha,
    proveedor: extracted.proveedor,
  });

  if (duplicado && duplicado.nivel === 'fuerte' && !override) {
    return { expense: null, duplicado };
  }

  const expense = await createExpense(db, {
    ...extracted,
    tipo,
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

  return { expense, duplicado: duplicado || null };
}

module.exports = { intakeFromImage };
