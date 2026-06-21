/**
 * Onboarding BSP de Hash IA — clientes terceros se registran solos y conectan su WhatsApp.
 *
 *   POST /api/onboarding/register             → crea company + user owner, devuelve JWT
 *   POST /api/onboarding/connect/whatsapp     → guarda wa_phone_number_id + wa_token en su company
 *   POST /api/onboarding/connect/facebook     → idem para Messenger/Instagram (futuro multi-canal)
 *   GET  /api/onboarding/oauth/callback       → público; recibe ?code & ?state de Meta y redirige al app
 *   GET  /api/onboarding/bsp-status           → reporta si APP_SECRET + config_id están configurados
 */
const express = require('express');
const mc = require('./meta-connect');
const { createCompany, getCompany, updateCompany } = require('../companies/repo');
const { createUser, getUserByEmail } = require('../users/repo');
const { hashPassword } = require('../auth/password');
const { signToken, verifyToken } = require('../auth/jwt');

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  try {
    if (!token) return res.status(401).json({ error: 'No autenticado' });
    req.user = verifyToken(token);
    if (!req.user || !req.user.companyId) return res.status(401).json({ error: 'Token inválido' });
    next();
  } catch (e) { res.status(401).json({ error: 'Token inválido' }); }
}

function createOnboardingRouter({ db }) {
  const router = express.Router();

  // ── PÚBLICO: OAuth callback de Meta ───────────────────────────────
  router.get('/oauth/callback', (req, res) => {
    const { code, state, error, error_description } = req.query || {};
    const front = process.env.HASH_APP_URL || 'https://matiko.atikodigital.cl';
    if (error) return res.redirect(`${front}/?oauth_error=${encodeURIComponent(error_description || error)}`);
    if (!code) return res.redirect(`${front}/?oauth_error=missing_code`);
    const qs = new URLSearchParams({ oauth_code: String(code), oauth_state: String(state || '') }).toString();
    return res.redirect(`${front}/?${qs}`);
  });

  // ── PÚBLICO: registro de clientes terceros ────────────────────────
  // Crea company + user (rol=owner) en una transacción simple.
  router.post('/register', async (req, res) => {
    try {
      const { nombre_negocio, nombre_owner, email, password, owner_whatsapp } = req.body || {};
      if (!nombre_negocio || !email || !password) {
        return res.status(400).json({ error: 'nombre_negocio, email y password son obligatorios' });
      }
      if (String(password).length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
      }
      const emailNorm = String(email).trim().toLowerCase();
      const existing = await getUserByEmail(db, emailNorm);
      if (existing) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });

      const company = await createCompany(db, {
        nombre: String(nombre_negocio).trim().slice(0, 120),
        owner_nombre: nombre_owner ? String(nombre_owner).trim().slice(0, 80) : null,
        owner_whatsapp: owner_whatsapp ? String(owner_whatsapp).replace(/[^+\d]/g, '').slice(0, 20) : null,
        resumen_frecuencia: 'mensual',
      });
      const passwordHash = await hashPassword(password);
      const user = await createUser(db, {
        company_id: company.id, email: emailNorm, password_hash: passwordHash, rol: 'owner',
      });
      const token = signToken({ kind: 'user', companyId: company.id, userId: user.id, rol: 'owner' });
      res.json({
        ok: true,
        token,
        user: { id: user.id, email: user.email, rol: user.rol, companyId: company.id },
        company: { id: company.id, nombre: company.nombre },
      });
    } catch (e) {
      console.error('[onboarding/register]', e.message);
      res.status(500).json({ error: 'No se pudo crear la cuenta' });
    }
  });

  // ── PRIVADO: el owner conecta su WhatsApp (Embedded Signup) ───────
  router.post('/connect/whatsapp', requireAuth, async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.code || !b.phone_number_id) {
        return res.status(400).json({ error: 'Faltan code o phone_number_id' });
      }
      const token = await mc.exchangeCode(b.code);
      if (b.waba_id) { try { await mc.subscribeWaba(b.waba_id, token); } catch (e) { /* sigue */ } }
      if (b.register) await mc.registerPhone(b.phone_number_id, token, b.pin);
      let info = null;
      try { info = await mc.getPhoneInfo(b.phone_number_id, token); } catch (e) {}
      // Guardar en companies: wa_phone_number_id + wa_token (los del cliente)
      await db.query(
        'UPDATE companies SET wa_phone_number_id=$1, wa_token=$2 WHERE id=$3',
        [b.phone_number_id, token, req.user.companyId]
      );
      res.json({
        ok: true,
        channel: 'whatsapp',
        phone_number_id: b.phone_number_id,
        info,
      });
    } catch (e) {
      console.error('[onboarding/connect/whatsapp]', e.message);
      res.status(e.status || 500).json({ error: e.message || 'Error conectando WhatsApp' });
    }
  });

  // ── PRIVADO: conectar Facebook/Instagram (multi-canal, futuro) ────
  router.post('/connect/facebook', requireAuth, async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.userToken && !b.code) return res.status(400).json({ error: 'Falta code o userToken' });
      let token = b.userToken;
      if (b.code) token = await mc.exchangeCode(b.code);
      const longTok = await mc.longLivedToken(token).catch(() => token);
      const pages = await mc.listPages(longTok);
      // Por simplicidad: guardamos la primera página y su IG vinculado en company.canales jsonb
      const canales = pages.map((p) => ({
        page_id: p.id, page_name: p.name, page_token: p.access_token,
        instagram_id: p.instagram_business_account && p.instagram_business_account.id,
      }));
      for (const p of pages) {
        try { await mc.subscribePage(p.id, p.access_token); } catch (e) { /* sigue */ }
      }
      await db.query(
        `UPDATE companies SET canales=COALESCE(canales,'{}'::jsonb) || $1::jsonb WHERE id=$2`,
        [JSON.stringify({ meta: canales }), req.user.companyId]
      ).catch(async (e) => {
        // Si no existe la columna canales aún, la creamos en caliente
        await db.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS canales jsonb");
        await db.query(
          `UPDATE companies SET canales=COALESCE(canales,'{}'::jsonb) || $1::jsonb WHERE id=$2`,
          [JSON.stringify({ meta: canales }), req.user.companyId]
        );
      });
      res.json({ ok: true, conectadas: canales });
    } catch (e) {
      console.error('[onboarding/connect/facebook]', e.message);
      res.status(e.status || 500).json({ error: e.message || 'Error conectando Facebook/Instagram' });
    }
  });

  // ── PRIVADO: status BSP (el frontend lo consulta antes de abrir Embedded Signup) ──
  router.get('/bsp-status', requireAuth, async (req, res) => {
    try {
      let connected_whatsapp = false;
      try {
        const r = await db.query('SELECT wa_phone_number_id FROM companies WHERE id=$1', [req.user.companyId]);
        connected_whatsapp = !!(r.rows[0] && r.rows[0].wa_phone_number_id);
      } catch (e) {}
      res.json({
        app_id: process.env.META_APP_ID || process.env.FB_APP_ID || null,
        app_secret_configured: !!(process.env.META_APP_SECRET || process.env.FB_APP_SECRET),
        embedded_signup_config_id: process.env.META_WA_ES_CONFIG_ID || null,
        graph_version: process.env.META_GRAPH_VERSION || 'v20.0',
        front_url: process.env.HASH_APP_URL || 'https://matiko.atikodigital.cl',
        connected_whatsapp,
      });
    } catch (e) { res.status(500).json({ error: 'Error obteniendo status BSP' }); }
  });

  return router;
}

module.exports = { createOnboardingRouter };
