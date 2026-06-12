const express = require('express');
const { getEmployeeByUsuario, getAgentPrefs, setAgentPrefs, getCompanyWa } = require('../companies/repo');
const { verifyPassword } = require('../auth/password');
const { signToken } = require('../auth/jwt');
const { requireAuth, requireKind } = require('../auth/middleware');
const { intakeFromImage } = require('../expenses/intake');
const { getExpense, confirmExpense, updateExpense, rejectExpense, annulExpense, markExpensePaid } = require('../expenses/repo');
const realExtract = require('../ocr/extract');
const { readImage, contentTypeFor } = require('../expenses/storage');
const { buildAgentContext } = require('../agent/context');
const { cashflowSummary } = require('../expenses/summary');
const { formatCashflowSummary } = require('../whatsapp/format');

function createAppRouter({ db, extractExpense, createLiveToken, sendText } = {}) {
  const _extract = extractExpense || realExtract.extractExpense;
  const _liveToken = createLiveToken || (() => require('../agent/token').createEphemeralToken({ apiKey: process.env.GEMINI_API_KEY }));
  const _sendText = sendText || require('../whatsapp/client').sendText;
  const router = express.Router();

  router.post('/login', async (req, res) => {
    const { usuario, password } = req.body || {};
    const emp = await getEmployeeByUsuario(db, usuario);
    if (!emp || !(await verifyPassword(password, emp.password_hash))) {
      return res.status(401).json({ error: 'credenciales' });
    }
    const token = signToken({ kind: 'employee', companyId: emp.company_id, employeeId: emp.id });
    return res.json({ token, employee: { id: emp.id, nombre: emp.nombre } });
  });

  router.use(requireAuth, requireKind('employee'));

  router.patch('/agent/prefs', async (req, res) => {
    const prefs = await setAgentPrefs(db, req.auth.employeeId, req.body || {});
    return res.json({ agent_prefs: prefs });
  });

  router.post('/agent/session', async (req, res) => {
    let tok;
    if (process.env.KALY_TOKEN_MODE === 'key') {
      // Modo directo: entrega la API key real SOLO a empleados autenticados (fallback
      // mientras el WS no acepte tokens efimeros como key).
      tok = { token: process.env.GEMINI_API_KEY, expireAt: null, model: process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-09-2025' };
    } else {
      try { tok = await _liveToken(); }
      catch (e) { return res.status(503).json({ error: 'live_no_disponible', detalle: e.message }); }
    }
    const context = await buildAgentContext(db, { companyId: req.auth.companyId, employeeId: req.auth.employeeId });
    console.log('[kaly] token live emitido para empleado', req.auth.employeeId);
    return res.json({ ...tok, context });
  });

  router.post('/agent/resumen-whatsapp', async (req, res) => {
    const wa = await getCompanyWa(db, req.auth.companyId);
    if (!wa || !wa.wa_phone_number_id || !wa.wa_token || !wa.owner_whatsapp) {
      return res.status(400).json({ error: 'whatsapp_no_configurado' });
    }
    const d = new Date();
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const s = await cashflowSummary(db, req.auth.companyId, { year: d.getFullYear(), month: d.getMonth() + 1 });
    const body = formatCashflowSummary({ ...s, periodo: `${meses[d.getMonth()]} ${d.getFullYear()}` });
    try { await _sendText({ to: wa.owner_whatsapp, body, token: wa.wa_token, phoneNumberId: wa.wa_phone_number_id }); }
    catch (e) { return res.status(502).json({ error: 'envio_whatsapp', detalle: e.message }); }
    return res.json({ ok: true, to: wa.owner_whatsapp });
  });

  async function ownedExpense(req, res) {
    const exp = await getExpense(db, req.params.id);
    if (!exp || exp.company_id !== req.auth.companyId) { res.status(404).json({ error: 'no_existe' }); return null; }
    return exp;
  }

  router.post('/expenses', async (req, res) => {
    const { imageBase64, mimeType, override } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'falta_imagen' });
    const { expense, duplicado, documento } = await intakeFromImage({
      db, companyId: req.auth.companyId, employeeId: req.auth.employeeId,
      imageBuffer: Buffer.from(imageBase64, 'base64'), mimeType: mimeType || 'image/jpeg',
      canal: 'app', extract: _extract, override: !!override,
    });
    if (documento) return res.status(202).json({ documento, match: 'pendiente' });
    if (!expense) return res.status(409).json({ error: 'duplicado', duplicado });
    return res.status(201).json({ ...expense, duplicado: duplicado || null });
  });

  router.post('/expenses/:id/confirm', async (req, res) => {
    if (!(await ownedExpense(req, res))) return;
    return res.json(await confirmExpense(db, req.params.id));
  });

  router.patch('/expenses/:id/pagar', async (req, res) => {
    if (!(await ownedExpense(req, res))) return;
    return res.json(await markExpensePaid(db, req.auth.companyId, req.params.id));
  });

  router.patch('/expenses/:id', async (req, res) => {
    if (!(await ownedExpense(req, res))) return;
    return res.json(await updateExpense(db, req.params.id, req.body || {}));
  });

  router.post('/expenses/:id/reject', async (req, res) => {
    if (!(await ownedExpense(req, res))) return;
    return res.json(await rejectExpense(db, req.params.id));
  });

  router.post('/expenses/:id/anular', async (req, res) => {
    if (!(await ownedExpense(req, res))) return;
    return res.json(await annulExpense(db, req.auth.companyId, req.params.id));
  });

  router.get('/expenses/:id/foto', async (req, res) => {
    const exp = await ownedExpense(req, res);
    if (!exp) return;
    const buf = readImage(exp.foto_path);
    if (!buf) return res.status(404).json({ error: 'sin_foto' });
    res.setHeader('Content-Type', contentTypeFor(exp.foto_path));
    return res.send(buf);
  });

  router.get('/expenses', async (req, res) => {
    const r = await db.query(
      `SELECT * FROM expenses WHERE company_id=$1 AND employee_id=$2 AND estado <> 'anulado' ORDER BY created_at DESC LIMIT 50`,
      [req.auth.companyId, req.auth.employeeId]
    );
    return res.json(r.rows);
  });

  return router;
}

module.exports = { createAppRouter };
