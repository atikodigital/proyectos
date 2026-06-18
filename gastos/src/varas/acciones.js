// gastos/src/varas/acciones.js
// Ejecuta las acciones que VARAS propuso y el dueño confirmó. Scoped por empresa.
const { markExpensePaid, getExpense } = require('../expenses/repo');
const { listExpenses } = require('../expenses/query');
const { aplicarContabilidad } = require('../contabilidad/contabilizar');
const { crearAsientoManual } = require('../contabilidad/manual');
const { cashflowSummary } = require('../expenses/summary');
const { formatCashflowSummary } = require('../whatsapp/format');
const { getCompanyWa } = require('../companies/repo');

async function _marcarPagado(db, companyId, args) {
  let id = args.expenseId;
  if (!id && args.descripcion) {
    const rows = await listExpenses(db, companyId, { proveedor: args.descripcion, estadoPago: 'registrada' });
    if (rows[0]) id = rows[0].id;
  }
  if (!id) return { ok: false, error: 'no_encontrado' };
  const upd = await markExpensePaid(db, companyId, id);
  if (!upd) return { ok: false, error: 'no_encontrado' };
  try { const exp = await getExpense(db, id); if (exp) await aplicarContabilidad(db, companyId, exp, 'pagar'); } catch (_) {}
  return { ok: true, expenseId: id };
}

async function _crearAsiento(db, companyId, args) {
  try { const a = await crearAsientoManual(db, companyId, args || {}); return { ok: true, asientoId: a.id }; }
  catch (e) { return { ok: false, error: e.code || 'invalido' }; }
}

async function _resumenWhatsapp(db, companyId, args, sendText) {
  const wa = await getCompanyWa(db, companyId);
  if (!wa || !wa.owner_whatsapp) return { ok: false, error: 'sin_whatsapp' };
  const d = new Date();
  const resumen = await cashflowSummary(db, companyId, { year: d.getFullYear(), month: d.getMonth() + 1 });
  const texto = formatCashflowSummary(resumen);
  // sendText toma un objeto {to, body, token, phoneNumberId}
  await sendText({ to: wa.owner_whatsapp, body: texto, token: wa.wa_token, phoneNumberId: wa.wa_phone_number_id });
  return { ok: true, to: wa.owner_whatsapp };
}

async function ejecutarAccion(db, companyId, tipo, args = {}, { sendText } = {}) {
  const _send = sendText || require('../whatsapp/client').sendText;
  if (tipo === 'marcar_pagado') return _marcarPagado(db, companyId, args);
  if (tipo === 'crear_asiento_manual') return _crearAsiento(db, companyId, args);
  if (tipo === 'enviar_resumen_whatsapp') return _resumenWhatsapp(db, companyId, args, _send);
  return { ok: false, error: 'accion_desconocida' };
}

module.exports = { ejecutarAccion };
