const crypto = require('crypto');
const { activarSuscripcion, getSubscription } = require('./repo');

// Valida la firma HMAC-SHA256 de MP.
// x-signature: ts=<ts>,v1=<hash>
// x-request-id: <uuid>
// dataId: data.id del payload
function validarFirmaMP(headers, dataId, secret) {
  const sig = headers['x-signature'] || '';
  const reqId = headers['x-request-id'] || '';
  const tsMatch = sig.match(/ts=([^,]+)/);
  const v1Match = sig.match(/v1=([^,]+)/);
  if (!tsMatch || !v1Match) return false;
  const ts = tsMatch[1];
  const v1 = v1Match[1];
  const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  if (expected.length !== v1.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}

function cicloFin30Dias() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

async function companyByExternalId(db, externalId) {
  const r = await db.query(
    `SELECT company_id FROM subscriptions WHERE external_id=$1`, [externalId]);
  return r.rows[0] ? r.rows[0].company_id : null;
}

// Procesa un evento MP. opts: { type, preapprovalId, plan, companyId }
async function procesarEventoMP(db, { type, preapprovalId, plan, companyId, status }) {
  if (type === 'subscription_authorized_payment' || type === 'authorized') {
    if (!companyId || !plan) return { ok: false, razon: 'datos_incompletos' };
    await activarSuscripcion(db, companyId, {
      plan, external_id: preapprovalId, source: 'mp', ciclo_fin: cicloFin30Dias(),
    });
    return { ok: true, accion: 'activada' };
  }

  // MP notifica la suscripción con 'subscription_preapproval'. Cuando su estado es
  // 'authorized', el usuario ya autorizó el pago recurrente → activamos el plan.
  if (type === 'subscription_preapproval') {
    if (status === 'authorized') {
      if (!companyId || !plan || plan === 'free') return { ok: false, razon: 'datos_incompletos' };
      await activarSuscripcion(db, companyId, {
        plan, external_id: preapprovalId, source: 'mp', ciclo_fin: cicloFin30Dias(),
      });
      return { ok: true, accion: 'activada' };
    }
    if (status === 'cancelled') {
      const cid = companyId || await companyByExternalId(db, preapprovalId);
      if (cid) await db.query(`UPDATE subscriptions SET estado='cancelada', updated_at=now() WHERE company_id=$1`, [cid]);
      return { ok: true, accion: 'cancelada' };
    }
    return { ok: true, accion: 'ignorado_status', status };
  }

  if (type === 'payment' || type === 'subscription_payment') {
    const cid = companyId || await companyByExternalId(db, preapprovalId);
    if (!cid) return { ok: false, razon: 'empresa_no_encontrada' };
    await db.query(
      `UPDATE subscriptions SET ciclo_fin=$2, ciclo_inicio=now(), creditos_usados=0, updated_at=now()
        WHERE company_id=$1`,
      [cid, cicloFin30Dias()]);
    return { ok: true, accion: 'renovada' };
  }

  if (type === 'subscription_paused' || type === 'paused') {
    const cid = companyId || await companyByExternalId(db, preapprovalId);
    if (!cid) return { ok: false, razon: 'empresa_no_encontrada' };
    await db.query(
      `UPDATE subscriptions SET estado='morosa', updated_at=now() WHERE company_id=$1`, [cid]);
    return { ok: true, accion: 'morosa' };
  }

  if (type === 'subscription_cancelled' || type === 'cancelled') {
    const cid = companyId || await companyByExternalId(db, preapprovalId);
    if (!cid) return { ok: false, razon: 'empresa_no_encontrada' };
    await db.query(
      `UPDATE subscriptions SET estado='cancelada', updated_at=now() WHERE company_id=$1`, [cid]);
    return { ok: true, accion: 'cancelada' };
  }

  return { ok: true, accion: 'ignorado', type };
}

module.exports = { validarFirmaMP, procesarEventoMP };
