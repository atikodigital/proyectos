const { precioDe } = require('./planes');

// ── Base URL ─────────────────────────────────────────────────────────────────

function ppBase() {
  return process.env.PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

// ── Token cache ───────────────────────────────────────────────────────────────
// Stored as { token, expiresAt } where expiresAt is a Date.
let _tokenCache = null;

// ── getAccessToken ────────────────────────────────────────────────────────────
// Returns a valid Bearer token, using an in-memory cache.
// Optional fetchImpl for testing.
async function getAccessToken({ fetchImpl } = {}) {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret   = process.env.PAYPAL_SECRET;
  if (!clientId || !secret) {
    throw new Error('PAYPAL_CLIENT_ID / PAYPAL_SECRET no configurados');
  }

  // Return cached token if still valid (with 60s safety margin).
  const now = Date.now();
  if (_tokenCache && _tokenCache.expiresAt - 60_000 > now) {
    return _tokenCache.token;
  }

  const _fetch = fetchImpl || fetch;
  const creds  = Buffer.from(`${clientId}:${secret}`).toString('base64');

  const res = await _fetch(`${ppBase()}/v1/oauth2/token`, {
    method:  'POST',
    headers: {
      Authorization:  `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`PayPal OAuth ${res.status}: ${JSON.stringify(body)}`);
    err.status = res.status;
    throw err;
  }

  _tokenCache = {
    token:     body.access_token,
    expiresAt: now + (body.expires_in || 3600) * 1000,
  };
  return _tokenCache.token;
}

// ── Internal helper ───────────────────────────────────────────────────────────
async function ppFetch(path, { method = 'POST', body, fetchImpl } = {}) {
  const token = await getAccessToken({ fetchImpl });
  const _fetch = fetchImpl || fetch;

  const opts = {
    method,
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res  = await _fetch(`${ppBase()}${path}`, opts);

  // 204 No Content (e.g. cancel subscription) — no JSON body.
  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || JSON.stringify(data);
    const err = new Error(`PayPal ${res.status}: ${msg}`);
    err.status = res.status;
    err.body   = data;
    throw err;
  }
  return data;
}

// ── ensurePlanId ──────────────────────────────────────────────────────────────
// Returns the PayPal billing plan id for (plan, moneda).
// Looks up paypal_plans; if missing, creates product (stored in paypal_config)
// and creates plan, then persists both.
async function ensurePlanId(db, plan, moneda, { fetchImpl } = {}) {
  // 1. Check paypal_plans table.
  const existing = await db.query(
    `SELECT paypal_plan_id FROM paypal_plans WHERE plan=$1 AND moneda=$2`,
    [plan, moneda],
  );
  if (existing.rows[0]) return existing.rows[0].paypal_plan_id;

  // 2. Ensure product id (stored in paypal_config key='product_id').
  let productId;
  const cfgRow = await db.query(
    `SELECT value FROM paypal_config WHERE key='product_id'`,
  );
  if (cfgRow.rows[0]) {
    productId = cfgRow.rows[0].value;
  } else {
    const prod = await ppFetch('/v1/catalogs/products', {
      method: 'POST',
      body: { name: 'Hash IA', type: 'SERVICE', category: 'SOFTWARE' },
      fetchImpl,
    });
    productId = prod.id;
    await db.query(
      `INSERT INTO paypal_config(key, value) VALUES('product_id', $1)
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
      [productId],
    );
  }

  // 3. Create billing plan.
  const precio = precioDe(plan, moneda);
  if (precio == null) throw new Error(`Plan/moneda no soportado: ${plan}/${moneda}`);

  const planData = await ppFetch('/v1/billing/plans', {
    method: 'POST',
    body: {
      product_id: productId,
      name: `Hash IA ${plan} ${moneda}`,
      billing_cycles: [
        {
          frequency: { interval_unit: 'MONTH', interval_count: 1 },
          tenure_type:   'REGULAR',
          sequence:       1,
          total_cycles:   0,
          pricing_scheme: {
            fixed_price: { value: precio.toFixed(2), currency_code: moneda },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding:      true,
        setup_fee_failure_action:   'CONTINUE',
        payment_failure_threshold:  1,
      },
    },
    fetchImpl,
  });

  const planId = planData.id;
  await db.query(
    `INSERT INTO paypal_plans(plan, moneda, paypal_plan_id) VALUES($1, $2, $3)
     ON CONFLICT (plan, moneda) DO UPDATE SET paypal_plan_id=EXCLUDED.paypal_plan_id`,
    [plan, moneda, planId],
  );

  return planId;
}

// ── crearSuscripcionPaypal ────────────────────────────────────────────────────
// Returns { id, url } where url is the PayPal approval link.
async function crearSuscripcionPaypal({
  plan, moneda, payerEmail, returnUrl, cancelUrl, companyId, db, fetchImpl,
} = {}) {
  if (moneda === 'CLP') {
    throw new Error('PayPal no maneja CLP (usar MercadoPago)');
  }

  const planId = await ensurePlanId(db, plan, moneda, { fetchImpl });

  const sub = await ppFetch('/v1/billing/subscriptions', {
    method: 'POST',
    body: {
      plan_id:   planId,
      custom_id: JSON.stringify({ companyId, plan, moneda }),
      subscriber: { email_address: payerEmail },
      application_context: {
        brand_name:  'Hash IA',
        return_url:  returnUrl,
        cancel_url:  cancelUrl,
        user_action: 'SUBSCRIBE_NOW',
      },
    },
    fetchImpl,
  });

  const approveLink = (sub.links || []).find((l) => l.rel === 'approve');
  if (!approveLink) throw new Error('PayPal no devolvió link de aprobación');

  return { id: sub.id, url: approveLink.href };
}

// ── cancelarSuscripcionPaypal ─────────────────────────────────────────────────
async function cancelarSuscripcionPaypal(subId, { fetchImpl } = {}) {
  return ppFetch(`/v1/billing/subscriptions/${subId}/cancel`, {
    method: 'POST',
    body:   { reason: 'Cancelado por el usuario' },
    fetchImpl,
  });
}

// ── verificarWebhookPaypal ────────────────────────────────────────────────────
// Returns boolean.  rawBodyObj is the already-parsed webhook JSON body.
async function verificarWebhookPaypal(headers, rawBodyObj, { fetchImpl } = {}) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false; // fail-closed

  try {
    const result = await ppFetch('/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      body: {
        auth_algo:       headers['paypal-auth-algo'],
        cert_url:        headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig:headers['paypal-transmission-sig'],
        transmission_time:headers['paypal-transmission-time'],
        webhook_id:      webhookId,
        webhook_event:   rawBodyObj,
      },
      fetchImpl,
    });
    return (result && result.verification_status === 'SUCCESS');
  } catch {
    return false;
  }
}

// Reset token cache (for tests).
function _resetTokenCache() { _tokenCache = null; }

module.exports = {
  ppBase,
  getAccessToken,
  ensurePlanId,
  crearSuscripcionPaypal,
  cancelarSuscripcionPaypal,
  verificarWebhookPaypal,
  _resetTokenCache,
};
