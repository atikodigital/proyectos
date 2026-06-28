const crypto = require('crypto');
const { precioDe, PLAN_LABELS } = require('./planes');

const STRIPE_API = 'https://api.stripe.com';

// ── Helper interno ──────────────────────────────────────────────────────────

async function stripeFetch(path, { method = 'POST', form } = {}) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY no configurado');

  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
  if (form) opts.body = form.toString();

  const res = await fetch(`${STRIPE_API}${path}`, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || JSON.stringify(body);
    const err = new Error(`Stripe ${res.status}: ${msg}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

// ── crearCheckoutSuscripcion ────────────────────────────────────────────────
// plan: 'basico'|'pyme'|'empresa'
// moneda: 'USD'|'EUR'  (CLP → usar MercadoPago)
// companyId: opcional — se embebe en metadata para que el webhook mapee la empresa
// Returns: { id, url }
async function crearCheckoutSuscripcion({ plan, moneda, payerEmail, successUrl, cancelUrl, companyId }) {
  if (moneda === 'CLP') {
    throw new Error('Stripe no maneja CLP (usar MercadoPago)');
  }

  const monto = precioDe(plan, moneda);
  if (!monto) throw new Error(`Plan/moneda no pagable: ${plan}/${moneda}`);

  const nombre = PLAN_LABELS[plan] || plan;

  const form = new URLSearchParams();
  form.set('mode', 'subscription');
  form.set('customer_email', payerEmail);
  form.set('success_url', successUrl);
  form.set('cancel_url', cancelUrl);
  form.set('line_items[0][quantity]', '1');
  form.set('line_items[0][price_data][currency]', moneda.toLowerCase());
  form.set('line_items[0][price_data][unit_amount]', String(monto * 100));
  form.set('line_items[0][price_data][recurring][interval]', 'month');
  form.set('line_items[0][price_data][product_data][name]', nombre);

  // Metadata en el session (disponible en checkout.session.completed).
  if (companyId) form.set('metadata[company_id]', String(companyId));
  form.set('metadata[plan]', plan);
  form.set('metadata[moneda]', moneda);

  // Metadata en la suscripción (disponible en renewal/cancel events sobre el Subscription).
  if (companyId) form.set('subscription_data[metadata][company_id]', String(companyId));
  form.set('subscription_data[metadata][plan]', plan);
  form.set('subscription_data[metadata][moneda]', moneda);

  const r = await stripeFetch('/v1/checkout/sessions', { method: 'POST', form });
  return { id: r.id, url: r.url };
}

// ── cancelarSuscripcion ─────────────────────────────────────────────────────
async function cancelarSuscripcion(subId) {
  return stripeFetch(`/v1/subscriptions/${subId}`, { method: 'DELETE' });
}

// ── verificarFirmaStripe ────────────────────────────────────────────────────
// rawBody: string (el body crudo del webhook, antes de parsear)
// sigHeader: string del header Stripe-Signature  (t=...,v1=...)
// secret: webhook signing secret (whsec_...)
// Returns: boolean
function verificarFirmaStripe(rawBody, sigHeader, secret) {
  try {
    if (!sigHeader) return false;

    // Parse comma-separated k=v pairs
    const parts = {};
    for (const segment of sigHeader.split(',')) {
      const idx = segment.indexOf('=');
      if (idx === -1) continue;
      const k = segment.slice(0, idx);
      const v = segment.slice(idx + 1);
      parts[k] = v;
    }

    const t = parts['t'];
    const v1 = parts['v1'];
    if (!t || !v1) return false;

    const signed = `${t}.${rawBody}`;
    const expected = crypto.createHmac('sha256', secret).update(signed).digest('hex');

    if (expected.length !== v1.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch {
    return false;
  }
}

module.exports = { crearCheckoutSuscripcion, cancelarSuscripcion, verificarFirmaStripe };
