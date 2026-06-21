/**
 * HMAC-SHA256 verification de webhooks Meta.
 * Spec: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verify-signature
 * Meta firma el body raw con META_APP_SECRET → header X-Hub-Signature-256: sha256=<hex>
 */
const crypto = require('crypto');

function verify(req) {
  const secret = process.env.META_APP_SECRET || process.env.FB_APP_SECRET;
  if (!secret) {
    // Modo permisivo solo en dev (cuando no hay secret configurado)
    console.warn('[wa-signature] META_APP_SECRET no configurado — saltando verificación');
    return process.env.NODE_ENV !== 'production';
  }
  const header = req.headers['x-hub-signature-256'];
  if (!header || typeof header !== 'string' || !header.startsWith('sha256=')) {
    return false;
  }
  const expectedHex = header.slice('sha256='.length);
  const raw = req.rawBody;
  if (!raw) return false;
  const computed = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  let a, b;
  try { a = Buffer.from(expectedHex, 'hex'); b = Buffer.from(computed, 'hex'); }
  catch { return false; }
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { verify };
