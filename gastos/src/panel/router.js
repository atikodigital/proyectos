const express = require('express');
const { getUserByEmail, getUserById, setUserPassword } = require('../users/repo');
const { verifyPassword, hashPassword } = require('../auth/password');
const { signToken } = require('../auth/jwt');
const { requireAuth, requireKind } = require('../auth/middleware');
const chatRepo = require('../chat/repo');
const contactosRepo = require('../chat/contactos-repo');
const { fichaDerivada, telefonoDeContacto } = require('../chat/ficha');
const { listExpenses } = require('../expenses/query');
const { markExpensePaid, getExpense, updateExpense, annulExpense, createExpense } = require('../expenses/repo');
const { intakeFromImage } = require('../expenses/intake');
const { getLineas } = require('../expenses/lineas-repo');
const { readImage, contentTypeFor } = require('../expenses/storage');
const { buildExpensesWorkbook } = require('./excel');
const xc = require('./excel-contabilidad');
const {
  createEmployee, listEmployees, updateEmployee, deactivateEmployee, getCompany, updateCompany, getCompanyWa,
  getOwnerAgentPrefs, setOwnerAgentPrefs,
} = require('../companies/repo');
const memoryRepo = require('../agent/memory');
const { cashflowSummary } = require('../expenses/summary');
const { formatCashflowSummary } = require('../whatsapp/format');
const realWaClient = require('../whatsapp/client');
const { registerCatalogRoutes } = require('../catalog/routes');
const catalogRepo = require('../catalog/repo');
const pedidosRepo = require('../pedidos/repo');
const { buildPedidoPdf } = require('../pedidos/pdf');
const contaReportes = require('../contabilidad/reportes');
const { REGIONES_COMUNAS } = require('../pedidos/comunas-chile');
const matchRepo = require('../match/repo');
const auxRepo = require('../auxiliares/repo');
const auxReportes = require('../auxiliares/reportes');
const { sembrarPorRubro } = require('../auxiliares/semilla');
const { getGiro, setGiro } = require('../companies/repo');
const { aplicarContabilidad } = require('../contabilidad/contabilizar');
const contaCuentas = require('../contabilidad/cuentas');
const { crearAsientoManual, anularAsientoManual } = require('../contabilidad/manual');
const { responder } = require('../varas/chat');
const { geminiChat } = require('../varas/gemini');
const { ejecutarAccion } = require('../varas/acciones');
const { TOOLS_READ } = require('../varas/tools');
const { buildAgentContext } = require('../agent/context');
const { createEphemeralToken } = require('../agent/token');
const { suggestOrder } = require('../pedidos/suggest');
const { saldo: saldoCreditos, consumirCredito, SinCreditosError } = require('../billing/creditos');
const { createPreapproval } = require('../billing/mp');
const { crearSuscripcionPaypal } = require('../billing/paypal');
const { procesadorPara, monedasSoportadas } = require('../billing/planes');

function parseFiltros(q = {}) {
  return {
    from: q.from, to: q.to, periodo: q.periodo, empleadoId: q.empleadoId, categoria: q.categoria,
    estado: q.estado, estadoPago: q.estadoPago, tipo: q.tipo, tipoDocumento: q.tipoDocumento, proveedor: q.proveedor,
  };
}

function createPanelRouter({ db, sendText, sendImage, varasGemini } = {}) {
  const _sendText = sendText || realWaClient.sendText;
  const _sendImage = sendImage || realWaClient.sendImage;
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

  router.get('/suscripcion', async (req, res) => {
    try { res.json(await saldoCreditos(db, req.auth.companyId)); }
    catch (e) { res.status(500).json({ error: 'saldo_error' }); }
  });

  router.post('/suscripcion/crear', async (req, res) => {
    const { plan, moneda = 'CLP' } = req.body || {};
    if (!plan || !['basico', 'pyme', 'empresa'].includes(plan)) {
      return res.status(400).json({ error: 'plan_invalido' });
    }
    if (!monedasSoportadas().includes(moneda)) {
      return res.status(400).json({ error: 'moneda_invalida' });
    }
    const sub = await saldoCreditos(db, req.auth.companyId);
    if (sub.plan === 'ilimitado') return res.status(409).json({ error: 'plan_especial' });
    if (sub.estado === 'activa' && sub.plan === plan) return res.status(409).json({ error: 'ya_activa' });
    const owner = await getUserById(db, req.auth.userId);
    if (!owner || !owner.email) return res.status(400).json({ error: 'email_requerido' });
    const proc = procesadorPara(moneda);
    try {
      const base = process.env.PANEL_BASE_URL || 'https://gastos.atikodigital.cl';
      let id, url;
      if (proc === 'mp') {
        const backUrl = `${base}/panel/#plan`;
        const result = await createPreapproval(plan, backUrl, owner.email);
        id = result.id;
        url = result.init_point;
      } else {
        const result = await crearSuscripcionPaypal({
          plan, moneda, payerEmail: owner.email,
          returnUrl: `${base}/panel/#plan`,
          cancelUrl: `${base}/panel/#plan`,
          companyId: req.auth.companyId,
          db,
        });
        id = result.id;
        url = result.url;
      }
      await db.query(
        `UPDATE subscriptions SET external_id=$2, procesador=$3, moneda=$4, updated_at=now() WHERE company_id=$1`,
        [req.auth.companyId, id, proc, moneda]);
      console.log(`[billing] ${proc} checkout`, id, 'empresa', req.auth.companyId, 'plan', plan, 'moneda', moneda);
      return res.json({ url });
    } catch (e) {
      console.error('[billing] error checkout:', e.message);
      const msg = String(e.message || '');
      if (/Payer and collector cannot be the same/i.test(msg)) {
        return res.status(409).json({
          error: 'payer_es_colector',
          mensaje: 'No puedes suscribirte con el mismo correo que recibe los pagos (la cuenta de cobro). Inicia sesión con otro correo.',
        });
      }
      if (proc === 'mp') {
        return res.status(502).json({
          error: 'pago_error',
          mensaje: 'MercadoPago no pudo procesar este correo. Si ya tienes una cuenta MercadoPago, intenta con otro correo.',
        });
      }
      return res.status(502).json({ error: 'pago_error', mensaje: 'No pudimos iniciar el pago. Intenta de nuevo en un momento.' });
    }
  });

  router.get('/chat/contacto', async (req, res) => {
    const { channel, contact } = req.query;
    const msgs = await chatRepo.listMensajes(db, req.auth.companyId, channel, contact);
    const ficha = fichaDerivada(msgs);
    const editable = await contactosRepo.getContacto(db, req.auth.companyId, channel, contact);
    return res.json({ ...ficha, email: editable.email || null, ubicacion: editable.ubicacion || null, notas: editable.notas || null });
  });

  router.patch('/chat/contacto', async (req, res) => {
    const { channel, contact, email, ubicacion, notas } = req.body || {};
    const out = await contactosRepo.upsertContacto(db, req.auth.companyId, channel, contact, { email, ubicacion, notas });
    return res.json(out);
  });

  // Cambiar la propia contraseña del panel (requiere la clave actual). El usuario
  // elige la nueva en el navegador; el backend nunca la guarda en claro.
  router.post('/cambiar-clave', async (req, res) => {
    const { actual, nueva } = req.body || {};
    if (!nueva || String(nueva).length < 8) return res.status(400).json({ error: 'clave_min8' });
    const user = await getUserById(db, req.auth.userId);
    if (!user || !(await verifyPassword(String(actual || ''), user.password_hash))) {
      return res.status(401).json({ error: 'clave_actual_incorrecta' });
    }
    await setUserPassword(db, req.auth.userId, await hashPassword(String(nueva)));
    return res.json({ ok: true });
  });

  router.get('/chat/conversaciones', async (req, res) => {
    return res.json(await chatRepo.listConversaciones(db, req.auth.companyId));
  });

  router.get('/chat/conversacion', async (req, res) => {
    return res.json(await chatRepo.listMensajes(db, req.auth.companyId, req.query.channel, req.query.contact));
  });

  router.post('/overlay/pedido/suggest', async (req, res) => {
    try {
      const { channel, contact, conversation } = req.body || {};
      let convo = String(conversation || '').trim();
      if (!convo) {
        const msgs = await chatRepo.listMensajes(db, req.auth.companyId, channel, contact);
        convo = msgs.map((m) => `${m.contact || contact}: ${m.text}`).join('\n');
      }
      if (!convo) return res.status(400).json({ error: 'sin_conversacion' });
      const sug = await suggestOrder(convo);
      return res.json(sug);
    } catch (e) { console.error('[panel pedido suggest]', e.message); return res.status(500).json({ error: 'error_pedido' }); }
  });

  router.post('/chat/responder', async (req, res) => {
    const { channel, contact, text } = req.body || {};
    if (!text || !String(text).trim()) return res.status(400).json({ error: 'sin_texto' });
    if (String(channel).toLowerCase() !== 'whatsapp') return res.status(400).json({ error: 'canal_no_soportado' });
    const wa = await getCompanyWa(db, req.auth.companyId);
    if (!wa || !wa.wa_phone_number_id || !wa.wa_token) return res.status(400).json({ error: 'whatsapp_no_configurado' });
    const to = telefonoDeContacto(contact).replace(/[^0-9]/g, '');
    if (!to) return res.status(400).json({ error: 'sin_telefono' });
    try {
      await _sendText({ to, body: String(text), token: wa.wa_token, phoneNumberId: wa.wa_phone_number_id });
    } catch (e) { return res.status(502).json({ error: 'envio_falla' }); }
    const m = await chatRepo.addMensaje(db, req.auth.companyId, { channel: 'whatsapp', contact, text, direccion: 'out', source: 'panel' });
    return res.json(m);
  });

  // Envía una imagen capturada (foto/screenshot/archivo) al cliente por WhatsApp.
  router.post('/chat/responder-imagen', async (req, res) => {
    const { channel, contact, imageBase64, mimeType, caption } = req.body || {};
    const b64 = String(imageBase64 || '').replace(/^data:[^,]+,/, '').trim();
    if (!b64) return res.status(400).json({ error: 'sin_imagen' });
    if (String(channel).toLowerCase() !== 'whatsapp') return res.status(400).json({ error: 'canal_no_soportado' });
    const wa = await getCompanyWa(db, req.auth.companyId);
    if (!wa || !wa.wa_phone_number_id || !wa.wa_token) return res.status(400).json({ error: 'whatsapp_no_configurado' });
    const to = telefonoDeContacto(contact).replace(/[^0-9]/g, '');
    if (!to) return res.status(400).json({ error: 'sin_telefono' });
    try {
      await _sendImage({ to, buffer: Buffer.from(b64, 'base64'), mimeType: mimeType || 'image/jpeg', caption: caption || '', token: wa.wa_token, phoneNumberId: wa.wa_phone_number_id });
    } catch (e) { return res.status(502).json({ error: 'envio_falla' }); }
    const m = await chatRepo.addMensaje(db, req.auth.companyId, { channel: 'whatsapp', contact, text: (caption && String(caption).trim()) ? caption : '📷 Imagen', direccion: 'out', source: 'panel' });
    return res.json(m);
  });

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

  // Pedido por catálogo (mismo flujo que la app APK): arma líneas desde el
  // catálogo, calcula precio/envío server-side y devuelve {pedido, text, waUrl}.
  router.post('/pedido/from-catalog', async (req, res) => {
    try {
      const b = req.body || {};
      const lineasIn = Array.isArray(b.lineas) ? b.lineas : [];
      const items = [];
      for (const ln of lineasIn) {
        const prod = await catalogRepo.getProduct(db, req.auth.companyId, ln && ln.productId);
        if (!prod) continue;
        const sel = { opciones: (ln.opciones) || {}, extras: Array.isArray(ln.extras) ? ln.extras : [] };
        items.push({
          descripcion: catalogRepo.describeSelection(prod, sel),
          cantidad: Math.max(1, parseInt(ln.cantidad, 10) || 1),
          precio_unitario: catalogRepo.priceForSelection(prod, sel),
        });
      }
      if (!items.length) return res.status(400).json({ error: 'sin_lineas' });
      const cfg = await pedidosRepo.getPedidoConfig(db, req.auth.companyId);
      let comuna = null, envio_costo = 0, envio_zona = null;
      if (b.entrega === 'despacho' && b.comuna) {
        const subtotalProductos = items.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0);
        const env = pedidosRepo.costoEnvio(cfg.delivery, b.comuna, subtotalProductos);
        if (!env.ok) return res.status(400).json({ error: 'sin_despacho_comuna' });
        comuna = b.comuna; envio_costo = env.costo; envio_zona = env.zona ? env.zona.nombre : null;
      }
      const contact = b.contact || {};
      const ped = await pedidosRepo.createPedido(db, req.auth.companyId, {
        channel: b.channel || 'whatsapp',
        contact_name: contact.name, contact_phone: contact.phone,
        items, impuesto_pct: cfg.iva_incluido ? 0 : 19,
        entrega: b.entrega, direccion: b.direccion, nota: b.nota,
        comuna, envio_costo, envio_zona,
      });
      const text = pedidosRepo.pedidoToText(ped, { pie: cfg.pie });
      return res.status(201).json({ pedido: ped, text, waUrl: pedidosRepo.waLink(text, contact.phone) });
    } catch (e) { console.error('[panel pedido from-catalog]', e.message); return res.status(500).json({ error: 'error_pedido' }); }
  });

  router.get('/pedido/:id/pdf', async (req, res) => {
    try {
      const ped = await pedidosRepo.getPedido(db, req.auth.companyId, req.params.id);
      if (!ped) return res.status(404).json({ error: 'no_existe' });
      const pie = await pedidosRepo.getCompanyPie(db, req.auth.companyId);
      const buf = await buildPedidoPdf(ped, { pie });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="cotizacion.pdf"');
      return res.send(buf);
    } catch (e) {
      if (e.message && e.message.includes('uuid')) return res.status(404).json({ error: 'no_existe' });
      console.error('[panel pedido pdf]', e.message); return res.status(500).json({ error: 'error_pdf' });
    }
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

  router.get('/expenses/:id/lineas', async (req, res) => {
    try { res.json({ lineas: await getLineas(db, req.params.id) }); }
    catch (e) { res.status(500).json({ error: 'lineas_error' }); }
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
  
  router.post('/cuentas', async (req, res) => {
    try {
      const c = await contaCuentas.createCuenta(db, req.auth.companyId, req.body || {});
      res.status(201).json(c);
    } catch (e) {
      res.status(400).json({ error: e.message || 'invalido' });
    }
  });

  router.patch('/cuentas/:id', async (req, res) => {
    try {
      const c = await contaCuentas.updateCuenta(db, req.auth.companyId, req.params.id, req.body || {});
      if (!c) return res.status(404).json({ error: 'no_existe' });
      res.json(c);
    } catch (e) {
      res.status(400).json({ error: e.message || 'invalido' });
    }
  });

  router.delete('/cuentas/:id', async (req, res) => {
    const c = await contaCuentas.deactivateCuenta(db, req.auth.companyId, req.params.id);
    if (!c) return res.status(404).json({ error: 'no_existe' });
    res.json({ ok: true });
  });

  router.post('/asientos/manual', async (req, res) => {
    try { res.status(201).json({ asiento: await crearAsientoManual(db, req.auth.companyId, req.body || {}) }); }
    catch (e) { res.status(400).json({ error: e.code || 'invalido' }); }
  });
  router.post('/asientos/:id/anular', async (req, res) => {
    const a = await anularAsientoManual(db, req.auth.companyId, req.params.id);
    if (!a) return res.status(404).json({ error: 'no_existe' });
    res.json({ ok: true });
  });

  router.post('/expenses/manual', async (req, res) => {
    const { tipo, proveedor, rut_emisor, folio, fecha, neto, iva, total, categoria, estado_pago } = req.body || {};
    if (!tipo || total === undefined) {
      return res.status(400).json({ error: 'tipo_y_total_requeridos' });
    }
    const { mapCategoryToSii } = require('../domain/categories');
    
    let cuentaSii = {};
    if (tipo !== 'ingreso' && categoria) {
      const cuenta = mapCategoryToSii(categoria);
      if (cuenta) {
        cuentaSii = { cuenta_sii_codigo: cuenta.codigo, cuenta_sii_nombre: cuenta.nombre };
      }
    }

    const expense = await createExpense(db, {
      company_id: req.auth.companyId,
      employee_id: null,
      canal: 'app',
      estado: 'confirmado',
      tipo,
      proveedor: proveedor || 'Transacción manual',
      rut_emisor,
      folio,
      fecha: fecha || new Date().toISOString().slice(0, 10),
      neto: Number(neto) || 0,
      iva: Number(iva) || 0,
      total: Number(total) || 0,
      categoria,
      estado_pago: estado_pago || 'pendiente',
      ...cuentaSii,
    });
    await aplicarContabilidad(db, req.auth.companyId, expense, 'confirmar');
    return res.status(201).json(expense);
  });

  // OCR de documento (foto/PDF/captura) subido desde el panel: lee y registra el gasto.
  router.post('/expenses/ocr', async (req, res) => {
    const { imageBase64, mimeType, override } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'falta_imagen' });
    try {
      const { expense, duplicado, documento } = await intakeFromImage({
        db, companyId: req.auth.companyId, employeeId: null,
        imageBuffer: Buffer.from(imageBase64, 'base64'), mimeType: mimeType || 'image/jpeg',
        canal: 'app', override: !!override,
      });
      if (documento) return res.status(202).json({ documento });
      if (!expense) return res.status(409).json({ error: 'duplicado', duplicado });
      return res.status(201).json({ expense, duplicado: duplicado || null });
    } catch (e) {
      if (e instanceof SinCreditosError) return res.status(402).json({ error: 'sin_creditos', saldo: e.saldo });
      return res.status(502).json({ error: 'ocr_falla', detalle: e.message });
    }
  });

  // ── VARAS chat IA ──
  router.post('/varas/chat', async (req, res) => {
    const messages = (req.body && req.body.messages) || [];
    res.json(await responder(db, req.auth.companyId, messages, { gemini: _varasGemini }));
  });
  router.post('/varas/accion', async (req, res) => {
    const b = req.body || {};
    res.json(await ejecutarAccion(db, req.auth.companyId, b.tipo, b.args || {}, { sendText: _sendText, owner: { kind: 'user', id: req.auth.userId } }));
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

  // ── Preferencias del agente para el dueño (nombre/trato/onboarding de KALY) ──
  router.get('/agent/prefs', async (req, res) => {
    return res.json(await getOwnerAgentPrefs(db, req.auth.companyId));
  });
  router.patch('/agent/prefs', async (req, res) => {
    const prefs = await setOwnerAgentPrefs(db, req.auth.companyId, req.body || {});
    return res.json({ agent_prefs: prefs });
  });

  // ── KALY memoria (hechos del negocio, scoped por empresa) ──
  // Memoria del agente (nivel 2): empresa (compartida) + personal (del dueño).
  function ownerDelCaller(req) { return { kind: 'user', id: req.auth.userId }; }

  router.get('/kaly/memoria', async (req, res) => {
    const owner = ownerDelCaller(req);
    const todas = await memoryRepo.listMemorias(db, req.auth.companyId, { owner });
    return res.json({
      empresa: todas.filter((m) => m.owner_kind === 'company'),
      personal: todas.filter((m) => m.owner_kind !== 'company'),
    });
  });

  router.post('/kaly/memoria', async (req, res) => {
    const b = req.body || {};
    const owner = ownerDelCaller(req);
    const esPersonal = b.alcance === 'personal';
    const m = await memoryRepo.crearMemoria(db, req.auth.companyId, {
      tipo: b.tipo, contenido: b.contenido, origen: 'dueño',
      owner_kind: esPersonal ? owner.kind : 'company',
      owner_id: esPersonal ? owner.id : null,
    });
    if (!m) return res.status(400).json({ error: 'contenido_vacio' });
    return res.status(201).json({ accion: 'insertar', memoria: m });
  });

  router.delete('/kaly/memoria', async (req, res) => {
    const owner = ownerDelCaller(req);
    if (req.query.alcance === 'personal') {
      const n = await memoryRepo.borrarMemoriasDe(db, req.auth.companyId, { ownerKind: owner.kind, ownerId: owner.id });
      return res.json({ ok: true, borradas: n });
    }
    if (req.query.alcance === 'empresa') {
      if (req.auth.rol !== 'owner') return res.status(403).json({ error: 'solo_dueño' });
      const n = await memoryRepo.borrarMemoriasDe(db, req.auth.companyId, { ownerKind: 'company' });
      return res.json({ ok: true, borradas: n });
    }
    return res.status(400).json({ error: 'alcance_requerido' });
  });

  router.delete('/kaly/memoria/:id', async (req, res) => {
    const owner = ownerDelCaller(req);
    const r = await memoryRepo.borrarMemoria(db, req.auth.companyId, req.params.id, { owner });
    if (!r) return res.status(404).json({ error: 'no_existe' });
    return res.json({ ok: true });
  });

  // Sesión de voz para el dueño (mismo motor que la app): token efímero Gemini + contexto.
  router.post('/agent/session', async (req, res) => {
    let tok;
    if (process.env.KALY_TOKEN_MODE === 'key') {
      tok = { token: process.env.GEMINI_API_KEY, expireAt: null, model: process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-09-2025' };
    } else {
      try { tok = await createEphemeralToken({ apiKey: process.env.GEMINI_API_KEY }); }
      catch (e) { return res.status(503).json({ error: 'live_no_disponible', detalle: e.message }); }
    }
    const context = await buildAgentContext(db, {
      companyId: req.auth.companyId,
      employeeId: null,
      owner: { kind: 'user', id: req.auth.userId },
    });
    // El dueño no tiene employeeId: superponemos sus preferencias guardadas a nivel empresa.
    const ownerPrefs = await getOwnerAgentPrefs(db, req.auth.companyId);
    if (ownerPrefs.nombre) context.nombre = ownerPrefs.nombre;
    if (ownerPrefs.trato) context.trato = ownerPrefs.trato;
    if (ownerPrefs.onboarded_at) context.onboarded = true;
    return res.json({ ...tok, context });
  });

  router.post('/agent/session/end', async (req, res) => {
    const duracion_seg = Number((req.body || {}).duracion_seg);
    if (!Number.isFinite(duracion_seg) || duracion_seg <= 0) {
      return res.status(400).json({ error: 'duracion_invalida' });
    }
    const minutos = Math.max(1, Math.ceil(duracion_seg / 60));
    try {
      await consumirCredito(db, req.auth.companyId, { tipo: 'voz_min', cantidad: minutos, meta: { duracion_seg } });
      const s = await saldoCreditos(db, req.auth.companyId);
      return res.json({ ok: true, saldo: s });
    } catch (e) {
      if (e instanceof SinCreditosError) return res.status(402).json({ error: 'sin_creditos', saldo: e.saldo });
      return res.status(500).json({ error: 'voz_end_error' });
    }
  });

  return router;
}

module.exports = { createPanelRouter };
