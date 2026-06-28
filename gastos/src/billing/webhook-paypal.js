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

// Parses custom_id JSON string → { companyId, plan, moneda } or null.
function parseCustom(customId) {
  try {
    const obj = JSON.parse(customId || '{}');
    return obj.companyId ? obj : null;
  } catch {
    return null;
  }
}

// Processes a parsed PayPal webhook event { event_type, resource }.
async function procesarEventoPaypal(db, evento) {
  const { event_type, resource = {} } = evento;

  // ── BILLING.SUBSCRIPTION.ACTIVATED → activar ─────────────────────────────
  if (event_type === 'BILLING.SUBSCRIPTION.ACTIVATED') {
    const parsed = parseCustom(resource.custom_id);
    if (!parsed) return { ok: true, accion: 'sin_company' };
    const { companyId, plan, moneda } = parsed;
    await activarSuscripcion(db, companyId, {
      plan,
      external_id: resource.id,
      source: 'paypal',
      moneda,
      ciclo_fin: cicloFin30Dias(),
    });
    return { ok: true, accion: 'activada' };
  }

  // ── PAYMENT.SALE.COMPLETED → renovar ciclo ────────────────────────────────
  if (event_type === 'PAYMENT.SALE.COMPLETED') {
    // custom field may be in resource.custom (string JSON) or look up by billing_agreement_id.
    const parsed = parseCustom(resource.custom);
    const companyId = (parsed && parsed.companyId)
      || await getCompanyIdByExternalId(db, resource.billing_agreement_id);
    if (!companyId) return { ok: true, accion: 'sin_company' };
    await db.query(
      `UPDATE subscriptions SET ciclo_fin=$2, ciclo_inicio=now(), creditos_usados=0, updated_at=now()
        WHERE company_id=$1`,
      [companyId, cicloFin30Dias()]);
    return { ok: true, accion: 'renovada' };
  }

  // ── BILLING.SUBSCRIPTION.CANCELLED / EXPIRED → cancelada ─────────────────
  if (event_type === 'BILLING.SUBSCRIPTION.CANCELLED'
      || event_type === 'BILLING.SUBSCRIPTION.EXPIRED') {
    const parsed = parseCustom(resource.custom_id);
    const companyId = (parsed && parsed.companyId)
      || await getCompanyIdByExternalId(db, resource.id);
    if (!companyId) return { ok: true, accion: 'sin_company' };
    await db.query(
      `UPDATE subscriptions SET estado='cancelada', updated_at=now() WHERE company_id=$1`,
      [companyId]);
    return { ok: true, accion: 'cancelada' };
  }

  // ── BILLING.SUBSCRIPTION.SUSPENDED → morosa ──────────────────────────────
  if (event_type === 'BILLING.SUBSCRIPTION.SUSPENDED') {
    const parsed = parseCustom(resource.custom_id);
    const companyId = (parsed && parsed.companyId)
      || await getCompanyIdByExternalId(db, resource.id);
    if (!companyId) return { ok: true, accion: 'sin_company' };
    await db.query(
      `UPDATE subscriptions SET estado='morosa', updated_at=now() WHERE company_id=$1`,
      [companyId]);
    return { ok: true, accion: 'morosa' };
  }

  return { ok: true, accion: 'ignorado', type: event_type };
}

module.exports = { procesarEventoPaypal, getCompanyIdByExternalId };
