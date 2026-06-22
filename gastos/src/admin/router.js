// Admin de Hash IA (Atiko/agencia): login propio + gestión de clientes.
const express = require('express');
const { signToken } = require('../auth/jwt');
const { requireAuth, requireKind } = require('../auth/middleware');
const { verifyTotp, randomBase32, otpauthUrl } = require('../auth/totp');
const adminRepo = require('./repo');
const adminsRepo = require('./admins-repo');

function createAdminRouter({ db } = {}) {
  const router = express.Router();

  router.post('/login', async (req, res) => {
    const b = req.body || {};
    const ident = String(b.email || b.usuario || '').trim();
    const code = b.totp;
    // 1) Bootstrap: admin "root" por variables de entorno (no se puede borrar → evita lockout).
    const u = (process.env.GASTOS_ADMIN_USER || 'atiko').toLowerCase();
    const p = process.env.GASTOS_ADMIN_PASSWORD;
    if (p && ident.toLowerCase() === u && b.password === p) {
      const totpSecret = process.env.GASTOS_ADMIN_TOTP_SECRET;
      if (totpSecret && !verifyTotp(totpSecret, code)) return res.status(401).json({ error: 'totp_invalido' });
      return res.json({ token: signToken({ kind: 'admin', root: true, email: u }), admin: { email: u, root: true } });
    }
    // 2) Admin individual de la tabla (login por email + su propio 2FA).
    const a = await adminsRepo.verifyAdminPassword(db, ident, b.password || '');
    if (a) {
      if (a.totp_secret && !verifyTotp(a.totp_secret, code)) return res.status(401).json({ error: 'totp_invalido' });
      return res.json({
        token: signToken({ kind: 'admin', adminId: a.id, email: a.email }),
        admin: { id: a.id, email: a.email, nombre: a.nombre, tiene_2fa: !!a.totp_secret },
      });
    }
    // 3) Nada coincide.
    if (!p) return res.status(503).json({ error: 'admin_no_configurado' });
    return res.status(401).json({ error: 'credenciales' });
  });

  router.use(requireAuth, requireKind('admin'));

  router.get('/clientes', async (req, res) => {
    const d = new Date();
    const archivadas = String(req.query.archivadas || '') === '1';
    return res.json(await adminRepo.listClientesConStats(db, d.getFullYear(), d.getMonth() + 1, { archivadas }));
  });

  // Archivar (soft delete) o restaurar una empresa. {archivada:true|false}
  router.post('/clientes/:id/archivar', async (req, res) => {
    const out = await adminRepo.archivarCliente(db, req.params.id, !!(req.body || {}).archivada);
    if (!out) return res.status(404).json({ error: 'no_existe' });
    return res.json(out);
  });

  router.post('/clientes', async (req, res) => {
    const b = req.body || {};
    if (!b.nombreEmpresa) return res.status(400).json({ error: 'falta_nombre' });
    return res.status(201).json(await adminRepo.crearCliente(db, b));
  });

  router.patch('/clientes/:id/plan', async (req, res) => {
    const r = await adminRepo.setCompanyPlan(db, req.params.id, (req.body || {}).plan);
    if (!r) return res.status(404).json({ error: 'no_existe' });
    return res.json(r);
  });

  router.post('/clientes/:id/login', async (req, res) => {
    const b = req.body || {};
    if (!b.usuario || !b.password) return res.status(400).json({ error: 'falta_usuario_clave' });
    return res.status(201).json(await adminRepo.crearLogin(db, req.params.id, b.usuario, b.password, b.nombre));
  });

  router.patch('/clientes/:id/kaly-persona', async (req, res) => {
    const { setKalyPersona } = require('../companies/repo');
    const r = await setKalyPersona(db, req.params.id, req.body || {});
    if (!r) return res.status(404).json({ error: 'no_existe' });
    return res.json({ ok: true, kaly_persona: r.kaly_persona });
  });

  router.patch('/clientes/:id/productos', async (req, res) => {
    const r = await adminRepo.setProductos(db, req.params.id, req.body || {});
    if (!r) return res.status(404).json({ error: 'no_existe' });
    return res.json(r);
  });

  router.get('/clientes/:id', async (req, res) => {
    const d = new Date();
    const f = await adminRepo.getFichaCliente(db, req.params.id, d.getFullYear(), d.getMonth() + 1);
    if (!f) return res.status(404).json({ error: 'no_existe' });
    return res.json(f);
  });

  // ── Gestión de admins individuales (cualquier admin autenticado) ──────
  router.get('/admins', async (req, res) => res.json({ admins: await adminsRepo.listAdmins(db) }));

  router.post('/admins', async (req, res) => {
    const b = req.body || {};
    if (!b.email || !b.password || String(b.password).length < 8) {
      return res.status(400).json({ error: 'email_y_password_min8' });
    }
    if (await adminsRepo.getAdminByEmail(db, b.email)) return res.status(409).json({ error: 'ya_existe' });
    return res.status(201).json(await adminsRepo.createAdmin(db, { email: b.email, password: b.password, nombre: b.nombre }));
  });

  router.patch('/admins/:id/activo', async (req, res) => {
    const out = await adminsRepo.setActivo(db, req.params.id, !!(req.body || {}).activo);
    if (!out) return res.status(404).json({ error: 'no_existe' });
    return res.json(out);
  });

  // ── 2FA self-service (solo admins de la tabla; el root usa env) ──────
  router.post('/2fa/setup', (req, res) => {
    if (!req.auth.adminId) return res.status(400).json({ error: '2fa_root_por_env' });
    const secret = randomBase32(20);
    return res.json({ secret, otpauth: otpauthUrl(secret, { account: req.auth.email || 'admin' }) });
  });

  router.post('/2fa/activar', async (req, res) => {
    if (!req.auth.adminId) return res.status(400).json({ error: '2fa_root_por_env' });
    const b = req.body || {};
    if (!verifyTotp(b.secret, b.code)) return res.status(400).json({ error: 'codigo_invalido' });
    await adminsRepo.setTotp(db, req.auth.adminId, b.secret);
    return res.json({ ok: true, tiene_2fa: true });
  });

  router.post('/2fa/desactivar', async (req, res) => {
    if (!req.auth.adminId) return res.status(400).json({ error: '2fa_root_por_env' });
    await adminsRepo.setTotp(db, req.auth.adminId, null);
    return res.json({ ok: true, tiene_2fa: false });
  });

  return router;
}

module.exports = { createAdminRouter };
