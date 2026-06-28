/**
 * Onboarding BSP de Hash IA — clientes terceros se registran solos y conectan su WhatsApp.
 *
 *   POST /api/onboarding/register             → crea company + user owner, devuelve JWT
 *   POST /api/onboarding/connect/whatsapp     → guarda wa_phone_number_id + wa_token en su company
 *   POST /api/onboarding/connect/facebook     → idem para Messenger/Instagram (futuro multi-canal)
 *   GET  /api/onboarding/oauth/callback       → público; recibe ?code & ?state de Meta y redirige al app
 *   GET  /api/onboarding/bsp-status           → reporta si APP_SECRET + config_id están configurados
 */
const crypto = require('crypto');
const express = require('express');
const mc = require('./meta-connect');
const { createCompany, getCompany, updateCompany, createEmployee, getEmployeeByUsuario, getEmployeeByProvider, linkProviderEmployee } = require('../companies/repo');
const { createUser, getUserByEmail, getUserByProvider, linkProvider } = require('../users/repo');
const { hashPassword } = require('../auth/password');
const { signToken, verifyToken } = require('../auth/jwt');
const { sendEmail } = require('../notifications/email');
const { sendText: waSendText } = require('../whatsapp/client');
const { verifyGoogleIdToken, verifyFacebookToken } = require('../auth/oauth');

// ¿A esta empresa le falta completar sus datos (nombre/dueño/contacto)?
async function companyNeedsSetup(db, companyId) {
  try {
    const r = await db.query('SELECT needs_setup FROM companies WHERE id=$1', [companyId]);
    return !!(r.rows[0] && r.rows[0].needs_setup);
  } catch (e) { return false; }
}

// Encuentra o crea la cuenta a partir del perfil verificado del proveedor social.
// 1) por id de proveedor (ya entró antes) → login.  2) por email (ya tenía cuenta
// por correo) → enlaza el proveedor y login.  3) nuevo → crea empresa (needs_setup)
// + usuario owner. La empresa nueva nace con nombre provisional; el frontend pide
// el nombre real justo después (needsBusinessName=true).
async function findOrCreateSocialUser(db, perfil) {
  const { provider, providerId, email, name } = perfil;
  // La identidad estable es el id del proveedor (providerId), no el correo. El correo
  // es OPCIONAL: Google siempre lo entrega; Facebook (con sólo public_profile, sin el
  // permiso `email` que en Business Login da problemas) puede no darlo. En ese caso
  // identificamos al usuario por su facebook_id y pedimos el WhatsApp en el formulario.
  if (!providerId) { const err = new Error('sin_identidad'); err.code = 'sin_identidad'; throw err; }
  // needsBusinessName depende de si a la empresa le faltan datos (needs_setup),
  // NO de si es login nuevo: si creó la cuenta pero no completó el formulario,
  // se lo volvemos a pedir en el próximo ingreso.
  // 1) por id de proveedor
  let user = await getUserByProvider(db, provider, providerId);
  if (user) {
    const company = await getCompany(db, user.company_id);
    return { user, company, needsBusinessName: await companyNeedsSetup(db, user.company_id) };
  }
  // 2) por email (enlazar al que ya existía por correo)
  if (email) {
    const existing = await getUserByEmail(db, email);
    if (existing) {
      user = (await linkProvider(db, existing.id, provider, providerId)) || existing;
      const company = await getCompany(db, user.company_id);
      return { user, company, needsBusinessName: await companyNeedsSetup(db, user.company_id) };
    }
  }
  // 3) cuenta nueva: empresa provisional + usuario owner social
  const company = await createCompany(db, {
    nombre: (name ? String(name).trim().slice(0, 120) : 'Mi negocio') || 'Mi negocio',
    owner_nombre: name ? String(name).trim().slice(0, 80) : null,
    resumen_frecuencia: 'mensual',
  });
  try { await db.query('UPDATE companies SET needs_setup=true WHERE id=$1', [company.id]); } catch (e) { /* col nueva */ }
  user = await createUser(db, {
    company_id: company.id,
    email: email || null,
    rol: 'owner',
    auth_provider: provider,
    [provider === 'google' ? 'google_sub' : 'facebook_id']: providerId,
  });
  return { user, company, needsBusinessName: true };
}

function tokenParaUsuario(user) {
  return signToken({ kind: 'user', companyId: user.company_id, userId: user.id, rol: user.rol || 'owner' });
}

function tokenParaEmpleado(emp) {
  return signToken({ kind: 'employee', companyId: emp.company_id, employeeId: emp.id });
}

// Igual que findOrCreateSocialUser pero para cuentas PERSONALES: la cuenta vive en
// employees (kind=employee, lo que exige la app personal). La empresa nace con
// tipo_cuenta='personal' y sueldo 0 (needs_setup=true) — el ingreso se pide después
// y es saltable. Identidad estable = id del proveedor (google_sub/facebook_id).
async function findOrCreatePersonalSocialUser(db, perfil) {
  const { provider, providerId, email, name } = perfil;
  if (!providerId) { const err = new Error('sin_identidad'); err.code = 'sin_identidad'; throw err; }
  // 1) por id de proveedor (ya entró antes)
  let emp = await getEmployeeByProvider(db, provider, providerId);
  if (emp) {
    const company = await getCompany(db, emp.company_id);
    return { employee: emp, company, needsIncome: await companyNeedsSetup(db, emp.company_id) };
  }
  // 2) por correo (ya tenía cuenta personal por email → enlazar el proveedor)
  if (email) {
    const existing = await getEmployeeByUsuario(db, email);
    if (existing) {
      emp = (await linkProviderEmployee(db, existing.id, provider, providerId)) || existing;
      const company = await getCompany(db, emp.company_id);
      return { employee: emp, company, needsIncome: await companyNeedsSetup(db, emp.company_id) };
    }
  }
  // 3) cuenta personal nueva: empresa personal provisional + empleado admin social
  const company = await createCompany(db, {
    nombre: name ? String(name).trim().slice(0, 120) : 'Mi cuenta',
    tipo_cuenta: 'personal',
    sueldo_mensual: 0,
    dia_pago: 1,
  });
  try { await db.query('UPDATE companies SET needs_setup=true WHERE id=$1', [company.id]); } catch (e) { /* col nueva */ }
  emp = await createEmployee(db, {
    company_id: company.id,
    nombre: name ? String(name).trim().slice(0, 80) : 'Yo',
    usuario: email || null,
    rol: 'admin',
    activo: true,
    auth_provider: provider,
    [provider === 'google' ? 'google_sub' : 'facebook_id']: providerId,
  });
  return { employee: emp, company, needsIncome: true };
}

// Lee la intención de registro ('personal' | 'negocio') desde cookie, query o body.
// Web: cookie `signup_tipo` (Google redirect) o `state` (Facebook). APK: body.tipo.
function intentTipo(req) {
  const fromBody = req.body && req.body.tipo;
  const fromQuery = req.query && req.query.tipo;
  const fromState = req.query && req.query.state && String(req.query.state).indexOf('personal') > -1 ? 'personal' : null;
  const fromCookie = leerCookie(req.headers.cookie, 'signup_tipo');
  return (fromBody || fromQuery || fromState || fromCookie) === 'personal' ? 'personal' : 'negocio';
}

// Lee una cookie puntual del header Cookie (sin dependencias).
function leerCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  for (const p of String(cookieHeader).split(';')) {
    const i = p.indexOf('=');
    if (i > -1 && p.slice(0, i).trim() === name) return decodeURIComponent(p.slice(i + 1).trim());
  }
  return null;
}

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
      // El nombre del negocio es OPCIONAL: si no viene, se pide DESPUÉS de entrar
      // (mismo formulario que el login social), creando la empresa con needs_setup.
      if (!email || !password) {
        return res.status(400).json({ error: 'email y password son obligatorios' });
      }
      if (String(password).length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
      }
      const emailNorm = String(email).trim().toLowerCase();
      const existing = await getUserByEmail(db, emailNorm);
      if (existing) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });

      const diferido = !nombre_negocio;
      const company = await createCompany(db, {
        nombre: nombre_negocio ? String(nombre_negocio).trim().slice(0, 120) : 'Mi negocio',
        owner_nombre: nombre_owner ? String(nombre_owner).trim().slice(0, 80) : null,
        owner_whatsapp: owner_whatsapp ? String(owner_whatsapp).replace(/[^+\d]/g, '').slice(0, 20) : null,
        resumen_frecuencia: 'mensual',
      });
      if (diferido) { try { await db.query('UPDATE companies SET needs_setup=true WHERE id=$1', [company.id]); } catch (e) { /* col nueva */ } }
      const passwordHash = await hashPassword(password);
      const user = await createUser(db, {
        company_id: company.id, email: emailNorm, password_hash: passwordHash, rol: 'owner',
      });
      const token = signToken({ kind: 'user', companyId: company.id, userId: user.id, rol: 'owner' });
      res.json({
        ok: true,
        token,
        needsBusinessName: diferido,
        user: { id: user.id, email: user.email, rol: user.rol, companyId: company.id },
        company: { id: company.id, nombre: company.nombre },
      });
    } catch (e) {
      console.error('[onboarding/register]', e.message);
      res.status(500).json({ error: 'No se pudo crear la cuenta' });
    }
  });

  // ── PÚBLICO: auto-registro persona natural ─────────────────────────
  router.post('/register-personal', async (req, res) => {
    try {
      const { nombre, email, password, sueldo_mensual, dia_pago } = req.body || {};
      if (!nombre || !email || !password || String(password).length < 6) {
        return res.status(400).json({ error: 'campos_requeridos' });
      }
      const sueldoNum = parseInt(sueldo_mensual);
      if (!sueldoNum || sueldoNum <= 0) {
        return res.status(400).json({ error: 'sueldo_invalido' });
      }
      const emailNorm = String(email).trim().toLowerCase();

      const { rows: [existing] } = await db.query(
        'SELECT id FROM employees WHERE usuario=$1', [emailNorm]
      );
      if (existing) return res.status(400).json({ error: 'email_en_uso' });

      const company = await createCompany(db, {
        nombre: String(nombre).trim().slice(0, 120),
        tipo_cuenta: 'personal',
        sueldo_mensual: sueldoNum,
        dia_pago: parseInt(dia_pago) || 1,
      });

      const hash = await hashPassword(password);
      const emp = await createEmployee(db, {
        company_id: company.id,
        nombre: String(nombre).trim().slice(0, 80),
        usuario: emailNorm,
        password_hash: hash,
        rol: 'admin',
        activo: true,
      });

      const token = signToken({ kind: 'employee', companyId: company.id, employeeId: emp.id });
      res.json({ ok: true, token, employee: { id: emp.id, nombre: emp.nombre } });
    } catch (e) {
      console.error('[onboarding/register-personal]', e.message);
      res.status(500).json({ error: 'No se pudo crear la cuenta' });
    }
  });

  // ── PÚBLICO: auto-registro de negocio desde la APP (modelo "empleado") ──
  // La APK loguea empleados (/api/app/login). Aquí el dueño crea su negocio +
  // su login admin y entra directo; el OnboardingWizard completa el resto.
  router.post('/register-app', async (req, res) => {
    try {
      const b = req.body || {};
      const nombre = String(b.nombre || '').trim();
      const email = String(b.email || b.usuario || '').trim().toLowerCase();
      const password = String(b.password || '');
      const whatsapp = b.whatsapp ? String(b.whatsapp).replace(/[^+\d]/g, '').slice(0, 20) : null;
      if (nombre.length < 2) return res.status(400).json({ error: 'nombre_invalido' });
      if (!email || !/.+@.+\..+/.test(email)) return res.status(400).json({ error: 'email_invalido' });
      if (password.length < 8) return res.status(400).json({ error: 'password_corto' });
      const existe = await getEmployeeByUsuario(db, email);
      if (existe) return res.status(409).json({ error: 'email_en_uso' });

      const company = await createCompany(db, {
        nombre: nombre.slice(0, 120),
        owner_nombre: nombre.slice(0, 80),
        owner_whatsapp: whatsapp,
        resumen_frecuencia: 'mensual',
      });
      const passwordHash = await hashPassword(password);
      const emp = await createEmployee(db, {
        company_id: company.id, nombre: nombre.slice(0, 80), usuario: email,
        password_hash: passwordHash, rol: 'admin', activo: true,
      });
      const token = signToken({ kind: 'employee', companyId: company.id, employeeId: emp.id });
      res.json({ ok: true, token, employee: { id: emp.id, nombre: emp.nombre }, company: { id: company.id, nombre: company.nombre } });
    } catch (e) {
      console.error('[onboarding/register-app]', e.message);
      res.status(500).json({ error: 'No se pudo crear la cuenta' });
    }
  });

  // ── PÚBLICO: login/registro con Google ────────────────────────────
  // El cliente manda el ID token de Google; lo verificamos server-side.
  router.post('/oauth/google', async (req, res) => {
    try {
      const idToken = (req.body && (req.body.idToken || req.body.credential)) || null;
      if (!idToken) return res.status(400).json({ error: 'falta_id_token' });
      let perfil;
      try { perfil = await verifyGoogleIdToken(idToken); }
      catch (e) { return res.status(401).json({ error: 'google_invalido', detalle: e.message }); }
      if (!perfil.email) return res.status(422).json({ error: 'sin_email', mensaje: 'No pudimos obtener tu correo. Regístrate con email.' });
      if (intentTipo(req) === 'personal') {
        const { employee, company, needsIncome } = await findOrCreatePersonalSocialUser(db, perfil);
        return res.json({ ok: true, token: tokenParaEmpleado(employee), tipo: 'personal', needsIncome, company: { id: company.id, nombre: company.nombre } });
      }
      const { user, company, needsBusinessName } = await findOrCreateSocialUser(db, perfil);
      return res.json({
        ok: true,
        token: tokenParaUsuario(user),
        needsBusinessName,
        user: { id: user.id, email: user.email, rol: user.rol, companyId: user.company_id },
        company: { id: company.id, nombre: company.nombre },
      });
    } catch (e) {
      console.error('[onboarding/oauth/google]', e.message);
      res.status(500).json({ error: 'No se pudo iniciar sesión con Google' });
    }
  });

  // ── PÚBLICO: login con Google en modo REDIRECCIÓN (sin popup) ─────
  // Más robusto que el popup (no depende de cookies de terceros, que Chrome/McAfee
  // suelen bloquear). Google hace POST (form) con `credential` a este login_uri;
  // verificamos y redirigimos al panel con el JWT en el fragmento (#sso=...).
  router.post('/oauth/google-redirect', async (req, res) => {
    const panel = (process.env.PANEL_BASE_URL || 'https://gastos.atikodigital.cl') + '/panel/';
    try {
      const idToken = (req.body && req.body.credential) || null;
      if (!idToken) return res.redirect(panel + '#sso_error=falta_token');
      // CSRF doble-submit de Google (cookie == body), si viene.
      const bodyCsrf = req.body && req.body.g_csrf_token;
      const cookieCsrf = leerCookie(req.headers.cookie, 'g_csrf_token');
      if (bodyCsrf && cookieCsrf && bodyCsrf !== cookieCsrf) {
        return res.redirect(panel + '#sso_error=csrf');
      }
      let perfil;
      try { perfil = await verifyGoogleIdToken(idToken); }
      catch (e) { return res.redirect(panel + '#sso_error=google_invalido'); }
      if (!perfil.email) return res.redirect(panel + '#sso_error=sin_email');
      if (intentTipo(req) === 'personal') {
        const { employee, needsIncome } = await findOrCreatePersonalSocialUser(db, perfil);
        return res.redirect(panel + '#sso=' + encodeURIComponent(tokenParaEmpleado(employee)) + '&perfil=personal&income=' + (needsIncome ? '1' : '0'));
      }
      const { user, needsBusinessName } = await findOrCreateSocialUser(db, perfil);
      const token = tokenParaUsuario(user);
      const nombreQs = (needsBusinessName && perfil.name) ? '&nombre=' + encodeURIComponent(perfil.name) : '';
      return res.redirect(panel + '#sso=' + encodeURIComponent(token) + '&new=' + (needsBusinessName ? '1' : '0') + nombreQs);
    } catch (e) {
      console.error('[oauth/google-redirect]', e.message);
      return res.redirect(panel + '#sso_error=server');
    }
  });

  // ── PÚBLICO: login con Facebook en modo REDIRECCIÓN ───────────────
  // Flujo OAuth 2.0 estándar: GET /oauth/facebook-start redirige a Meta,
  // Meta devuelve ?code al callback /oauth/facebook-callback, el backend
  // canjea el code por un access_token, verifica el perfil y redirige al
  // panel con el JWT en el fragmento (#sso=...&new=...).
  router.get('/oauth/facebook-start', (req, res) => {
    const appId = process.env.FB_APP_ID || process.env.META_APP_ID;
    if (!appId) return res.status(503).send('Facebook no configurado');
    const panel = (process.env.PANEL_BASE_URL || 'https://gastos.atikodigital.cl') + '/panel/';
    const redirectUri = (process.env.PANEL_BASE_URL || 'https://gastos.atikodigital.cl') + '/api/onboarding/oauth/facebook-callback';
    const tipo = (req.query && req.query.tipo) === 'personal' ? 'personal' : 'negocio';
    const url = 'https://www.facebook.com/v19.0/dialog/oauth'
      + '?client_id=' + encodeURIComponent(appId)
      + '&redirect_uri=' + encodeURIComponent(redirectUri)
      + '&scope=public_profile'
      + '&state=' + encodeURIComponent('tipo:' + tipo)
      + '&response_type=code';
    res.redirect(url);
  });

  router.get('/oauth/facebook-callback', async (req, res) => {
    const panel = (process.env.PANEL_BASE_URL || 'https://gastos.atikodigital.cl') + '/panel/';
    const redirectUri = (process.env.PANEL_BASE_URL || 'https://gastos.atikodigital.cl') + '/api/onboarding/oauth/facebook-callback';
    const { code, error } = req.query || {};
    if (error || !code) return res.redirect(panel + '#sso_error=facebook_cancelado');
    try {
      const appId = process.env.FB_APP_ID || process.env.META_APP_ID;
      const appSecret = process.env.FB_APP_SECRET || process.env.META_APP_SECRET;
      // 1) Canjear code por access_token
      const tokUrl = 'https://graph.facebook.com/v19.0/oauth/access_token'
        + '?client_id=' + encodeURIComponent(appId)
        + '&redirect_uri=' + encodeURIComponent(redirectUri)
        + '&client_secret=' + encodeURIComponent(appSecret)
        + '&code=' + encodeURIComponent(code);
      const tokRes = await fetch(tokUrl);
      const tokData = await tokRes.json();
      if (!tokData.access_token) return res.redirect(panel + '#sso_error=facebook_token');
      // 2) Verificar token y obtener perfil
      let perfil;
      try { perfil = await verifyFacebookToken(tokData.access_token); }
      catch (e) { return res.redirect(panel + '#sso_error=facebook_invalido'); }
      // El correo es opcional para Facebook (sólo pedimos public_profile): identidad = facebook_id.
      if (intentTipo(req) === 'personal') {
        const { employee, needsIncome } = await findOrCreatePersonalSocialUser(db, perfil);
        return res.redirect(panel + '#sso=' + encodeURIComponent(tokenParaEmpleado(employee)) + '&perfil=personal&income=' + (needsIncome ? '1' : '0') + '&via=fb');
      }
      const { user, needsBusinessName } = await findOrCreateSocialUser(db, perfil);
      const token = tokenParaUsuario(user);
      const nombreQs = (needsBusinessName && perfil.name) ? '&nombre=' + encodeURIComponent(perfil.name) : '';
      return res.redirect(panel + '#sso=' + encodeURIComponent(token) + '&new=' + (needsBusinessName ? '1' : '0') + nombreQs + '&via=fb');
    } catch (e) {
      console.error('[oauth/facebook-callback]', e.message);
      return res.redirect(panel + '#sso_error=server');
    }
  });

  // ── PÚBLICO: login/registro con Facebook ──────────────────────────
  router.post('/oauth/facebook', async (req, res) => {
    try {
      const accessToken = (req.body && (req.body.accessToken || req.body.token)) || null;
      if (!accessToken) return res.status(400).json({ error: 'falta_access_token' });
      let perfil;
      try { perfil = await verifyFacebookToken(accessToken); }
      catch (e) { return res.status(401).json({ error: 'facebook_invalido', detalle: e.message }); }
      // Correo opcional para Facebook (sólo public_profile): identidad = facebook_id.
      if (intentTipo(req) === 'personal') {
        const { employee, company, needsIncome } = await findOrCreatePersonalSocialUser(db, perfil);
        return res.json({ ok: true, token: tokenParaEmpleado(employee), tipo: 'personal', needsIncome, company: { id: company.id, nombre: company.nombre } });
      }
      const { user, company, needsBusinessName } = await findOrCreateSocialUser(db, perfil);
      return res.json({
        ok: true,
        token: tokenParaUsuario(user),
        needsBusinessName,
        user: { id: user.id, email: user.email, rol: user.rol, companyId: user.company_id },
        company: { id: company.id, nombre: company.nombre },
      });
    } catch (e) {
      console.error('[onboarding/oauth/facebook]', e.message);
      res.status(500).json({ error: 'No se pudo iniciar sesión con Facebook' });
    }
  });

  // ── PRIVADO: completar datos del negocio tras un registro social ──
  // El dueño completa: nombre del negocio, su nombre y su número de contacto.
  router.post('/business-name', requireAuth, async (req, res) => {
    try {
      const b = req.body || {};
      const nombre = String(b.nombre || '').trim();
      if (nombre.length < 2) return res.status(400).json({ error: 'nombre_invalido' });
      const patch = { nombre: nombre.slice(0, 120) };
      if (b.owner_nombre) patch.owner_nombre = String(b.owner_nombre).trim().slice(0, 80);
      if (b.owner_whatsapp) patch.owner_whatsapp = String(b.owner_whatsapp).replace(/[^+\d]/g, '').slice(0, 20);
      await updateCompany(db, req.user.companyId, patch);
      try { await db.query('UPDATE companies SET needs_setup=false WHERE id=$1', [req.user.companyId]); } catch (e) {}
      const company = await getCompany(db, req.user.companyId);
      return res.json({ ok: true, company: { id: company.id, nombre: company.nombre } });
    } catch (e) {
      console.error('[onboarding/business-name]', e.message);
      res.status(500).json({ error: 'No se pudo guardar' });
    }
  });

  // ── PRIVADO: completar el ingreso tras un registro PERSONAL social ──
  // La cuenta personal (empleado) nace con sueldo 0; aquí se guarda el ingreso.
  // Es saltable: si el usuario no lo pone, queda en 0 hasta que lo configure.
  router.post('/personal-income', requireAuth, async (req, res) => {
    try {
      const sueldo = parseInt((req.body && req.body.sueldo_mensual), 10);
      if (!sueldo || sueldo <= 0) return res.status(400).json({ error: 'sueldo_invalido' });
      await updateCompany(db, req.user.companyId, { sueldo_mensual: sueldo });
      try { await db.query('UPDATE companies SET needs_setup=false WHERE id=$1', [req.user.companyId]); } catch (e) {}
      return res.json({ ok: true });
    } catch (e) {
      console.error('[onboarding/personal-income]', e.message);
      res.status(500).json({ error: 'No se pudo guardar' });
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

  // ── PÚBLICO: solicitar link de recuperación de contraseña ────────────
  // Acepta { identificador } que puede ser email o número de WhatsApp.
  // Envía el link por email Y WhatsApp según lo que tengamos. Siempre responde ok
  // para no revelar si la cuenta existe.
  router.post('/forgot-password', async (req, res) => {
    const PANEL = (process.env.PANEL_BASE_URL || 'https://gastos.atikodigital.cl') + '/panel/';
    try {
      const ident = String((req.body && req.body.identificador) || '').trim().toLowerCase();
      if (!ident) return res.status(400).json({ error: 'identificador_requerido' });

      // Buscar usuario por email o por WhatsApp del dueño de empresa.
      // waPhoneId/waToken: credenciales de WhatsApp que la propia empresa conectó;
      // las reusamos para enviarle el link a su dueño (no hay número central del sistema).
      // subject: a quién le restablecemos la clave — 'user' (dueño del panel) o
      // 'employee' (login de la APK). companyId nos da el WhatsApp para enviar el link.
      let subject = null, company = null, destEmail = null, destWa = null, waPhoneId = null, waToken = null;
      // Intento 1: dueño (panel) por email exacto
      const byEmail = await getUserByEmail(db, ident);
      if (byEmail) {
        subject = { kind: 'user', id: byEmail.id, companyId: byEmail.company_id };
        company = await getCompany(db, byEmail.company_id);
        destEmail = byEmail.email;
      } else {
        // Intento 2: dueño (panel) por WhatsApp de la empresa
        const phone = ident.replace(/[^+\d]/g, '');
        if (phone.length >= 8) {
          const r = await db.query(
            'SELECT c.id as cid, u.id as uid, u.email FROM companies c JOIN users u ON u.company_id=c.id WHERE c.owner_whatsapp=$1 LIMIT 1',
            [phone]
          );
          if (r.rows[0]) {
            subject = { kind: 'user', id: r.rows[0].uid, companyId: r.rows[0].cid };
            company = await getCompany(db, r.rows[0].cid);
            destEmail = r.rows[0].email;
          }
        }
        // Intento 3: empleado (APK) por su usuario (suele ser el email)
        if (!subject) {
          const emp = await getEmployeeByUsuario(db, ident);
          if (emp) {
            subject = { kind: 'employee', id: emp.id, companyId: emp.company_id };
            company = await getCompany(db, emp.company_id);
            destEmail = /.+@.+\..+/.test(emp.usuario) ? emp.usuario : null;
          }
        }
      }

      // Responder ok siempre — no revelar si existe
      if (!subject) return res.json({ ok: true });
      if (company) {
        destWa = destWa || company.owner_whatsapp;
        waPhoneId = company.wa_phone_number_id;
        waToken = company.wa_token;
      }

      // Generar token seguro, guardar su hash en DB
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
      await db.query(
        'INSERT INTO password_resets(user_id, token_hash, expires_at, subject_kind) VALUES($1,$2,$3,$4)',
        [subject.id, tokenHash, expiresAt, subject.kind]
      );

      const resetUrl = PANEL + '?reset=' + rawToken;
      const msgText = `Hola! Recibiste una solicitud para restablecer tu contraseña de Hash IA.\n\nTu link (válido 1 hora):\n${resetUrl}\n\nSi no lo pediste, ignora este mensaje.`;

      // Enviar por email
      if (destEmail) {
        await sendEmail({
          to: destEmail,
          subject: 'Restablecer contraseña — Hash IA',
          text: msgText,
          html: `<p>Hola,</p><p>Recibiste una solicitud para restablecer tu contraseña de <strong>Hash IA</strong>.</p><p><a href="${resetUrl}" style="background:#6C3CE1;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Restablecer contraseña</a></p><p style="color:#888;font-size:12px;">Este link es válido por 1 hora. Si no lo pediste, ignora este mensaje.</p>`,
        });
      }
      // Enviar por WhatsApp: preferimos un número central del sistema si está
      // configurado; si no, usamos el WhatsApp que la propia empresa conectó.
      const phoneId = process.env.SYSTEM_WA_PHONE_NUMBER_ID || waPhoneId;
      const tok = process.env.SYSTEM_WA_TOKEN || waToken;
      if (destWa && phoneId && tok) {
        try {
          await waSendText({ to: destWa, body: msgText, token: tok, phoneNumberId: phoneId });
        } catch (e) { console.error('[forgot-password/wa]', e.message); }
      }

      return res.json({ ok: true });
    } catch (e) {
      console.error('[forgot-password]', e.message);
      return res.json({ ok: true }); // no revelar errores internos
    }
  });

  // ── PÚBLICO: confirmar el token y guardar la nueva contraseña ─────────
  router.post('/reset-password', async (req, res) => {
    try {
      const { token, nueva_password } = req.body || {};
      if (!token || !nueva_password) return res.status(400).json({ error: 'faltan_campos' });
      if (String(nueva_password).length < 8) return res.status(400).json({ error: 'password_corto' });

      const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
      const r = await db.query(
        'SELECT id, user_id, expires_at, used_at, subject_kind FROM password_resets WHERE token_hash=$1',
        [tokenHash]
      );
      const row = r.rows[0];
      if (!row) return res.status(400).json({ error: 'token_invalido' });
      if (row.used_at) return res.status(400).json({ error: 'token_ya_usado' });
      if (new Date(row.expires_at) < new Date()) return res.status(400).json({ error: 'token_expirado' });

      const hash = await hashPassword(String(nueva_password));
      // Restablecemos en la tabla correcta según el tipo de cuenta.
      const tabla = row.subject_kind === 'employee' ? 'employees' : 'users';
      await db.query(`UPDATE ${tabla} SET password_hash=$1 WHERE id=$2`, [hash, row.user_id]);
      await db.query('UPDATE password_resets SET used_at=now() WHERE id=$1', [row.id]);

      return res.json({ ok: true });
    } catch (e) {
      console.error('[reset-password]', e.message);
      return res.status(500).json({ error: 'server_error' });
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

module.exports = { createOnboardingRouter, findOrCreateSocialUser, findOrCreatePersonalSocialUser };
