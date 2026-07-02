const { activarSuscripcion } = require('./repo');
const { getCompanyIdByExternalId } = require('./webhook-paypal');

function cicloFin30Dias() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

// Processes a parsed Lemon Squeezy webhook event.
// evento shape: { meta: { event_name, custom_data }, data: { id, ... } }
async function procesarEventoLS(db, evento) {
  const type = (evento.meta && evento.meta.event_name) || null;
  const custom = (evento.meta && evento.meta.custom_data) || {};
  const companyId = custom.company_id;
  const plan = custom.plan;
  const subId = evento.data && evento.data.id;

  // ── subscription_created / subscription_payment_success → activar ─────────
  if (type === 'subscription_created' || type === 'subscription_payment_success') {
    let cid = companyId;
    if (!cid) cid = await getCompanyIdByExternalId(db, subId);
    if (!cid) return { ok: true, accion: 'sin_company' };
    await activarSuscripcion(db, cid, {
      plan,
      external_id: subId,
      source: 'lemonsqueezy',
      moneda: null,
      ciclo_fin: cicloFin30Dias(),
    });
    return { ok: true, accion: 'activada' };
  }

  // ── subscription_cancelled / subscription_expired → cancelada ─────────────
  if (type === 'subscription_cancelled' || type === 'subscription_expired') {
    const cid = companyId || await getCompanyIdByExternalId(db, subId);
    if (!cid) return { ok: true, accion: 'sin_company' };
    await db.query(
      `UPDATE subscriptions SET estado='cancelada', updated_at=now() WHERE company_id=$1`,
      [cid]);
    return { ok: true, accion: 'cancelada' };
  }

  // ── subscription_paused / subscription_payment_failed → morosa ────────────
  if (type === 'subscription_paused' || type === 'subscription_payment_failed') {
    const cid = companyId || await getCompanyIdByExternalId(db, subId);
    if (!cid) return { ok: true, accion: 'sin_company' };
    await db.query(
      `UPDATE subscriptions SET estado='morosa', updated_at=now() WHERE company_id=$1`,
      [cid]);
    return { ok: true, accion: 'morosa' };
  }

  return { ok: true, accion: 'ignorado', type };
}

module.exports = { procesarEventoLS };
