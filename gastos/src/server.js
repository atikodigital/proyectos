require('dotenv').config();
require('express-async-errors');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const express = require('express');
const { createRateLimiter } = require('./middleware/rate-limit');
const { createWebhookRouter } = require('./whatsapp/webhook');
const { validarFirmaMP, procesarEventoMP } = require('./billing/webhook-mp');
const { verificarFirmaStripe } = require('./billing/stripe');
const { procesarEventoStripe } = require('./billing/webhook-stripe');
const { verificarWebhookPaypal } = require('./billing/paypal');
const { procesarEventoPaypal } = require('./billing/webhook-paypal');
const { createAppRouter } = require('./app/router');
const { createPanelRouter } = require('./panel/router');
const { createAdminRouter } = require('./admin/router');
const { createOnboardingRouter } = require('./onboarding/router');
const { createDataDeletionRouter } = require('./legal/data-deletion');
const http = require('http');
const { getPool } = require('./db/pool');
const { createEphemeralToken } = require('./agent/token');
const { attachKalyProxy } = require('./agent/kaly-proxy');

const app = express();
// Cabeceras de seguridad (HSTS, nosniff, anti-clickjacking, etc.). Desactivamos las
// políticas que romperían el panel (CSP con CDNs/inline) y la carga cross-origin de la
// APK/landing (COEP/CORP).
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: false }));
app.use(cors());
// Capturar body raw como Buffer para verificación HMAC de webhooks Meta.
app.use(express.json({
  limit: '15mb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({
  extended: false,
  verify: (req, _res, buf) => { if (!req.rawBody) req.rawBody = buf; },
}));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'atiko-gastos' });
});

// Token efímero PÚBLICO para la landing hash.atikodigital.cl (KALY por voz).
// El navegador nunca ve GEMINI_API_KEY; el token es corto (uses:1). Rate-limit por IP.
const _kalyHits = new Map();
app.get('/api/public/kaly-token', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now(); const win = 10 * 60 * 1000; const max = 20;
  const arr = (_kalyHits.get(ip) || []).filter((t) => now - t < win);
  arr.push(now); _kalyHits.set(ip, arr);
  if (arr.length > max) return res.status(429).json({ error: 'rate_limited' });
  try {
    const tok = await createEphemeralToken({ apiKey: process.env.GEMINI_API_KEY });
    return res.json(tok);
  } catch (e) { console.error('[kaly-token]', e.message); return res.status(502).json({ error: 'token_falla' }); }
});

// Rate limiting anti-fuerza-bruta / DoS en los endpoints sensibles (login + registro).
// Por IP, ventana deslizante en memoria. Suficiente para reintentos legítimos, corta abuso.
const loginLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 12 });
const registerLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 6 });
app.use(['/api/panel/login', '/api/app/login', '/api/admin/login'], loginLimiter);
app.use(['/api/onboarding/register', '/api/onboarding/oauth/google', '/api/onboarding/oauth/google-redirect', '/api/onboarding/oauth/facebook', '/api/onboarding/oauth/facebook-callback'], registerLimiter);
// Recuperación de contraseña: límite estricto por IP (3 intentos/hora) para evitar abuso.
const forgotLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 3 });
app.use(['/api/onboarding/forgot-password', '/api/onboarding/reset-password'], forgotLimiter);

app.use('/api/whatsapp/webhook', createWebhookRouter({ db: getPool() }));

// Webhook público de Mercado Pago: valida firma HMAC antes de procesar.
app.post('/api/pagos/mp/webhook', async (req, res) => {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[mp-webhook] MP_WEBHOOK_SECRET no configurado — rechazado (fail-closed)');
    return res.status(503).json({ error: 'webhook_no_configurado' });
  }
  {
    const dataId = (req.body && req.body.data && req.body.data.id) || '';
    if (!validarFirmaMP(req.headers, dataId, secret)) {
      console.warn('[mp-webhook] firma inválida');
      return res.status(400).json({ error: 'firma_invalida' });
    }
  }
  const { type, data } = req.body || {};
  const preapprovalId = (data && data.id) || null;
  try {
    const db = getPool();
    let companyId = null, plan = null;
    if (preapprovalId) {
      const r = await db.query(
        `SELECT company_id, plan FROM subscriptions WHERE external_id=$1`, [preapprovalId]);
      if (r.rows[0]) { companyId = r.rows[0].company_id; plan = r.rows[0].plan; }
    }
    const result = await procesarEventoMP(db, { type, preapprovalId, plan, companyId });
    console.log('[mp-webhook] evento', type, '→', result.accion || result.razon);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[mp-webhook] error:', e.message);
    return res.status(500).json({ error: 'webhook_error' });
  }
});
// Webhook público de Stripe: raw body para verificar firma HMAC-SHA256.
// express.json() global ya capturó el rawBody via verify callback → lo reutilizamos.
// El payload parseado está en req.body; el Buffer crudo en req.rawBody.
app.post('/api/pagos/stripe/webhook', async (req, res) => {
  try {
    // req.rawBody capturado por el verify callback de express.json() global.
    const rawBuf = req.rawBody;
    const rawStr = rawBuf ? rawBuf.toString('utf8') : JSON.stringify(req.body || {});
    const sig = req.headers['stripe-signature'];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      console.warn('[stripe-webhook] STRIPE_WEBHOOK_SECRET no configurado — rechazado (fail-closed)');
      return res.status(503).json({ error: 'webhook_no_configurado' });
    }
    if (!verificarFirmaStripe(rawStr, sig, secret)) {
      console.warn('[stripe-webhook] firma inválida');
      return res.status(400).json({ error: 'firma_invalida' });
    }
    const evento = req.body && req.body.type ? req.body : JSON.parse(rawStr);
    const db = getPool();
    const r = await procesarEventoStripe(db, evento);
    console.log('[stripe-webhook] evento', evento.type, '→', r.accion || r.razon);
    return res.json(r);
  } catch (e) {
    console.error('[stripe-webhook]', e.message);
    return res.status(200).json({ ok: false });
  }
});
// Webhook público de PayPal: verifica firma via API PayPal antes de procesar.
// Raw body ya capturado por el verify callback de express.json() global.
app.post('/api/pagos/paypal/webhook', async (req, res) => {
  try {
    if (!process.env.PAYPAL_WEBHOOK_ID) {
      console.warn('[paypal-webhook] PAYPAL_WEBHOOK_ID no configurado — rechazado (fail-closed)');
      return res.status(503).json({ error: 'webhook_no_configurado' });
    }
    const rawBuf = req.rawBody;
    const evento = req.body && req.body.event_type
      ? req.body
      : JSON.parse(rawBuf ? rawBuf.toString('utf8') : '{}');
    const ok = await verificarWebhookPaypal(req.headers, evento);
    if (!ok) {
      console.warn('[paypal-webhook] firma inválida');
      return res.status(400).json({ error: 'firma_invalida' });
    }
    const db = getPool();
    const r = await procesarEventoPaypal(db, evento);
    console.log('[paypal-webhook] evento', evento.event_type, '→', r.accion || r.razon);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[paypal-webhook]', e.message);
    return res.status(200).json({ ok: false });
  }
});
app.use('/api/app', createAppRouter({ db: getPool() }));
app.use('/api/panel', createPanelRouter({ db: getPool() }));
app.use('/api/admin', createAdminRouter({ db: getPool() }));
app.use('/api/onboarding', createOnboardingRouter({ db: getPool() }));
app.use('/api/data-deletion', createDataDeletionRouter({ db: getPool() }));
app.use('/panel', express.static(path.join(__dirname, '..', 'public', 'panel'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[gastos] error:', err && err.message);
  res.status(500).json({ error: 'server_error' });
});

if (require.main === module) {
  const port = process.env.PORT || 3100;
  const server = http.createServer(app);
  // Proxy WS público de KALY para la landing: el navegador conecta a /api/public/kaly-ws
  // y el backend reenvía a Gemini Live con la API key (que nunca sale al cliente).
  if (process.env.GEMINI_API_KEY) {
    attachKalyProxy(server, { apiKey: process.env.GEMINI_API_KEY });
    console.log('[kaly] proxy WS público en /api/public/kaly-ws');
  }
  server.listen(port, () => console.log(`atiko-gastos en :${port}`));
}

module.exports = { app };
