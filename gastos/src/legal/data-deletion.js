/**
 * Data Deletion endpoints — cumple requisito Meta Platforms.
 *   POST /api/data-deletion          → callback automático Meta (signed_request)
 *   POST /api/data-deletion/request  → formulario público de eliminación
 *   GET  /api/data-deletion/status/:code → verificar estado
 *
 * Spec: https://developers.facebook.com/docs/development/maintaining-your-app/data-deletion-callback
 */
const express = require('express');
const crypto = require('crypto');

function createDataDeletionRouter({ db }) {
  const router = express.Router();
  const PUBLIC_BASE = process.env.HASH_PUBLIC_URL || 'https://hash.atikodigital.cl';

  async function ensureTable() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS data_deletion_requests (
        id              SERIAL PRIMARY KEY,
        confirmation_code TEXT UNIQUE NOT NULL,
        source          TEXT NOT NULL,
        meta_user_id    TEXT,
        contact         TEXT,
        full_name       TEXT,
        channel         TEXT,
        business_name   TEXT,
        reason          TEXT,
        status          TEXT NOT NULL DEFAULT 'pending',
        raw_payload     JSONB,
        requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        completed_at    TIMESTAMPTZ
      )
    `);
  }

  router.post('/', express.urlencoded({ extended: false }), async (req, res) => {
    try {
      await ensureTable();
      const signed = req.body.signed_request || (req.rawBody && parseSignedFromRaw(req.rawBody.toString()));
      if (!signed) return res.status(400).json({ error: 'Missing signed_request' });
      const secret = process.env.META_APP_SECRET || process.env.FB_APP_SECRET;
      if (!secret) return res.status(500).json({ error: 'Server config error' });
      const decoded = decodeSignedRequest(signed, secret);
      if (!decoded) return res.status(400).json({ error: 'Invalid signature' });
      const userId = decoded.user_id || (decoded.user && decoded.user.id) || null;
      const code = genCode();
      await db.query(
        `INSERT INTO data_deletion_requests (confirmation_code, source, meta_user_id, raw_payload, status)
         VALUES ($1, 'meta-signed', $2, $3, 'pending')`,
        [code, userId, decoded]
      );
      res.json({ url: `${PUBLIC_BASE}/data-deletion?id=${code}`, confirmation_code: code });
    } catch (e) {
      console.error('[hash/data-deletion meta]', e.message);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.post('/request', express.json(), async (req, res) => {
    try {
      await ensureTable();
      const b = req.body || {};
      if (!b.fullName || !b.contact) return res.status(400).json({ error: 'fullName y contact son obligatorios' });
      const code = genCode();
      await db.query(
        `INSERT INTO data_deletion_requests
          (confirmation_code, source, contact, full_name, channel, business_name, reason, raw_payload, status)
         VALUES ($1, 'public-form', $2, $3, $4, $5, $6, $7, 'pending')`,
        [code, b.contact, b.fullName, b.channel || null, b.businessName || null, b.reason || null, b]
      );
      res.json({ ok: true, confirmation_code: code });
    } catch (e) {
      console.error('[hash/data-deletion form]', e.message);
      res.status(500).json({ error: 'No se pudo registrar la solicitud' });
    }
  });

  router.get('/status/:code', async (req, res) => {
    try {
      await ensureTable();
      const r = await db.query(
        `SELECT confirmation_code, status, requested_at, completed_at
           FROM data_deletion_requests WHERE confirmation_code = $1 LIMIT 1`,
        [req.params.code]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Código no encontrado' });
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Internal error' }); }
  });

  return router;
}

// ── Helpers ────────────────────────────────────────────────────
function genCode() { return 'DEL-' + crypto.randomBytes(8).toString('hex').toUpperCase(); }
function base64urlDecode(str) {
  const pad = 4 - (str.length % 4 || 4);
  const b64 = (str + (pad < 4 ? '='.repeat(pad) : '')).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64');
}
function decodeSignedRequest(signed, secret) {
  const [sigB64, payloadB64] = String(signed).split('.');
  if (!sigB64 || !payloadB64) return null;
  const expected = crypto.createHmac('sha256', secret).update(payloadB64).digest();
  const got = base64urlDecode(sigB64);
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;
  try { return JSON.parse(base64urlDecode(payloadB64).toString('utf8')); } catch { return null; }
}
function parseSignedFromRaw(raw) {
  const m = String(raw).match(/(?:^|&)signed_request=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

module.exports = { createDataDeletionRouter };
