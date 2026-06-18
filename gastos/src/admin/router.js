// Admin de Hash IA (Atiko/agencia): login propio + gestión de clientes.
const express = require('express');
const { signToken } = require('../auth/jwt');
const { requireAuth, requireKind } = require('../auth/middleware');
const adminRepo = require('./repo');

function createAdminRouter({ db } = {}) {
  const router = express.Router();

  router.post('/login', (req, res) => {
    const { usuario, password } = req.body || {};
    const u = (process.env.GASTOS_ADMIN_USER || 'atiko').toLowerCase();
    const p = process.env.GASTOS_ADMIN_PASSWORD;
    if (!p) return res.status(503).json({ error: 'admin_no_configurado' });
    if (String(usuario || '').trim().toLowerCase() !== u || password !== p) {
      return res.status(401).json({ error: 'credenciales' });
    }
    return res.json({ token: signToken({ kind: 'admin' }) });
  });

  router.use(requireAuth, requireKind('admin'));

  router.get('/clientes', async (req, res) => {
    const d = new Date();
    return res.json(await adminRepo.listClientesConStats(db, d.getFullYear(), d.getMonth() + 1));
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

  return router;
}

module.exports = { createAdminRouter };
