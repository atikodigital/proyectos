const express = require('express');
const { getEmployeeByUsuario } = require('../companies/repo');
const { verifyPassword } = require('../auth/password');
const { signToken } = require('../auth/jwt');
const { requireAuth, requireKind } = require('../auth/middleware');
const { intakeFromImage } = require('../expenses/intake');
const { getExpense, confirmExpense, updateExpense, rejectExpense, annulExpense } = require('../expenses/repo');
const realExtract = require('../ocr/extract');
const { readImage, contentTypeFor } = require('../expenses/storage');

function createAppRouter({ db, extractExpense } = {}) {
  const _extract = extractExpense || realExtract.extractExpense;
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

  async function ownedExpense(req, res) {
    const exp = await getExpense(db, req.params.id);
    if (!exp || exp.company_id !== req.auth.companyId) { res.status(404).json({ error: 'no_existe' }); return null; }
    return exp;
  }

  router.post('/expenses', async (req, res) => {
    const { imageBase64, mimeType, override } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'falta_imagen' });
    const { expense, duplicado } = await intakeFromImage({
      db, companyId: req.auth.companyId, employeeId: req.auth.employeeId,
      imageBuffer: Buffer.from(imageBase64, 'base64'), mimeType: mimeType || 'image/jpeg',
      canal: 'app', extract: _extract, override: !!override,
    });
    if (!expense) return res.status(409).json({ error: 'duplicado', duplicado });
    return res.status(201).json({ ...expense, duplicado: duplicado || null });
  });

  router.post('/expenses/:id/confirm', async (req, res) => {
    if (!(await ownedExpense(req, res))) return;
    return res.json(await confirmExpense(db, req.params.id));
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
