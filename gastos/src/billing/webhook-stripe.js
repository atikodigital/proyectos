const { activarSuscripcion } = require('./repo');

function cicloFin30Dias() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

async function getCompanyIdByExternalId(db, externalId) {
  const r = await db.query(
    `SELECT company_id FROM subscriptions WHERE external_id=$1`, [externalId]);
  return r.rows[0] ? r.rows[0].company_id : null;
}

// Procesa un evento Stripe y actualiza el estado de la suscripción.
// El evento ya viene parseado (JSON.parse del raw body).
async function procesarEventoStripe(db, evento) {
  const { type } = evento;
  const obj = (evento.data && evento.data.object) || {};

  // ── checkout.session.completed → activar ──────────────────────────────────
  if (type === 'checkout.session.completed') {
    const companyId = obj.metadata && obj.metadata.company_id;
    const plan      = obj.metadata && obj.metadata.plan;
    const moneda    = obj.metadata && obj.metadata.moneda;
    if (!companyId) return { ok: true, accion: 'sin_company' };
    await activarSuscripcion(db, companyId, {
      plan,
      external_id: obj.subscription,   // guarda el sub id (no el session id)
      source: 'stripe',
      moneda,
      ciclo_fin: cicloFin30Dias(),
    });
    return { ok: true, accion: 'activada' };
  }

  // ── invoice.paid → renovar ciclo ─────────────────────────────────────────
  if (type === 'invoice.paid') {
    const metaCompanyId = obj.subscription_details
      && obj.subscription_details.metadata
      && obj.subscription_details.metadata.company_id;
    const companyId = metaCompanyId
      || await getCompanyIdByExternalId(db, obj.subscription);
    if (!companyId) return { ok: true, accion: 'sin_company' };
    await db.query(
      `UPDATE subscriptions SET ciclo_fin=$2, ciclo_inicio=now(), creditos_usados=0, updated_at=now()
        WHERE company_id=$1`,
      [companyId, cicloFin30Dias()]);
    return { ok: true, accion: 'renovada' };
  }

  // ── customer.subscription.deleted → cancelar ─────────────────────────────
  if (type === 'customer.subscription.deleted') {
    const companyId = (obj.metadata && obj.metadata.company_id)
      || await getCompanyIdByExternalId(db, obj.id);
    if (!companyId) return { ok: true, accion: 'sin_company' };
    await db.query(
      `UPDATE subscriptions SET estado='cancelada', updated_at=now() WHERE company_id=$1`,
      [companyId]);
    return { ok: true, accion: 'cancelada' };
  }

  // ── customer.subscription.updated → morosa / cancelada / ignorada ─────────
  if (type === 'customer.subscription.updated') {
    const status = obj.status;
    if (status === 'canceled') {
      const companyId = (obj.metadata && obj.metadata.company_id)
        || await getCompanyIdByExternalId(db, obj.id);
      if (!companyId) return { ok: true, accion: 'sin_company' };
      await db.query(
        `UPDATE subscriptions SET estado='cancelada', updated_at=now() WHERE company_id=$1`,
        [companyId]);
      return { ok: true, accion: 'cancelada' };
    }
    if (status === 'past_due' || status === 'unpaid') {
      const companyId = (obj.metadata && obj.metadata.company_id)
        || await getCompanyIdByExternalId(db, obj.id);
      if (!companyId) return { ok: true, accion: 'sin_company' };
      await db.query(
        `UPDATE subscriptions SET estado='morosa', updated_at=now() WHERE company_id=$1`,
        [companyId]);
      return { ok: true, accion: 'morosa' };
    }
    return { ok: true, accion: 'ignorado', type };
  }

  return { ok: true, accion: 'ignorado', type };
}

module.exports = { procesarEventoStripe, getCompanyIdByExternalId };
