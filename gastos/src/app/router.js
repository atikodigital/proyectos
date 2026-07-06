const express = require('express');
const { getEmployeeByUsuario, getAgentPrefs, setAgentPrefs, getCompanyWa, getCompanyProfile, setOnboarded, setOnboardingSaltado, updateCompany, setGiro, getCompany, getOwnerAgentPrefs, eliminarEmpresa } = require('../companies/repo');
const { verifyPassword } = require('../auth/password');
const { signToken } = require('../auth/jwt');
const { requireAuth, requireKind, requireKindAny } = require('../auth/middleware');
const { intakeFromImage } = require('../expenses/intake');
const { getExpense, confirmExpense, updateExpense, rejectExpense, annulExpense, markExpensePaid, markExpensePendiente, markExpenseConciliada, createExpense } = require('../expenses/repo');
const { buildExpensesWorkbook } = require('../panel/excel');
const { getLineas, getLineaConCompany, setLineaAuxiliar } = require('../expenses/lineas-repo');
const { listAuxiliares } = require('../auxiliares/repo');
const auxReportes = require('../auxiliares/reportes');
const realExtract = require('../ocr/extract');
const { conciliarCartola } = require('../match/service');
const { construirInforme } = require('../match/conciliacion');
const { conciliarSii } = require('../match/sii');
const matchRepo = require('../match/repo');
const { libroMayor } = require('../contabilidad/reportes');
const contaCuentas = require('../contabilidad/cuentas');
const { readImage, contentTypeFor } = require('../expenses/storage');
const { buildAgentContext } = require('../agent/context');
const { cashflowSummary } = require('../expenses/summary');
const { formatCashflowSummary } = require('../whatsapp/format');
const pedidosRepo = require('../pedidos/repo');
const { buildPedidoPdf } = require('../pedidos/pdf');
const { suggestOrder } = require('../pedidos/suggest');
const catalogRepo = require('../catalog/repo');
const chatRepo = require('../chat/repo');
const contactosRepo = require('../chat/contactos-repo');
const { fichaDerivada, telefonoDeContacto } = require('../chat/ficha');
const { registerCatalogRoutes } = require('../catalog/routes');
const { extraerProductos: realExtraerProductos } = require('../catalog/extraer');
const realAprender = require('../agent/aprender');
const realGestionar = require('../agent/gestionar');
const { aplicarContabilidad } = require('../contabilidad/contabilizar');
const contaReportes = require('../contabilidad/reportes');
const { REGIONES_COMUNAS } = require('../pedidos/comunas-chile');
const { mapCategoryToSii } = require('../domain/categories');
const { crearAsientoManual, anularAsientoManual } = require('../contabilidad/manual');
const { responder } = require('../varas/chat');
const { responderKaly } = require('../agent/kaly-chat');
const { geminiChat } = require('../varas/gemini');
const { ejecutarAccion } = require('../varas/acciones');
const { TOOLS_READ } = require('../varas/tools');
const memoryRepo = require('../agent/memory');
const { saldo: saldoCreditos, consumirCredito, SinCreditosError } = require('../billing/creditos');
const { createPreapproval } = require('../billing/mp');
const { crearSuscripcionPaypal } = require('../billing/paypal');
const { procesadorPara, monedasSoportadas } = require('../billing/planes');
const { getUserById } = require('../users/repo');
const { calcularResumenPersonal } = require('../personal/repo');

function createAppRouter({ db, extractExpense, createLiveToken, sendText, sendImage, extractCartola, componer, extraerProductos, extractLibroSii, varasGemini, extraerHechos, juzgarHecho } = {}) {
  const _extract = extractExpense || realExtract.extractExpense;
  const _extractCartola = extractCartola || ((b64, mime) => require('../ocr/cartola').geminiExtractCartola(b64, mime));
  const _extractLibroSii = extractLibroSii || ((b64, mime) => require('../ocr/libro-sii').geminiExtractLibroSii(b64, mime));
  const _liveToken = createLiveToken || (() => require('../agent/token').createEphemeralToken({ apiKey: process.env.GEMINI_API_KEY }));
  const _sendText = sendText || require('../whatsapp/client').sendText;
  const _sendImage = sendImage || require('../whatsapp/client').sendImage;
  const _extraerProductos = extraerProductos || realExtraerProductos;
  const _extraerHechos = extraerHechos || realAprender.extraerHechos;
  const _juzgarHecho = juzgarHecho || realGestionar.juzgarHecho;
  const _varasGemini = varasGemini || geminiChat;
  const router = express.Router();

  // Deja un rastro automático en la Memoria de KALY por cada movimiento registrado
  // (voz/manual o captura confirmada). Best-effort: nunca debe romper el registro.
  async function memoriaMovimiento(companyId, exp) {
    if (!exp) return;
    const fechaTxt = exp.fecha ? String(exp.fecha).slice(0, 10) : '';
    const signo = exp.tipo === 'ingreso' ? 'Ingreso' : 'Gasto';
    const monto = '$' + Number(exp.total || 0).toLocaleString('es-CL');
    const partes = [exp.proveedor, monto, exp.categoria, fechaTxt].filter(Boolean);
    await memoryRepo.registrarHechoAuto(db, companyId, { contenido: `${signo} registrado: ${partes.join(' · ')}` });
    // Contador del día (se actualiza, no duplica): "Movimientos registrados hoy: N".
    try {
      const hoy = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago' }).format(new Date());
      const r = await db.query(
        "SELECT count(*)::int AS n FROM expenses WHERE company_id=$1 AND estado<>'anulado' AND (created_at AT TIME ZONE 'America/Santiago')::date = (now() AT TIME ZONE 'America/Santiago')::date",
        [companyId]
      );
      const n = (r.rows[0] && r.rows[0].n) || 0;
      await memoryRepo.upsertHechoAuto(db, companyId, { tipo: 'hecho', prefijo: 'Movimientos registrados hoy', contenido: `Movimientos registrados hoy (${hoy}): ${n}` });
    } catch (_) { /* contador best-effort */ }
  }

  router.post('/login', async (req, res) => {
    const { usuario, password } = req.body || {};
    const emp = await getEmployeeByUsuario(db, usuario);
    if (!emp || !(await verifyPassword(password, emp.password_hash))) {
      return res.status(401).json({ error: 'credenciales' });
    }
    const token = signToken({ kind: 'employee', companyId: emp.company_id, employeeId: emp.id });
    return res.json({ token, employee: { id: emp.id, nombre: emp.nombre } });
  });

  // ── Sesión de voz KALY: la APK la usan tanto empleados (login usuario/clave)
  // como dueños (login social Google/Facebook, token kind='user'). Por eso estas
  // dos rutas van ANTES del requireKind('employee') global, con su propio middleware
  // que acepta ambos, y arman el contexto según cuál sea (mismo patrón que el panel).
  router.post('/agent/session', requireAuth, requireKindAny(['employee', 'user']), async (req, res) => {
    let tok;
    if (process.env.KALY_TOKEN_MODE === 'key') {
      tok = { token: process.env.GEMINI_API_KEY, expireAt: null, model: process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-09-2025' };
    } else {
      try { tok = await _liveToken(); }
      catch (e) { return res.status(503).json({ error: 'live_no_disponible', detalle: e.message }); }
    }
    const esOwner = req.auth.kind === 'user';
    const context = await buildAgentContext(db, {
      companyId: req.auth.companyId,
      employeeId: esOwner ? null : req.auth.employeeId,
      owner: esOwner ? { kind: 'user', id: req.auth.userId } : { kind: 'employee', id: req.auth.employeeId },
    });
    if (esOwner) {
      const ownerPrefs = await getOwnerAgentPrefs(db, req.auth.companyId);
      if (ownerPrefs.nombre) context.nombre = ownerPrefs.nombre;
      if (ownerPrefs.trato) context.trato = ownerPrefs.trato;
      if (ownerPrefs.onboarded_at) context.onboarded = true;
    }
    console.log('[kaly] token live emitido para', esOwner ? 'owner' : 'empleado', esOwner ? req.auth.userId : req.auth.employeeId);
    // Deja constancia en la Memoria de KALY de que hubo interacción (se actualiza,
    // no duplica). Refleja "ya saludó / última vez que conversaron". Y si ya está
    // onboarded, marca el inicio de la relación una sola vez ("Kaly conoció a X").
    try {
      const hoy = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago' }).format(new Date());
      await memoryRepo.upsertHechoAuto(db, req.auth.companyId, { tipo: 'dueño', prefijo: 'Última conversación con KALY', contenido: `Última conversación con KALY: ${hoy}` });
      if (context.onboarded && context.nombre) {
        await memoryRepo.crearHechoUnico(db, req.auth.companyId, { tipo: 'dueño', prefijo: 'Kaly conoció a', contenido: `Kaly conoció a ${context.nombre} el ${hoy}` });
      }
    } catch (_) { /* memoria best-effort */ }
    return res.json({ ...tok, context });
  });

  router.post('/agent/session/end', requireAuth, requireKindAny(['employee', 'user']), async (req, res) => {
    const duracion_seg = Number((req.body || {}).duracion_seg);
    if (!Number.isFinite(duracion_seg) || duracion_seg <= 0) {
      return res.status(400).json({ error: 'duracion_invalida' });
    }
    // Primer minuto GRATIS: una voz corta para registrar un movimiento ya paga su shot
    // por movimiento (en /expenses/manual), así que no se cobra minuto encima. Solo la
    // conversación Live extendida (>1 min) suma voz_min por cada minuto adicional.
    const minutos = Math.max(0, Math.ceil(duracion_seg / 60) - 1);
    try {
      if (minutos > 0) {
        await consumirCredito(db, req.auth.companyId, { tipo: 'voz_min', cantidad: minutos, meta: { duracion_seg } });
      }
      const s = await saldoCreditos(db, req.auth.companyId);
      return res.json({ ok: true, saldo: s });
    } catch (e) {
      if (e instanceof SinCreditosError) return res.status(402).json({ error: 'sin_creditos', saldo: e.saldo });
      return res.status(500).json({ error: 'voz_end_error' });
    }
  });

  // Chat de TEXTO de KALY (dueños y empleados). Va antes del requireKind global,
  // como /agent/session, porque los dueños entran con token kind='user'.
  router.post('/kaly/chat', requireAuth, requireKindAny(['employee', 'user']), async (req, res) => {
    const messages = (req.body && req.body.messages) || [];
    const esOwner = req.auth.kind === 'user';
    const owner = esOwner ? { kind: 'user', id: req.auth.userId } : { kind: 'employee', id: req.auth.employeeId };
    try {
      const r = await responderKaly(db, { companyId: req.auth.companyId, employeeId: esOwner ? null : req.auth.employeeId, owner }, messages, { gemini: _varasGemini });
      // Igual que la voz: deja constancia en la Memoria de que hubo interacción hoy.
      try {
        const hoy = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago' }).format(new Date());
        await memoryRepo.upsertHechoAuto(db, req.auth.companyId, { tipo: 'dueño', prefijo: 'Última conversación con KALY', contenido: `Última conversación con KALY: ${hoy}` });
      } catch (_) { /* memoria best-effort */ }
      return res.json(r);
    } catch (e) {
      return res.status(500).json({ error: 'kaly_chat_error', reply: 'No pude procesar tu mensaje ahora.' });
    }
  });

  // Eliminación de cuenta self-service (requisito de Google Play para apps con
  // registro). Borra la empresa y TODOS sus datos. Permitido para el DUEÑO de
  // negocio (kind='user') y para las cuentas PERSONALES (persona natural, que se
  // autentican como employee único con tipo_cuenta='personal'). Un empleado de un
  // NEGOCIO no puede borrar la empresa. Va antes del requireKind('employee')
  // global, como /agent/session, porque el dueño entra con token kind='user'.
  // Es irreversible.
  router.delete('/company', requireAuth, requireKindAny(['user', 'employee']), async (req, res) => {
    try {
      if (req.auth.kind !== 'user') {
        const r = await db.query('SELECT tipo_cuenta FROM companies WHERE id=$1', [req.auth.companyId]).catch(() => ({ rows: [] }));
        const tipo = r.rows[0] && r.rows[0].tipo_cuenta;
        if (tipo !== 'personal') {
          return res.status(403).json({ error: 'prohibido' });
        }
      }
      const eliminada = await eliminarEmpresa(db, req.auth.companyId);
      if (!eliminada) return res.status(404).json({ error: 'no_existe' });
      return res.json({ ok: true, empresa: eliminada.nombre });
    } catch (e) {
      return res.status(500).json({ error: 'eliminar_error' });
    }
  });

  router.use(requireAuth, requireKind('employee'));

  router.get('/comunas', (req, res) => res.json(REGIONES_COMUNAS));

  // ── Reportes contables VARAS (solo lectura) ──
  router.get('/contabilidad/diario', async (req, res) => {
    const asientos = await contaReportes.libroDiario(db, req.auth.companyId, req.query);
    return res.json({ asientos });
  });
  router.get('/contabilidad/mayor', async (req, res) => {
    const cuentas = await contaReportes.libroMayor(db, req.auth.companyId, req.query);
    return res.json({ cuentas });
  });
  router.get('/contabilidad/balance', async (req, res) => {
    return res.json(await contaReportes.balanceComprobacion(db, req.auth.companyId, req.query));
  });
  router.get('/contabilidad/flujo', async (req, res) => {
    return res.json(await contaReportes.flujoCaja(db, req.auth.companyId, req.query));
  });

  // ── Asientos manuales VARAS ──
  router.get('/cuentas', async (req, res) => {
    res.json({ cuentas: await contaCuentas.listCuentas(db, req.auth.companyId) });
  });
  router.post('/asientos/manual', async (req, res) => {
    try {
      const a = await crearAsientoManual(db, req.auth.companyId, req.body || {});
      res.status(201).json({ asiento: a });
    } catch (e) { res.status(400).json({ error: e.code || 'invalido' }); }
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
    res.json(await ejecutarAccion(db, req.auth.companyId, b.tipo, b.args || {}, { sendText: _sendText, owner: { kind: 'employee', id: req.auth.employeeId } }));
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

  registerCatalogRoutes(router, { db });

  router.post('/catalog/extraer', async (req, res) => {
    const { imageBase64, mimeType } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'falta_imagen' });
    try {
      // Cobra 1 crédito 'imagen' antes del OCR. Si no hay saldo, lanza SinCreditosError.
      await consumirCredito(db, req.auth.companyId, { tipo: 'imagen', cantidad: 1, meta: { origen: 'catalogo' } });
      const r = await _extraerProductos(imageBase64, mimeType || 'image/jpeg');
      return res.json({ productos: (r && r.productos) || [] });
    } catch (e) {
      if (e instanceof SinCreditosError) return res.status(402).json({ error: 'sin_creditos', saldo: e.saldo });
      console.error('[catalog extraer]', e.message);
      return res.status(502).json({ error: 'ocr_falla' });
    }
  });

  router.post('/products/bulk', async (req, res) => {
    const productos = (req.body && Array.isArray(req.body.productos)) ? req.body.productos : [];
    if (!productos.length) return res.status(400).json({ error: 'sin_productos' });
    return res.status(201).json(await catalogRepo.crearProductosBulk(db, req.auth.companyId, productos));
  });

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
    } catch (e) { console.error('[pedido from-catalog]', e.message); return res.status(500).json({ error: 'error_pedido' }); }
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
      console.error('[pedido pdf]', e.message); return res.status(500).json({ error: 'error_pdf' });
    }
  });

  router.get('/company', async (req, res) => {
    return res.json(await getCompanyProfile(db, req.auth.companyId));
  });
  router.patch('/company', async (req, res) => {
    const b = req.body || {};
    const companyPatch = {};
    ['nombre', 'owner_whatsapp', 'sueldo_mensual', 'dia_pago', 'idioma'].forEach((k) => { if (b[k] !== undefined) companyPatch[k] = b[k]; });
    if (Object.keys(companyPatch).length) await updateCompany(db, req.auth.companyId, companyPatch);
    if (b.giro !== undefined) await setGiro(db, req.auth.companyId, b.giro);
    if (b.onboarded) await setOnboarded(db, req.auth.companyId);
    if (b.onboarding_saltado) await setOnboardingSaltado(db, req.auth.companyId);
    return res.json(await getCompanyProfile(db, req.auth.companyId));
  });

  router.get('/personal/resumen', async (req, res) => {
    const profile = await getCompanyProfile(db, req.auth.companyId).catch(() => null);
    if (!profile || profile.tipo_cuenta !== 'personal') {
      return res.status(403).json({ error: 'solo_para_modo_personal' });
    }
    const resumen = await calcularResumenPersonal(db, req.auth.companyId);
    if (!resumen) return res.status(404).json({ error: 'no_encontrado' });
    return res.json(resumen);
  });

  router.get('/pedido-config', async (req, res) => {
    return res.json(await pedidosRepo.getPedidoConfig(db, req.auth.companyId));
  });
  router.patch('/pedido-config', async (req, res) => {
    return res.json(await pedidosRepo.setPedidoConfig(db, req.auth.companyId, req.body || {}));
  });

  // ── Overlay "Crear pedido" (cotización desde un chat, vía el APK Hash IA) ──
  router.post('/overlay/pedido/suggest', async (req, res) => {
    try {
      const { channel = 'whatsapp', contact = {}, conversation = '' } = req.body || {};
      const convo = String(conversation || '').trim();
      if (!convo) return res.status(400).json({ error: 'sin_conversacion' });
      const sug = await suggestOrder(convo);
      if (!sug.items.length) return res.status(422).json({ error: 'sin_pedido' });
      const ped = await pedidosRepo.createPedido(db, req.auth.companyId, {
        channel, contact_name: contact.name, contact_phone: contact.phone,
        items: sug.items, impuesto_pct: sug.impuesto_pct, moneda: sug.moneda,
        entrega: sug.entrega, direccion: sug.direccion, nota: sug.nota,
      });
      const pie = await pedidosRepo.getCompanyPie(db, req.auth.companyId);
      const text = pedidosRepo.pedidoToText(ped, { pie });
      return res.json({ pedido: ped, confianza: sug.confianza, text, waUrl: pedidosRepo.waLink(text, contact.phone) });
    } catch (e) { console.error('[pedido suggest]', e.message); return res.status(500).json({ error: 'error_pedido' }); }
  });
  router.post('/overlay/pedido/:id/sent', async (req, res) => {
    const ped = await pedidosRepo.markSent(db, req.auth.companyId, req.params.id);
    if (!ped) return res.status(404).json({ error: 'no_existe' });
    return res.json({ pedido: ped });
  });
  router.get('/pedido-pie', async (req, res) => {
    return res.json({ pie: await pedidosRepo.getCompanyPie(db, req.auth.companyId) });
  });
  router.patch('/pedido-pie', async (req, res) => {
    await pedidosRepo.setCompanyPie(db, req.auth.companyId, (req.body || {}).pie);
    return res.json({ ok: true });
  });

  // ── Bandeja "Chat" (CRM omnicanal): captura por notificaciones / compartir ──
  router.post('/chat/ingest', async (req, res) => {
    const { channel, contact, text, source } = req.body || {};
    if (!text || !String(text).trim()) return res.status(400).json({ error: 'sin_texto' });
    const m = await chatRepo.addMensaje(db, req.auth.companyId, { channel, contact, text, source });
    return res.status(201).json(m);
  });
  router.get('/chat/conversaciones', async (req, res) => {
    return res.json(await chatRepo.listConversaciones(db, req.auth.companyId));
  });
  router.get('/chat/conversacion', async (req, res) => {
    return res.json(await chatRepo.listMensajes(db, req.auth.companyId, req.query.channel, req.query.contact));
  });

  // Ficha del contacto (CRM móvil): derivada de los mensajes + datos editables.
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
    const m = await chatRepo.addMensaje(db, req.auth.companyId, { channel: 'whatsapp', contact, text: (caption && String(caption).trim()) ? caption : '📷 Imagen', direccion: 'out', source: 'app' });
    return res.json(m);
  });

  router.get('/agent/prefs', async (req, res) => {
    return res.json(await getAgentPrefs(db, req.auth.employeeId, req.auth.companyId));
  });

  router.patch('/agent/prefs', async (req, res) => {
    const prefs = await setAgentPrefs(db, req.auth.employeeId, req.auth.companyId, req.body || {});
    return res.json({ agent_prefs: prefs });
  });

  // ── KALY memoria (hechos scoped por empresa + personal por empleado) ──
  function ownerDelEmpleado(req) { return { kind: 'employee', id: req.auth.employeeId }; }

  router.get('/kaly/memoria', async (req, res) => {
    const owner = ownerDelEmpleado(req);
    const todas = await memoryRepo.listMemorias(db, req.auth.companyId, { owner });
    return res.json({
      empresa: todas.filter((m) => m.owner_kind === 'company'),
      personal: todas.filter((m) => m.owner_kind !== 'company'),
    });
  });

  router.post('/kaly/memoria', async (req, res) => {
    const b = req.body || {};
    const owner = ownerDelEmpleado(req);
    const esPersonal = b.alcance === 'personal';
    const m = await memoryRepo.crearMemoria(db, req.auth.companyId, {
      tipo: b.tipo, contenido: b.contenido, origen: 'kaly',
      owner_kind: esPersonal ? owner.kind : 'company',
      owner_id: esPersonal ? owner.id : null,
    });
    if (!m) return res.status(400).json({ error: 'contenido_vacio' });
    return res.status(201).json({ accion: 'insertar', memoria: m });
  });

  router.delete('/kaly/memoria', async (req, res) => {
    const owner = ownerDelEmpleado(req);
    if (req.query.alcance === 'personal') {
      const n = await memoryRepo.borrarMemoriasDe(db, req.auth.companyId, { ownerKind: owner.kind, ownerId: owner.id });
      return res.json({ ok: true, borradas: n });
    }
    return res.status(400).json({ error: 'alcance_requerido' });
  });

  router.delete('/kaly/memoria/:id', async (req, res) => {
    const owner = ownerDelEmpleado(req);
    const r = await memoryRepo.borrarMemoria(db, req.auth.companyId, req.params.id, { owner });
    if (!r) return res.status(404).json({ error: 'no_existe' });
    return res.json({ ok: true });
  });

  router.post('/kaly/aprender', async (req, res) => {
    const { transcripcion } = req.body || {};
    const r = await realAprender.aprenderDeConversacion(db, req.auth.companyId, { transcripcion, extraer: _extraerHechos, juzgar: _juzgarHecho });
    return res.json({ creados: r.creados });
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
    const { imageBase64, mimeType, override, override_receptor, force_ingreso } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'falta_imagen' });
    const company = await getCompany(db, req.auth.companyId).catch(() => null);
    // La empresa del token ya no existe (p.ej. se borró desde /admin y el teléfono
    // sigue con la sesión vieja). Sin este corte, seguía adelante, gastaba un
    // crédito y hacía la llamada a Gemini para terminar fallando igual al insertar
    // en expenses (foreign key), devolviendo un 500 genérico sin pista alguna.
    if (!company) return res.status(401).json({ error: 'empresa_no_existe' });
    const companyRut = (company && company.rut) || '';
    let intakeResult;
    try {
      intakeResult = await intakeFromImage({
        db, companyId: req.auth.companyId, employeeId: req.auth.employeeId,
        imageBuffer: Buffer.from(imageBase64, 'base64'), mimeType: mimeType || 'image/jpeg',
        canal: 'app', extract: _extract, override: !!override,
        companyRut, overrideReceptor: !!override_receptor, forceIngreso: !!force_ingreso,
      });
    } catch (e) {
      if (e instanceof SinCreditosError) return res.status(402).json({ error: 'sin_creditos', saldo: e.saldo });
      throw e;
    }
    const { expense, duplicado, documento, receptor_ajeno, es_venta } = intakeResult;
    if (documento) return res.status(202).json({ documento, match: 'pendiente' });
    if (es_venta) return res.status(422).json({ error: 'es_venta', ...es_venta });
    if (receptor_ajeno) return res.status(422).json({ error: 'receptor_ajeno', ...receptor_ajeno });
    if (!expense) return res.status(409).json({ error: 'duplicado', duplicado });
    return res.status(201).json({ ...expense, duplicado: duplicado || null });
  });

  router.post('/expenses/manual', async (req, res) => {
    const { tipo, proveedor, rut_emisor, folio, fecha, neto, iva, total, categoria, estado_pago } = req.body || {};
    if (!tipo || total === undefined) {
      return res.status(400).json({ error: 'tipo_y_total_requeridos' });
    }
    // Registro por KALY (voz o texto): en la APK este endpoint solo lo llama la IA
    // (tools.js → crear_movimiento_manual). Cobra 1 shot por movimiento, igual que la
    // foto. Se cobra ANTES de crear: sin créditos = no se registra (402).
    try {
      await consumirCredito(db, req.auth.companyId, { tipo: 'movimiento', cantidad: 1, meta: { via: 'kaly' } });
    } catch (e) {
      if (e instanceof SinCreditosError) return res.status(402).json({ error: 'sin_creditos', saldo: e.saldo });
      throw e;
    }
    const { createExpense } = require('../expenses/repo');
    const { mapCategoryToSii } = require('../domain/categories');

    // Para GASTO con categoría, derivar la cuenta SII desde el mapa de categorías
    let cuentaSii = {};
    if (tipo !== 'ingreso' && categoria) {
      const cuenta = mapCategoryToSii(categoria);
      cuentaSii = { cuenta_sii_codigo: cuenta.codigo, cuenta_sii_nombre: cuenta.nombre };
    }

    // IVA automático para registros por voz/texto (las capturas ya traen neto/iva del
    // OCR). En Chile el precio incluye IVA: neto = total/1.19, IVA = resto. Aplica a
    // NEGOCIO y PERSONAL (se guarda el desglose aunque KALY no lo mencione).
    let netoN = Math.round(Number(neto) || 0);
    let ivaN = Math.round(Number(iva) || 0);
    const totalN = Math.round(Number(total) || 0);
    if (!netoN && !ivaN && totalN > 0) {
      netoN = Math.round(totalN / 1.19);
      ivaN = totalN - netoN;
    }

    const expense = await createExpense(db, {
      company_id: req.auth.companyId,
      employee_id: req.auth.employeeId,
      canal: 'app',
      estado: 'confirmado',
      tipo,
      proveedor: proveedor || 'Transacción manual',
      rut_emisor,
      folio,
      fecha: fecha || new Date().toISOString().slice(0, 10),
      neto: netoN,
      iva: ivaN,
      total: totalN,
      categoria,
      estado_pago: estado_pago || 'pendiente',
      ...cuentaSii,
    });
    await aplicarContabilidad(db, req.auth.companyId, expense, 'confirmar');
    // Si nace ya PAGADA, genera también el asiento de pago (Proveedores→Banco),
    // para que Proveedores refleje solo lo realmente por pagar.
    if (expense.estado_pago === 'pagada') await aplicarContabilidad(db, req.auth.companyId, expense, 'pagar');
    try { await memoriaMovimiento(req.auth.companyId, expense); } catch (_) { /* memoria best-effort */ }
    return res.status(201).json(expense);
  });

  router.post('/expenses/:id/confirm', async (req, res) => {
    if (!(await ownedExpense(req, res))) return;
    const confirmed = await confirmExpense(db, req.params.id);
    const exp = await getExpense(db, req.params.id);
    await aplicarContabilidad(db, req.auth.companyId, exp, 'confirmar');
    if (exp.estado_pago === 'pagada') await aplicarContabilidad(db, req.auth.companyId, exp, 'pagar');
    try { await memoriaMovimiento(req.auth.companyId, exp); } catch (_) { /* memoria best-effort */ }
    return res.json(confirmed);
  });

  router.patch('/expenses/:id/pagar', async (req, res) => {
    if (!(await ownedExpense(req, res))) return;
    const paid = await markExpensePaid(db, req.auth.companyId, req.params.id);
    const exp = await getExpense(db, req.params.id);
    await aplicarContabilidad(db, req.auth.companyId, exp, 'pagar');
    return res.json(paid);
  });

  // Cambia el estado de pago en ambos sentidos: pagada <-> pendiente de pago.
  // Ajusta la contabilidad (crea o anula el asiento de pago Proveedores<->Banco).
  router.patch('/expenses/:id/pago', async (req, res) => {
    if (!(await ownedExpense(req, res))) return;
    const pagada = !!(req.body && req.body.pagada);
    const row = pagada
      ? await markExpensePaid(db, req.auth.companyId, req.params.id)
      : await markExpensePendiente(db, req.auth.companyId, req.params.id);
    const exp = await getExpense(db, req.params.id);
    await aplicarContabilidad(db, req.auth.companyId, exp, pagada ? 'pagar' : 'despagar');
    return res.json(row);
  });

  router.patch('/expenses/:id', async (req, res) => {
    if (!(await ownedExpense(req, res))) return;
    const updated = await updateExpense(db, req.params.id, req.body || {});
    const exp = await getExpense(db, req.params.id);
    await aplicarContabilidad(db, req.auth.companyId, exp, 'editar');
    return res.json(updated);
  });

  router.post('/expenses/:id/reject', async (req, res) => {
    if (!(await ownedExpense(req, res))) return;
    return res.json(await rejectExpense(db, req.params.id));
  });

  router.post('/expenses/:id/anular', async (req, res) => {
    if (!(await ownedExpense(req, res))) return;
    const anulado = await annulExpense(db, req.auth.companyId, req.params.id);
    const exp = await getExpense(db, req.params.id);
    await aplicarContabilidad(db, req.auth.companyId, exp, 'anular');
    return res.json(anulado);
  });

  router.get('/expenses/:id/foto', async (req, res) => {
    const exp = await ownedExpense(req, res);
    if (!exp) return;
    const buf = readImage(exp.foto_path);
    if (!buf) return res.status(404).json({ error: 'sin_foto' });
    res.setHeader('Content-Type', contentTypeFor(exp.foto_path));
    return res.send(buf);
  });

  router.get('/auxiliares', async (req, res) => {
    res.json({ auxiliares: await listAuxiliares(db, req.auth.companyId) });
  });

  // IMPORTANT: literal route BEFORE /:id/consumo so "consumo" is not captured as :id
  router.get('/auxiliares/consumo', async (req, res) => {
    const c = await auxReportes.consumoPorNombre(db, req.auth.companyId, req.query.nombre || '', req.query);
    res.json({ ...c, frase: auxReportes.frasearConsumo(c, req.query.nombre || '') });
  });
  router.get('/auxiliares/:id/consumo', async (req, res) => {
    res.json(await auxReportes.consumoAuxiliar(db, req.auth.companyId, req.params.id, req.query));
  });

  router.patch('/lineas/:id', async (req, res) => {
    const lc = await getLineaConCompany(db, req.params.id);
    if (!lc || lc.company_id !== req.auth.companyId) return res.status(404).json({ error: 'no_existe' });
    const b = req.body || {};
    const linea = await setLineaAuxiliar(db, req.params.id, b.auxiliar_id !== undefined ? b.auxiliar_id : lc.auxiliar_id, { cantidad: b.cantidad, unidad: b.unidad });
    res.json({ linea });
  });

  router.get('/expenses/:id/lineas', async (req, res) => {
    if (!(await ownedExpense(req, res))) return;
    res.json({ lineas: await getLineas(db, req.params.id) });
  });

  router.post('/match/cartola', async (req, res) => {
    const { imageBase64, mimeType } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'falta_imagen' });
    let cartola;
    try {
      const ex = await _extractCartola(imageBase64, mimeType || 'image/jpeg');
      // _extractCartola puede devolver array (líneas) o {lineas, saldo...}
      cartola = Array.isArray(ex) ? { lineas: ex, saldoInicial: null, saldoFinal: null } : ex;
    } catch (e) { return res.status(502).json({ error: 'ocr_cartola', detalle: e.message }); }

    const aux = await db.query(
      `SELECT * FROM expenses WHERE company_id=$1 AND estado <> 'anulado'`, [req.auth.companyId]
    );
    // banco contable = saldo de la cuenta Banco en el Mayor (debe - haber)
    const mayor = await libroMayor(db, req.auth.companyId, {});
    const banco = mayor.find((c) => c.clave === 'banco');
    const bancoContable = banco ? Number(banco.saldo) : 0;

    const informe = await construirInforme(
      { cartola, libroAuxiliar: aux.rows, bancoContable },
      { componer }
    );
    try { await matchRepo.guardarConciliacion(db, req.auth.companyId, 'bancaria', informe); } catch (e) { /* no romper */ }
    return res.json({ lineas: cartola.lineas, ...informe });
  });

  router.post('/match/asiento/confirmar', async (req, res) => {
    const s = req.body || {};
    const monto = Math.round(Number(s.monto) || 0);
    if (!s.cuentaClaveDebe || !s.cuentaClaveHaber || monto <= 0) return res.status(400).json({ error: 'asiento_invalido' });
    if (s.cuentaClaveDebe === s.cuentaClaveHaber) return res.status(400).json({ error: 'cuentas_iguales' });
    const debeId = await contaCuentas.getCuentaId(db, req.auth.companyId, s.cuentaClaveDebe);
    const haberId = await contaCuentas.getCuentaId(db, req.auth.companyId, s.cuentaClaveHaber);
    if (!debeId || !haberId) return res.status(400).json({ error: 'cuenta_no_encontrada' });
    const { guardarAsiento, buscarAsientoVivo } = require('../contabilidad/repo');
    const ref = 'concil-' + (s.id || require('crypto').createHash('sha1').update([s.fecha, s.monto, s.cuentaClaveDebe, s.cuentaClaveHaber, s.descripcion].join('|')).digest('hex').slice(0, 12));
    const previo = await buscarAsientoVivo(db, req.auth.companyId, 'conciliacion', ref, 'ajuste');
    if (previo) return res.json({ ok: true, asientoId: previo.id, yaExistia: true });
    const asiento = {
      origen: 'conciliacion', origen_ref: ref, tipo_asiento: 'ajuste',
      fecha: s.fecha || null, glosa: s.descripcion || 'Ajuste de conciliación',
      lineas: [
        { cuenta_id: debeId, debe: monto, haber: 0, glosa: s.descripcion || null },
        { cuenta_id: haberId, debe: 0, haber: monto, glosa: s.descripcion || null },
      ],
    };
    const saved = await guardarAsiento(db, req.auth.companyId, asiento);
    return res.json({ ok: true, asientoId: saved.id });
  });

  router.post('/match/confirmar', async (req, res) => {
    const ids = (req.body && Array.isArray(req.body.ids)) ? req.body.ids : [];
    let n = 0;
    for (const id of ids) {
      const exp = await getExpense(db, id);
      if (exp && exp.company_id === req.auth.companyId) {
        await markExpenseConciliada(db, req.auth.companyId, id);
        const expFresh = await getExpense(db, id);
        await aplicarContabilidad(db, req.auth.companyId, expFresh, 'pagar');
        n += 1;
      }
    }
    return res.json({ conciliadas: n });
  });

  router.post('/match/libro-sii', async (req, res) => {
    const { imageBase64, mimeType } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'falta_imagen' });
    let docs;
    try { docs = await _extractLibroSii(imageBase64, mimeType || 'image/jpeg'); }
    catch (e) { return res.status(502).json({ error: 'ocr_libro', detalle: e.message }); }
    const aux = await db.query(`SELECT * FROM expenses WHERE company_id=$1 AND estado <> 'anulado'`, [req.auth.companyId]);
    const informe = conciliarSii(docs, aux.rows);
    try { await matchRepo.guardarConciliacion(db, req.auth.companyId, 'sii', { sca: informe.iva.ivaPagarContable, sba: informe.iva.ivaPagarSii, cuadrado: informe.iva.diferenciaCredito === 0 && informe.iva.diferenciaDebito === 0, partidas: informe.faltantes, suggested: [], exceptions: informe.sobrantes }); } catch (e) { /* no romper */ }
    return res.json({ docs, ...informe });
  });

  router.post('/match/sii/crear-movimiento', async (req, res) => {
    const d = req.body || {};
    const total = Math.round(Number(d.total) || 0);
    if (!d.folio || total <= 0) return res.status(400).json({ error: 'doc_invalido' });
    const tipo = d.clase === 'venta' ? 'ingreso' : 'gasto';
    const cuenta = tipo === 'gasto' ? mapCategoryToSii(d.categoria || 'Otros gastos') : null;
    const expense = await createExpense(db, {
      company_id: req.auth.companyId, employee_id: req.auth.employeeId, canal: 'app', estado: 'confirmado',
      tipo, tipo_documento: d.tipo_doc || 'factura', rut_emisor: d.rut || null, folio: String(d.folio),
      fecha: d.fecha || null, neto: Math.round(Number(d.neto) || 0), iva: Math.round(Number(d.iva) || 0), total,
      categoria: tipo === 'gasto' ? (d.categoria || 'Otros gastos') : null,
      cuenta_sii_codigo: cuenta ? cuenta.codigo : null, cuenta_sii_nombre: cuenta ? cuenta.nombre : null,
      glosa: 'Registrado desde libro SII',
    });
    await aplicarContabilidad(db, req.auth.companyId, expense, 'confirmar');
    return res.json({ ok: true, expenseId: expense.id });
  });

  router.get('/expenses', async (req, res) => {
    const r = await db.query(
      `SELECT * FROM expenses WHERE company_id=$1 AND employee_id=$2 AND estado <> 'anulado' ORDER BY created_at DESC LIMIT 50`,
      [req.auth.companyId, req.auth.employeeId]
    );
    return res.json(r.rows);
  });

  // Exporta a Excel los movimientos filtrados. El cliente manda los IDs visibles
  // (los que quedaron tras aplicar sus filtros); si no manda ninguno, exporta todos.
  router.post('/expenses/export', async (req, res) => {
    try {
      const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.filter(Boolean).slice(0, 3000) : [];
      const r = ids.length
        ? await db.query("SELECT * FROM expenses WHERE company_id=$1 AND employee_id=$2 AND id = ANY($3::uuid[]) ORDER BY fecha DESC NULLS LAST, created_at DESC", [req.auth.companyId, req.auth.employeeId, ids])
        : await db.query("SELECT * FROM expenses WHERE company_id=$1 AND employee_id=$2 AND estado <> 'anulado' ORDER BY created_at DESC", [req.auth.companyId, req.auth.employeeId]);
      const buf = await buildExpensesWorkbook(r.rows);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="movimientos.xlsx"');
      res.end(buf);
    } catch (e) {
      console.error('[expenses/export]', e.message);
      res.status(500).json({ error: 'export_error' });
    }
  });

  router.get('/suscripcion', async (req, res) => {
    try {
      const s = await saldoCreditos(db, req.auth.companyId);
      res.json(s);
    } catch (e) {
      res.status(500).json({ error: 'saldo_error' });
    }
  });

  // Email del pagador para el checkout desde el APK: dueño (userId) o, en cuentas
  // personales, el usuario del empleado (que es su email); si no, owner_email.
  async function emailDelPagador(auth) {
    if (auth.userId) { try { const u = await getUserById(db, auth.userId); if (u && u.email) return u.email; } catch (_) {} }
    if (auth.employeeId) {
      try { const r = await db.query('SELECT usuario FROM employees WHERE id=$1', [auth.employeeId]); const u = r.rows[0] && r.rows[0].usuario; if (u && /@/.test(u)) return u; } catch (_) {}
    }
    try { const r = await db.query('SELECT owner_email FROM companies WHERE id=$1', [auth.companyId]); return (r.rows[0] && r.rows[0].owner_email) || null; } catch (_) { return null; }
  }

  // Crea el checkout de suscripción DESDE EL APK y devuelve la URL de pago
  // (MercadoPago para CLP, PayPal para USD/EUR). El usuario paga en el navegador.
  router.post('/suscripcion/crear', async (req, res) => {
    const { plan, moneda = 'CLP' } = req.body || {};
    if (!plan || !['basico', 'pyme', 'empresa'].includes(plan)) return res.status(400).json({ error: 'plan_invalido' });
    if (!monedasSoportadas().includes(moneda)) return res.status(400).json({ error: 'moneda_invalida' });
    const sub = await saldoCreditos(db, req.auth.companyId);
    if (sub.plan === 'ilimitado') return res.status(409).json({ error: 'plan_especial' });
    if (sub.estado === 'activa' && sub.plan === plan) return res.status(409).json({ error: 'ya_activa' });
    const email = await emailDelPagador(req.auth);
    if (!email) return res.status(400).json({ error: 'email_requerido' });
    const proc = procesadorPara(moneda);
    const base = process.env.PANEL_BASE_URL || 'https://gastos.atikodigital.cl';
    try {
      let id, url;
      if (proc === 'mp') {
        const result = await createPreapproval(plan, `${base}/panel/#plan`, email, req.auth.companyId);
        id = result.id; url = result.init_point;
      } else {
        const result = await crearSuscripcionPaypal({ plan, moneda, payerEmail: email, returnUrl: `${base}/panel/#plan`, cancelUrl: `${base}/panel/#plan`, companyId: req.auth.companyId, db });
        id = result.id; url = result.url;
      }
      try { await db.query(`UPDATE subscriptions SET external_id=$2, procesador=$3, moneda=$4, updated_at=now() WHERE company_id=$1`, [req.auth.companyId, id, proc, moneda]); } catch (_) {}
      console.log(`[billing/app] ${proc} checkout`, id, 'empresa', req.auth.companyId, 'plan', plan);
      return res.json({ url });
    } catch (e) {
      console.error('[billing/app] error checkout:', e.message);
      if (/Payer and collector cannot be the same/i.test(String(e.message || ''))) {
        return res.status(409).json({ error: 'payer_es_colector', mensaje: 'No puedes suscribirte con el mismo correo que recibe los pagos. Usa otro correo.' });
      }
      return res.status(502).json({ error: 'pago_error' });
    }
  });

  return router;
}

module.exports = { createAppRouter };
