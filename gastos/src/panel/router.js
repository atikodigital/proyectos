const express = require('express');
const { getUserByEmail } = require('../users/repo');
const { verifyPassword, hashPassword } = require('../auth/password');
const { signToken } = require('../auth/jwt');
const { requireAuth, requireKind } = require('../auth/middleware');
const { listExpenses } = require('../expenses/query');
const { markExpensePaid } = require('../expenses/repo');
const { buildExpensesWorkbook } = require('./excel');
const {
  createEmployee, listEmployees, updateEmployee, deactivateEmployee, getCompany, updateCompany, getCompanyWa,
} = require('../companies/repo');
const { cashflowSummary } = require('../expenses/summary');
const { formatCashflowSummary } = require('../whatsapp/format');
const realWaClient = require('../whatsapp/client');

function parseFiltros(q = {}) {
  return {
    from: q.from, to: q.to, periodo: q.periodo, empleadoId: q.empleadoId, categoria: q.categoria,
    estado: q.estado, estadoPago: q.estadoPago, tipo: q.tipo, tipoDocumento: q.tipoDocumento, proveedor: q.proveedor,
  };
}

function createPanelRouter({ db, sendText } = {}) {
  const _sendText = sendText || realWaClient.sendText;
  const router = express.Router();

  router.post('/login', async (req, res) => {
    const { email, password } = req.body || {};
    const user = await getUserByEmail(db, email);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'credenciales' });
    }
    const token = signToken({ kind: 'user', companyId: user.company_id, userId: user.id, rol: user.rol });
    return res.json({ token, user: { id: user.id, email: user.email, rol: user.rol } });
  });

  router.use(requireAuth, requireKind('user'));

  router.get('/expenses', async (req, res) => {
    const rows = await listExpenses(db, req.auth.companyId, parseFiltros(req.query));
    return res.json(rows);
  });

  router.get('/expenses.xlsx', async (req, res) => {
    const rows = await listExpenses(db, req.auth.companyId, parseFiltros(req.query));
    const buf = await buildExpensesWorkbook(rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="gastos.xlsx"');
    return res.send(buf);
  });

  router.patch('/expenses/:id/pagar', async (req, res) => {
    const upd = await markExpensePaid(db, req.auth.companyId, req.params.id);
    if (!upd) return res.status(404).json({ error: 'no_existe' });
    return res.json(upd);
  });

  router.post('/whatsapp/resumen', async (req, res) => {
    const wa = await getCompanyWa(db, req.auth.companyId);
    if (!wa || !wa.wa_phone_number_id || !wa.wa_token || !wa.owner_whatsapp) {
      return res.status(400).json({ error: 'whatsapp_no_configurado' });
    }
    let year; let month;
    const m = /^(\d{4})-(\d{2})$/.exec((req.body && req.body.periodo) || '');
    if (m) { year = Number(m[1]); month = Number(m[2]); }
    else { const d = new Date(); year = d.getFullYear(); month = d.getMonth() + 1; }
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const s = await cashflowSummary(db, req.auth.companyId, { year, month });
    const body = formatCashflowSummary({ ...s, periodo: `${meses[month - 1]} ${year}` });
    try {
      await _sendText({ to: wa.owner_whatsapp, body, token: wa.wa_token, phoneNumberId: wa.wa_phone_number_id });
    } catch (e) {
      return res.status(502).json({ error: 'envio_whatsapp', detalle: e.message });
    }
    return res.json({ ok: true, to: wa.owner_whatsapp });
  });

  router.get('/employees', async (req, res) => {
    return res.json(await listEmployees(db, req.auth.companyId));
  });

  router.post('/employees', async (req, res) => {
    const { nombre, phone, usuario, password, rol } = req.body || {};
    if (!nombre) return res.status(400).json({ error: 'falta_nombre' });
    const password_hash = password ? await hashPassword(password) : null;
    const emp = await createEmployee(db, { company_id: req.auth.companyId, nombre, phone, usuario, password_hash, rol });
    const { password_hash: _omit, ...safe } = emp;
    return res.status(201).json(safe);
  });

  router.patch('/employees/:id', async (req, res) => {
    const upd = await updateEmployee(db, req.auth.companyId, req.params.id, req.body || {});
    if (!upd) return res.status(404).json({ error: 'no_existe' });
    return res.json(upd);
  });

  router.delete('/employees/:id', async (req, res) => {
    const out = await deactivateEmployee(db, req.auth.companyId, req.params.id);
    if (!out) return res.status(404).json({ error: 'no_existe' });
    return res.json({ ok: true });
  });

  router.get('/company', async (req, res) => {
    return res.json(await getCompany(db, req.auth.companyId));
  });

  router.patch('/company', async (req, res) => {
    return res.json(await updateCompany(db, req.auth.companyId, req.body || {}));
  });

  return router;
}

module.exports = { createPanelRouter };
