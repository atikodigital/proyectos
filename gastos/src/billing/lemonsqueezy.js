const crypto = require('crypto');

// ── Base URL ─────────────────────────────────────────────────────────────────

function lsBase() {
  return 'https://api.lemonsqueezy.com';
}

// ── Headers ──────────────────────────────────────────────────────────────────

function lsHeaders() {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  if (!apiKey) throw new Error('LEMONSQUEEZY_API_KEY no configurado');
  return {
    Accept:         'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json',
    Authorization:  `Bearer ${apiKey}`,
  };
}

// ── getVariantId ─────────────────────────────────────────────────────────────
// Returns the Lemon Squeezy variant id configured for `plan`, or null.
async function getVariantId(db, plan) {
  const r = await db.query(
    `SELECT variant_id FROM lemonsqueezy_variants WHERE plan=$1`, [plan]);
  return r.rows[0] ? r.rows[0].variant_id : null;
}

// ── crearCheckoutLS ──────────────────────────────────────────────────────────
// Returns { id, url } where url is the Lemon Squeezy checkout URL.
async function crearCheckoutLS({
  plan, moneda, payerEmail, redirectUrl, companyId, db, fetchImpl,
} = {}) {
  const variantId = await getVariantId(db, plan);
  if (!variantId) throw new Error('variante_no_configurada');

  const storeId = process.env.LEMONSQUEEZY_STORE_ID;

  const _fetch = fetchImpl || fetch;
  const res = await _fetch(`${lsBase()}/v1/checkouts`, {
    method:  'POST',
    headers: lsHeaders(),
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email:  payerEmail,
            custom: { company_id: companyId, plan },
          },
          product_options: {
            redirect_url: redirectUrl,
          },
        },
        relationships: {
          store:   { data: { type: 'stores',   id: String(storeId) } },
          variant: { data: { type: 'variants', id: String(variantId) } },
        },
      },
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body && body.errors) ? JSON.stringify(body.errors) : JSON.stringify(body);
    const err = new Error(`LemonSqueezy ${res.status}: ${msg}`);
    err.status = res.status;
    err.body   = body;
    throw err;
  }

  return { id: body.data.id, url: body.data.attributes.url };
}

// ── verificarFirmaLS ─────────────────────────────────────────────────────────
// rawBody: string (raw webhook body). signatureHeader: value of X-Signature.
// Returns boolean. Fail-closed if LEMONSQUEEZY_WEBHOOK_SECRET missing.
function verificarFirmaLS(rawBody, signatureHeader) {
  try {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (!secret) return false;
    if (!signatureHeader) return false;

    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    if (expected.length !== signatureHeader.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

module.exports = { lsBase, lsHeaders, getVariantId, crearCheckoutLS, verificarFirmaLS };
