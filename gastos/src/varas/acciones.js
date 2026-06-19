// gastos/src/varas/acciones.js
// Ejecuta las acciones que VARAS propuso y el dueño confirmó. Scoped por empresa.
const { markExpensePaid, getExpense, createExpense, confirmExpense } = require('../expenses/repo');
const { listExpenses } = require('../expenses/query');
const { aplicarContabilidad } = require('../contabilidad/contabilizar');
const { mapCategoryToSii } = require('../domain/categories');
const { computeTotals } = require('../domain/money');
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

// Registra un movimiento (gasto/ingreso) confirmado, igual que /expenses/manual.
async function _crearMovimiento(db, companyId, args) {
  const tipo = args.tipo === 'ingreso' ? 'ingreso' : 'gasto';
  const totals = computeTotals({ neto: args.neto, iva: args.iva, total: args.total });
  if (!totals.total) return { ok: false, error: 'monto_requerido' };
  let cuentaSii = {};
  if (tipo !== 'ingreso' && args.categoria) {
    const cuenta = mapCategoryToSii(args.categoria);
    cuentaSii = { cuenta_sii_codigo: cuenta.codigo, cuenta_sii_nombre: cuenta.nombre };
  }
  const creado = await createExpense(db, {
    company_id: companyId,
    canal: 'app',
    tipo,
    proveedor: args.proveedor || 'Transacción manual',
    fecha: args.fecha || new Date().toISOString().slice(0, 10),
    neto: totals.neto,
    iva: totals.iva,
    total: totals.total,
    categoria: args.categoria,
    estado_pago: args.estado_pago || 'pendiente',
    ...cuentaSii,
  });
  // createExpense no acepta 'estado' (queda pendiente_confirmacion); lo confirmamos.
  const expense = (await confirmExpense(db, creado.id)) || creado;
  try { await aplicarContabilidad(db, companyId, expense, 'confirmar'); } catch (_) { /* contabilidad best-effort */ }
  return { ok: true, expenseId: expense.id, total: expense.total };
}

async function ejecutarAccion(db, companyId, tipo, args = {}, { sendText } = {}) {
  const _send = sendText || require('../whatsapp/client').sendText;
  if (tipo === 'marcar_pagado') return _marcarPagado(db, companyId, args);
  if (tipo === 'crear_asiento_manual') return _crearAsiento(db, companyId, args);
  if (tipo === 'enviar_resumen_whatsapp') return _resumenWhatsapp(db, companyId, args, _send);
  if (tipo === 'crear_movimiento') return _crearMovimiento(db, companyId, args);
  return { ok: false, error: 'accion_desconocida' };
}

module.exports = { ejecutarAccion };
