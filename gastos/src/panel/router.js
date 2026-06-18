const express = require('express');
const { getUserByEmail } = require('../users/repo');
const { verifyPassword, hashPassword } = require('../auth/password');
const { signToken } = require('../auth/jwt');
const { requireAuth, requireKind } = require('../auth/middleware');
const { listExpenses } = require('../expenses/query');
const { markExpensePaid, getExpense, updateExpense, annulExpense } = require('../expenses/repo');
const { readImage, contentTypeFor } = require('../expenses/storage');
const { buildExpensesWorkbook } = require('./excel');
const xc = require('./excel-contabilidad');
const {
  createEmployee, listEmployees, updateEmployee, deactivateEmployee, getCompany, updateCompany, getCompanyWa,
} = require('../companies/repo');
const { cashflowSummary } = require('../expenses/summary');
const { formatCashflowSummary } = require('../whatsapp/format');
const realWaClient = require('../whatsapp/client');
const { registerCatalogRoutes } = require('../catalog/routes');
const pedidosRepo = require('../pedidos/repo');
const contaReportes = require('../contabilidad/reportes');
const { REGIONES_COMUNAS } = require('../pedidos/comunas-chile');
const matchRepo = require('../match/repo');
const auxRepo = require('../auxiliares/repo');
const auxReportes = require('../auxiliares/reportes');
const { sembrarPorRubro } = require('../auxiliares/semilla');
const { getGiro, setGiro } = require('../companies/repo');
const contaCuentas = require('../contabilidad/cuentas');
const { crearAsientoManual, anularAsientoManual } = require('../contabilidad/manual');
const { responder } = require('../varas/chat');
const { geminiChat } = require('../varas/gemini');
const { ejecutarAccion } = require('../varas/acciones');
const { TOOLS_READ } = require('../varas/tools');

function parseFiltros(q = {}) {
  return {
    from: q.from, to: q.to, periodo: q.periodo, empleadoId: q.empleadoId, categoria: q.categoria,
    estado: q.estado, estadoPago: q.estadoPago, tipo: q.tipo, tipoDocumento: q.tipoDocumento, proveedor: q.proveedor,
  };
}

function createPanelRouter({ db, sendText, varasGemini } = {}) {
  const _sendText = sendText || realWaClient.sendText;
  const _varasGemini = varasGemini || geminiChat;
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

  router.get('/comunas', (req, res) => res.json(REGIONES_COMUNAS));

  router.get('/contabilidad/diario', async (req, res) => {
    res.json({ asientos: await contaReportes.libroDiario(db, req.auth.companyId, req.query) });
  });
  router.get('/contabilidad/mayor', async (req, res) => {
    res.json({ cuentas: await contaReportes.libroMayor(db, req.auth.companyId, req.query) });
  });
  router.get('/contabilidad/balance', async (req, res) => {
    res.json(await contaReportes.balanceComprobacion(db, req.auth.companyId, req.query));
  });
  router.get('/contabilidad/flujo', async (req, res) => {
    res.json(await contaReportes.flujoCaja(db, req.auth.companyId, req.query));
  });

  async function _sendXlsx(res, wb, nombre) {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    await wb.xlsx.write(res);
    res.end();
  }
  router.get('/contabilidad/diario.xlsx', async (req, res) => {
    const asientos = await contaReportes.libroDiario(db, req.auth.companyId, req.query);
    await _sendXlsx(res, await xc.buildDiarioWorkbook(asientos), 'libro-diario.xlsx');
  });
  router.get('/contabilidad/mayor.xlsx', async (req, res) => {
    await _sendXlsx(res, await xc.buildMayorWorkbook(await contaReportes.libroMayor(db, req.auth.companyId, req.query)), 'libro-mayor.xlsx');
  });
  router.get('/contabilidad/balance.xlsx', async (req, res) => {
    await _sendXlsx(res, await xc.buildBalanceWorkbook(await contaReportes.balanceComprobacion(db, req.auth.companyId, req.query)), 'balance.xlsx');
  });
  router.get('/contabilidad/flujo.xlsx', async (req, res) => {
    await _sendXlsx(res, await xc.buildFlujoWorkbook(await contaReportes.flujoCaja(db, req.auth.companyId, req.query)), 'flujo-caja.xlsx');
  });

  router.get('/contabilidad/conciliacion', async (req, res) => {
    const tipo = req.query.tipo === 'sii' ? 'sii' : 'bancaria';
    const u = await matchRepo.getUltima(db, req.auth.companyId, tipo);
    if (!u) return res.json({ conciliacion: null });
    res.json(u);
  });

  registerCatalogRoutes(router, { db });

  router.get('/pedido-config', async (req, res) => {
    return res.json(await pedidosRepo.getPedidoConfig(db, req.auth.companyId));
  });
  router.patch('/pedido-config', async (req, res) => {
    return res.json(await pedidosRepo.setPedidoConfig(db, req.auth.companyId, req.body || {}));
  });

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

  router.patch('/expenses/:id', async (req, res) => {
    const exp = await getExpense(db, req.params.id);
    if (!exp || exp.company_id !== req.auth.companyId) return res.status(404).json({ error: 'no_existe' });
    return res.json(await updateExpense(db, req.params.id, req.body || {}));
  });

  router.post('/expenses/:id/anular', async (req, res) => {
    const out = await annulExpense(db, req.auth.companyId, req.params.id);
    if (!out) return res.status(404).json({ error: 'no_existe' });
    return res.json(out);
  });

  router.get('/expenses/:id/foto', async (req, res) => {
    const exp = await getExpense(db, req.params.id);
    if (!exp || exp.company_id !== req.auth.companyId) return res.status(404).json({ error: 'no_existe' });
    const buf = readImage(exp.foto_path);
    if (!buf) return res.status(404).json({ error: 'sin_foto' });
    res.setHeader('Content-Type', contentTypeFor(exp.foto_path));
    return res.send(buf);
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

  router.get('/auxiliares', async (req, res) => res.json({ auxiliares: await auxRepo.listAuxiliares(db, req.auth.companyId) }));
  router.post('/auxiliares/sembrar', async (req, res) => {
    const giro = (req.body && req.body.giro) || (await getGiro(db, req.auth.companyId));
    const n = await sembrarPorRubro(db, req.auth.companyId, giro);
    res.json({ creados: n });
  });
  router.post('/auxiliares', async (req, res) => {
    const b = req.body || {};
    if (!b.nombre) return res.status(400).json({ error: 'nombre_requerido' });
    const a = await auxRepo.createAuxiliar(db, req.auth.companyId, { ...b, estado: 'confirmado' });
    res.status(201).json(a);
  });
  router.patch('/auxiliares/:id', async (req, res) => {
    const a = await auxRepo.updateAuxiliar(db, req.auth.companyId, req.params.id, req.body || {});
    if (!a) return res.status(404).json({ error: 'no_existe' });
    res.json({ auxiliar: a });
  });
  router.post('/auxiliares/:id/desactivar', async (req, res) => {
    const a = await auxRepo.setActivo(db, req.auth.companyId, req.params.id, false);
    if (!a) return res.status(404).json({ error: 'no_existe' });
    res.json({ ok: true });
  });
  router.post('/auxiliares/:id/merge', async (req, res) => {
    const a = await auxRepo.mergeAuxiliar(db, req.auth.companyId, req.params.id, (req.body || {}).hacia);
    if (!a) return res.status(400).json({ error: 'merge_invalido' });
    res.json({ auxiliar: a });
  });
  router.get('/auxiliares/:id/consumo', async (req, res) => {
    res.json(await auxReportes.consumoAuxiliar(db, req.auth.companyId, req.params.id, req.query));
  });
  router.get('/giro', async (req, res) => res.json({ giro: await getGiro(db, req.auth.companyId) }));
  router.patch('/giro', async (req, res) => { await setGiro(db, req.auth.companyId, (req.body || {}).giro); res.json({ ok: true }); });

  // ── Asientos manuales VARAS ──
  router.get('/cuentas', async (req, res) => res.json({ cuentas: await contaCuentas.listCuentas(db, req.auth.companyId) }));
  router.post('/asientos/manual', async (req, res) => {
    try { res.status(201).json({ asiento: await crearAsientoManual(db, req.auth.companyId, req.body || {}) }); }
    catch (e) { res.status(400).json({ error: e.code || 'invalido' }); }
  });
  router.post('/asientos/:id/anular', async (req, res) => {
    const a = await anularAsientoManual(db, req.auth.companyId, req.params.id);
    if (!a) return res.status(404).json({ error: 'no_existe' });
    res.json({ ok: true });
  });

  // ── VARAS chat IA ──
  router.post('/varas/chat', async (req, res) => {
    const messages = (req.body && req.body.messages) || [];
    res.json(await responder(db, req.auth.companyId, messages, { gemini: _varasGemini }));
  });
  router.post('/varas/accion', async (req, res) => {
    const b = req.body || {};
    res.json(await ejecutarAccion(db, req.auth.companyId, b.tipo, b.args || {}, { sendText: _sendText }));
  });
  // Lectura server-side para la voz (Gemini Live): ejecuta una tool de lectura scoped por empresa.
  router.post('/varas/tool', async (req, res) => {
    const { name, args } = req.body || {};
    const fn = TOOLS_READ[name];
    if (!fn) return res.status(400).json({ error: 'tool_no_permitida' });
    try {
      const data = await fn(db, req.auth.companyId, args || {});
      res.json({ data });
    } catch (e) {
      res.status(500).json({ error: 'fallo_tool' });
    }
  });

  return router;
}

module.exports = { createPanelRouter };
