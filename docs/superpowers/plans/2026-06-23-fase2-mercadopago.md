# Fase 2 — Mercado Pago (Suscripciones web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que el dueño de una pyme pague una suscripción mensual recurrente a Hash IA desde el panel web usando Mercado Pago Preapproval, con activación automática vía webhook.

**Architecture:** Cliente MP en `billing/mp.js` + procesador de eventos en `billing/webhook-mp.js` + endpoint público en `server.js` (igual al patrón de WhatsApp webhook). El panel web agrega pestaña "Mi Plan" con cards de planes. Todo en CommonJS.

**Tech Stack:** Node.js + Express + `node-fetch` para llamar MP API; `crypto` nativo para validar firma HMAC-SHA256 del webhook; pg-mem para tests.

---

## Estructura de archivos

```
gastos/src/billing/
  planes.js          ← MODIFICAR: agregar precios por plan
  repo.js            ← MODIFICAR: agregar activarSuscripcion
  mp.js              ← CREAR: cliente MP preapproval
  webhook-mp.js      ← CREAR: procesar eventos MP + validar firma

gastos/src/server.js ← MODIFICAR: montar POST /api/pagos/mp/webhook
gastos/src/panel/router.js ← MODIFICAR: POST /suscripcion/crear
gastos/src/whatsapp/webhook.js ← MODIFICAR: upgrade link en SinCreditosError
gastos/public/panel/index.html ← MODIFICAR: pestaña Mi Plan

gastos/tests/billing/mp.test.js          ← CREAR
gastos/tests/billing/webhook-mp.test.js  ← CREAR
```

---

## Task 15: Agregar precios a planes.js

**Files:**
- Modify: `gastos/src/billing/planes.js`
- Test: `gastos/tests/billing/mp.test.js` (se usa en T16)

Los precios son necesarios para que `mp.js` pueda crear el preapproval sin hardcodear.

- [ ] **Abrir `gastos/src/billing/planes.js` y agregar `precio` a cada plan:**

```js
const PLANES = {
  free:      { nombre: 'free',      creditos: 30,        precio: 0     },
  basico:    { nombre: 'basico',    creditos: 100,       precio: 9900  },
  pyme:      { nombre: 'pyme',      creditos: 210,       precio: 24900 },
  empresa:   { nombre: 'empresa',   creditos: 600,       precio: 49900 },
  ilimitado: { nombre: 'ilimitado', creditos: 100000000, precio: 0     },
};
```

- [ ] **Actualizar `module.exports` para exportar también `PLAN_LABELS`:**

Agregar al final del archivo (antes de `module.exports`):

```js
const PLAN_LABELS = {
  free:      'Hash IA Free',
  basico:    'Hash IA Básico',
  pyme:      'Hash IA Pyme',
  empresa:   'Hash IA Empresa',
  ilimitado: 'Hash IA Especial',
};
```

Y actualizar:
```js
module.exports = { PLANES, PESOS, getPlan, creditosDe, PLAN_LABELS };
```

- [ ] **Verificar que los tests existentes siguen pasando:**

```bash
cd gastos && npm test -- --testPathPattern=billing/planes 2>&1 | tail -5
```

Esperado: no hay test de planes actualmente → OK (no falla).

- [ ] **Commit:**

```bash
git add gastos/src/billing/planes.js
git commit -m "feat(billing): agregar precio y etiqueta por plan para MP preapproval"
```

---

## Task 16: billing/repo.js — activarSuscripcion

**Files:**
- Modify: `gastos/src/billing/repo.js`
- Test: inline en `gastos/tests/billing/webhook-mp.test.js` (T18)

`activarSuscripcion` es el único punto que activa/renueva/actualiza una suscripción proveniente de MP. `resetCiclo` ya existe pero no maneja `external_id`, `source`, ni `ciclo_fin`.

- [ ] **Agregar `activarSuscripcion` a `gastos/src/billing/repo.js`** (antes de `module.exports`):

```js
// Activa o renueva una suscripción tras pago aprobado en MP.
// Crea la fila si no existe, luego actualiza plan + ciclo + créditos.
async function activarSuscripcion(db, companyId, { plan, external_id, source, ciclo_fin }) {
  await createFreeSubscription(db, companyId); // asegura que exista la fila
  const { getPlan } = require('./planes');
  const p = getPlan(plan);
  await db.query(
    `UPDATE subscriptions
        SET plan=$2, estado='activa', source=$3, external_id=$4,
            ciclo_inicio=now(), ciclo_fin=$5,
            creditos_limite=$6, creditos_usados=0, updated_at=now()
      WHERE company_id=$1`,
    [companyId, p.nombre, source || 'mp', external_id || null, ciclo_fin || null, p.creditos]);
  return getSubscription(db, companyId);
}
```

- [ ] **Actualizar `module.exports`:**

```js
module.exports = { createFreeSubscription, getSubscription, tryConsume, logConsumo, resetCiclo, setPlanLimite, activarSuscripcion };
```

- [ ] **Verificar tests existentes siguen pasando:**

```bash
cd gastos && npm test -- --testPathPattern=billing 2>&1 | tail -5
```

Esperado: todos los tests de billing pasan.

- [ ] **Commit:**

```bash
git add gastos/src/billing/repo.js
git commit -m "feat(billing): activarSuscripcion — activa/renueva plan tras pago MP"
```

---

## Task 17: billing/mp.js — cliente Mercado Pago

**Files:**
- Create: `gastos/src/billing/mp.js`
- Test: `gastos/tests/billing/mp.test.js`

El cliente MP encapsula todas las llamadas a la API de MP para que el resto del código no dependa de fetch/URL.

- [ ] **Crear `gastos/src/billing/mp.js`:**

```js
const { PLANES, PLAN_LABELS } = require('./planes');

const MP_API = 'https://api.mercadopago.com';

async function mpFetch(path, opts = {}) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error('MP_ACCESS_TOKEN no configurado');
  const res = await fetch(`${MP_API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`MP ${res.status}: ${JSON.stringify(body)}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

// Crea un preapproval (suscripción recurrente) para el plan dado.
// backUrl: URL de vuelta al panel tras autorizar (ej. https://gastos.atikodigital.cl/panel/#plan)
// Returns: { id, init_point }
async function createPreapproval(planNombre, backUrl) {
  const p = PLANES[planNombre];
  if (!p || !p.precio) throw new Error(`Plan no pagable: ${planNombre}`);
  const label = PLAN_LABELS[planNombre] || planNombre;
  const body = {
    reason: label,
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: p.precio,
      currency_id: 'CLP',
    },
    back_url: backUrl,
    status: 'pending',
  };
  const r = await mpFetch('/preapproval', { method: 'POST', body: JSON.stringify(body) });
  return { id: r.id, init_point: r.init_point };
}

// Cancela un preapproval existente (suscripción).
async function cancelPreapproval(preapprovalId) {
  await mpFetch(`/preapproval/${preapprovalId}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'cancelled' }),
  });
}

// Obtiene el estado actual de un preapproval.
async function getPreapproval(preapprovalId) {
  return mpFetch(`/preapproval/${preapprovalId}`);
}

module.exports = { createPreapproval, cancelPreapproval, getPreapproval };
```

- [ ] **Crear `gastos/tests/billing/mp.test.js`:**

```js
// Los tests de mp.js mockean fetch para no llamar a MP real.
const { createPreapproval, cancelPreapproval } = require('../../src/billing/mp');

function mockFetch(status, body) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => { process.env.MP_ACCESS_TOKEN = 'TEST_TOKEN'; });
afterEach(() => { delete global.fetch; jest.restoreAllMocks(); });

test('createPreapproval llama a MP con los datos correctos y devuelve id + init_point', async () => {
  mockFetch(200, { id: 'PRE123', init_point: 'https://mp.cl/pay/PRE123' });
  const r = await createPreapproval('pyme', 'https://gastos.atikodigital.cl/panel/#plan');
  expect(r).toEqual({ id: 'PRE123', init_point: 'https://mp.cl/pay/PRE123' });
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/preapproval'),
    expect.objectContaining({ method: 'POST' })
  );
  const body = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(body.auto_recurring.transaction_amount).toBe(24900);
  expect(body.auto_recurring.currency_id).toBe('CLP');
  expect(body.auto_recurring.frequency_type).toBe('months');
});

test('createPreapproval lanza error para plan free (precio 0)', async () => {
  await expect(createPreapproval('free', 'https://x.cl')).rejects.toThrow('Plan no pagable');
});

test('createPreapproval lanza error si MP responde 4xx', async () => {
  mockFetch(401, { message: 'Unauthorized' });
  await expect(createPreapproval('basico', 'https://x.cl')).rejects.toThrow('MP 401');
});

test('createPreapproval lanza error si MP_ACCESS_TOKEN no está configurado', async () => {
  delete process.env.MP_ACCESS_TOKEN;
  await expect(createPreapproval('pyme', 'https://x.cl')).rejects.toThrow('MP_ACCESS_TOKEN');
});

test('cancelPreapproval llama PUT con status cancelled', async () => {
  mockFetch(200, { id: 'PRE123', status: 'cancelled' });
  await cancelPreapproval('PRE123');
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/preapproval/PRE123'),
    expect.objectContaining({ method: 'PUT' })
  );
});
```

- [ ] **Correr tests:**

```bash
cd gastos && npm test -- --testPathPattern=billing/mp 2>&1 | tail -10
```

Esperado: 5 tests pasan.

- [ ] **Commit:**

```bash
git add gastos/src/billing/mp.js gastos/tests/billing/mp.test.js
git commit -m "feat(billing): cliente MP preapproval (createPreapproval, cancelPreapproval)"
```

---

## Task 18: billing/webhook-mp.js — procesador de eventos MP

**Files:**
- Create: `gastos/src/billing/webhook-mp.js`
- Test: `gastos/tests/billing/webhook-mp.test.js`

Valida la firma MP y procesa los eventos: authorized → activa, payment:approved → renueva, paused/cancelled → morosa/cancelada.

- [ ] **Crear `gastos/src/billing/webhook-mp.js`:**

```js
const crypto = require('crypto');
const { activarSuscripcion, resetCiclo, getSubscription } = require('./repo');
const { getPlan } = require('./planes');
const { getPreapproval } = require('./mp');

// Valida la firma HMAC-SHA256 de MP.
// MP envía: x-signature: ts=<ts>,v1=<hash>
// x-request-id: <uuid>
// Cuerpo: { type, data: { id } }
function validarFirmaMP(headers, dataId, secret) {
  const sig = headers['x-signature'] || '';
  const reqId = headers['x-request-id'] || '';
  const tsMatch = sig.match(/ts=([^,]+)/);
  const v1Match = sig.match(/v1=([^,]+)/);
  if (!tsMatch || !v1Match) return false;
  const ts = tsMatch[1];
  const v1 = v1Match[1];
  const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}

// Calcula ciclo_fin: 30 días desde ahora como Date ISO.
function cicloFin30Dias() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

// Busca la empresa por external_id (preapproval_id de MP).
async function companyByExternalId(db, externalId) {
  const r = await db.query(
    `SELECT company_id FROM subscriptions WHERE external_id=$1`, [externalId]);
  return r.rows[0] ? r.rows[0].company_id : null;
}

// Procesa el evento MP recibido en el webhook.
// payload = { type, data: { id } }  (cuerpo del webhook de MP)
// preapprovalId: el id del preapproval para buscar la suscripción
async function procesarEventoMP(db, { type, preapprovalId, plan, companyId }) {
  if (type === 'subscription_authorized_payment' || type === 'authorized') {
    // Pago inicial: activar el plan
    if (!companyId || !plan) return { ok: false, razon: 'datos_incompletos' };
    await activarSuscripcion(db, companyId, {
      plan, external_id: preapprovalId, source: 'mp', ciclo_fin: cicloFin30Dias(),
    });
    return { ok: true, accion: 'activada' };
  }

  if (type === 'payment' || type === 'subscription_payment') {
    // Renovación: reset de créditos + nuevo ciclo
    const cid = companyId || await companyByExternalId(db, preapprovalId);
    if (!cid) return { ok: false, razon: 'empresa_no_encontrada' };
    // Actualizar ciclo_fin en la suscripción
    await db.query(
      `UPDATE subscriptions SET ciclo_fin=$2, ciclo_inicio=now(), creditos_usados=0, updated_at=now()
        WHERE company_id=$1`,
      [cid, cicloFin30Dias()]);
    return { ok: true, accion: 'renovada' };
  }

  if (type === 'subscription_paused' || type === 'paused') {
    // Pago fallido después de intentos: marcar morosa
    const cid = companyId || await companyByExternalId(db, preapprovalId);
    if (!cid) return { ok: false, razon: 'empresa_no_encontrada' };
    await db.query(
      `UPDATE subscriptions SET estado='morosa', updated_at=now() WHERE company_id=$1`, [cid]);
    return { ok: true, accion: 'morosa' };
  }

  if (type === 'subscription_cancelled' || type === 'cancelled') {
    // Cancelación: el plan sigue hasta ciclo_fin pero no se renueva
    const cid = companyId || await companyByExternalId(db, preapprovalId);
    if (!cid) return { ok: false, razon: 'empresa_no_encontrada' };
    await db.query(
      `UPDATE subscriptions SET estado='cancelada', updated_at=now() WHERE company_id=$1`, [cid]);
    return { ok: true, accion: 'cancelada' };
  }

  return { ok: true, accion: 'ignorado', type };
}

module.exports = { validarFirmaMP, procesarEventoMP };
```

- [ ] **Crear `gastos/tests/billing/webhook-mp.test.js`:**

```js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { validarFirmaMP, procesarEventoMP } = require('../../src/billing/webhook-mp');
const crypto = require('crypto');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}

async function crearEmpresaConSub(db, plan = 'free') {
  const id = require('crypto').randomUUID();
  await db.query("INSERT INTO companies(id, nombre) VALUES($1,'Test')", [id]);
  await db.query(
    `INSERT INTO subscriptions(company_id, plan, estado, source, creditos_limite, creditos_usados)
     VALUES($1,$2,'activa','manual',30,5)`, [id, plan]);
  return id;
}

// Tests de validación de firma
test('validarFirmaMP: firma correcta → true', () => {
  const secret = 'test_secret';
  const ts = '1234567890';
  const dataId = 'PAY123';
  const reqId = 'REQ456';
  const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
  const v1 = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const headers = { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': reqId };
  expect(validarFirmaMP(headers, dataId, secret)).toBe(true);
});

test('validarFirmaMP: firma incorrecta → false', () => {
  const headers = { 'x-signature': 'ts=123,v1=abcdef', 'x-request-id': 'req1' };
  expect(validarFirmaMP(headers, 'PAY1', 'wrong_secret')).toBe(false);
});

test('validarFirmaMP: sin header x-signature → false', () => {
  expect(validarFirmaMP({}, 'PAY1', 'secret')).toBe(false);
});

// Tests del procesador de eventos
test('authorized: activa suscripción con plan correcto', async () => {
  const db = await freshDb();
  const cid = await crearEmpresaConSub(db, 'free');
  const r = await procesarEventoMP(db, {
    type: 'authorized', preapprovalId: 'PRE001', plan: 'pyme', companyId: cid,
  });
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('activada');
  const s = await db.query('SELECT * FROM subscriptions WHERE company_id=$1', [cid]);
  expect(s.rows[0].plan).toBe('pyme');
  expect(s.rows[0].estado).toBe('activa');
  expect(Number(s.rows[0].creditos_limite)).toBe(210);
  expect(Number(s.rows[0].creditos_usados)).toBe(0);
  expect(s.rows[0].source).toBe('mp');
  expect(s.rows[0].external_id).toBe('PRE001');
});

test('payment: renueva ciclo y resetea créditos', async () => {
  const db = await freshDb();
  const cid = await crearEmpresaConSub(db, 'pyme');
  // Poner external_id para que companyByExternalId funcione
  await db.query(`UPDATE subscriptions SET external_id='PRE002', creditos_usados=150 WHERE company_id=$1`, [cid]);
  const r = await procesarEventoMP(db, { type: 'payment', preapprovalId: 'PRE002', companyId: cid });
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('renovada');
  const s = await db.query('SELECT creditos_usados FROM subscriptions WHERE company_id=$1', [cid]);
  expect(Number(s.rows[0].creditos_usados)).toBe(0);
});

test('paused: marca morosa', async () => {
  const db = await freshDb();
  const cid = await crearEmpresaConSub(db, 'pyme');
  await db.query(`UPDATE subscriptions SET external_id='PRE003' WHERE company_id=$1`, [cid]);
  const r = await procesarEventoMP(db, { type: 'paused', preapprovalId: 'PRE003', companyId: cid });
  expect(r.ok).toBe(true);
  const s = await db.query('SELECT estado FROM subscriptions WHERE company_id=$1', [cid]);
  expect(s.rows[0].estado).toBe('morosa');
});

test('cancelled: marca cancelada', async () => {
  const db = await freshDb();
  const cid = await crearEmpresaConSub(db, 'pyme');
  const r = await procesarEventoMP(db, { type: 'cancelled', preapprovalId: 'PRE004', companyId: cid });
  expect(r.ok).toBe(true);
  const s = await db.query('SELECT estado FROM subscriptions WHERE company_id=$1', [cid]);
  expect(s.rows[0].estado).toBe('cancelada');
});

test('evento desconocido: devuelve ignorado', async () => {
  const db = await freshDb();
  const r = await procesarEventoMP(db, { type: 'unknown_event' });
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('ignorado');
});
```

- [ ] **Correr tests:**

```bash
cd gastos && npm test -- --testPathPattern=billing/webhook-mp 2>&1 | tail -10
```

Esperado: 8 tests pasan.

- [ ] **Commit:**

```bash
git add gastos/src/billing/webhook-mp.js gastos/tests/billing/webhook-mp.test.js
git commit -m "feat(billing): webhook-mp — validar firma MP y procesar eventos (authorized/payment/paused/cancelled)"
```

---

## Task 19: panel/router.js — POST /suscripcion/crear

**Files:**
- Modify: `gastos/src/panel/router.js`

Este endpoint es el punto de entrada del dueño: elige un plan, el backend crea el preapproval en MP y devuelve el link de pago.

- [ ] **Agregar los imports en la parte superior de `gastos/src/panel/router.js`** (junto a los demás imports de billing):

```js
const { createPreapproval } = require('../billing/mp');
const { getPlan, PLANES } = require('../billing/planes');
```

Verificar que ya existe: `const { saldo: saldoCreditos, SinCreditosError } = require('../billing/creditos');`

- [ ] **Agregar el endpoint** después del `GET /suscripcion` existente:

```js
router.post('/suscripcion/crear', async (req, res) => {
  const { plan } = req.body || {};
  const planesValidos = ['basico', 'pyme', 'empresa'];
  if (!plan || !planesValidos.includes(plan)) {
    return res.status(400).json({ error: 'plan_invalido' });
  }
  // Anti-doble-cobro: si ya tiene una suscripción activa de pago, rechazar.
  const sub = await saldoCreditos(db, req.auth.companyId);
  if (sub.plan === 'ilimitado') {
    return res.status(409).json({ error: 'plan_especial' });
  }
  if (sub.estado === 'activa' && sub.plan === plan) {
    return res.status(409).json({ error: 'ya_activa' });
  }
  try {
    const backUrl = `${process.env.PANEL_BASE_URL || 'https://gastos.atikodigital.cl'}/panel/#plan`;
    const { id, init_point } = await createPreapproval(plan, backUrl);
    // Guardar external_id para que el webhook pueda encontrar la empresa
    await db.query(
      `UPDATE subscriptions SET external_id=$2, updated_at=now() WHERE company_id=$1`,
      [req.auth.companyId, id]);
    console.log('[mp] preapproval creado', id, 'para empresa', req.auth.companyId, 'plan', plan);
    return res.json({ init_point });
  } catch (e) {
    console.error('[mp] error creando preapproval:', e.message);
    return res.status(502).json({ error: 'mp_error' });
  }
});
```

- [ ] **Verificar que los tests del panel siguen pasando:**

```bash
cd gastos && npm test -- --testPathPattern=panel 2>&1 | tail -5
```

- [ ] **Commit:**

```bash
git add gastos/src/panel/router.js
git commit -m "feat(panel): POST /suscripcion/crear — crea preapproval MP y devuelve init_point"
```

---

## Task 20: server.js — POST /api/pagos/mp/webhook (ruta pública)

**Files:**
- Modify: `gastos/src/server.js`

El webhook de MP llega sin JWT. Se valida por firma HMAC. Mismo patrón que el webhook de WhatsApp.

- [ ] **Agregar el import en `gastos/src/server.js`** (junto a los imports de routers al inicio):

```js
const { validarFirmaMP, procesarEventoMP } = require('./billing/webhook-mp');
```

- [ ] **Agregar la ruta pública** después del webhook de WhatsApp (línea ~61):

```js
// Webhook público de Mercado Pago: valida firma HMAC y procesa evento.
app.post('/api/pagos/mp/webhook', async (req, res) => {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (secret) {
    const dataId = (req.body && req.body.data && req.body.data.id) || '';
    if (!validarFirmaMP(req.headers, dataId, secret)) {
      console.warn('[mp-webhook] firma inválida');
      return res.status(400).json({ error: 'firma_invalida' });
    }
  }
  const { type, data } = req.body || {};
  const preapprovalId = (data && data.id) || null;
  try {
    // Para el evento 'authorized' necesitamos el plan: está en el preapproval de MP.
    // Lo obtenemos del external_id guardado en subscriptions.
    const db = getPool();
    let companyId = null, plan = null;
    if (preapprovalId) {
      const r = await db.query(
        `SELECT company_id, plan FROM subscriptions WHERE external_id=$1`, [preapprovalId]);
      if (r.rows[0]) { companyId = r.rows[0].company_id; plan = r.rows[0].plan; }
    }
    const result = await procesarEventoMP(db, { type, preapprovalId, plan, companyId });
    console.log('[mp-webhook] evento', type, '→', result.accion || result.razon);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[mp-webhook] error:', e.message);
    return res.status(500).json({ error: 'webhook_error' });
  }
});
```

- [ ] **Verificar que el servidor arranca sin errores:**

```bash
cd gastos && node -e "require('./src/server.js')" 2>&1 | head -5
```

Esperado: sin errores de require.

- [ ] **Commit:**

```bash
git add gastos/src/server.js
git commit -m "feat(server): POST /api/pagos/mp/webhook — webhook público MP con validación HMAC"
```

---

## Task 21: WhatsApp — upgrade link en mensaje sin créditos

**Files:**
- Modify: `gastos/src/whatsapp/webhook.js`

Cuando el dueño agota créditos, el mensaje de WhatsApp debe incluir el link al panel para mejorar el plan.

- [ ] **Buscar en `gastos/src/whatsapp/webhook.js`** la línea que maneja `SinCreditosError` y envía el mensaje de WhatsApp. Actualmente es algo como:

```js
} catch (e) {
  if (e instanceof SinCreditosError) {
    const msg = 'Te quedaste sin créditos...';
    await sendText({ to: sender, body: msg, ... });
    return;
  }
```

- [ ] **Modificar el mensaje para incluir el link de upgrade:**

```js
if (e instanceof SinCreditosError) {
  const panelUrl = process.env.PANEL_BASE_URL || 'https://gastos.atikodigital.cl';
  const msg = `⚠️ Te quedaste sin créditos de IA para este mes.\nMejora tu plan aquí: ${panelUrl}/panel/#plan`;
  // ... mismo código de sendText que ya existe
}
```

- [ ] **Verificar que los tests del webhook siguen pasando:**

```bash
cd gastos && npm test -- --testPathPattern=whatsapp 2>&1 | tail -5
```

- [ ] **Commit:**

```bash
git add gastos/src/whatsapp/webhook.js
git commit -m "feat(whatsapp): upgrade link en mensaje de sin_creditos"
```

---

## Task 22: Panel UI — pestaña "Mi Plan"

**Files:**
- Modify: `gastos/public/panel/index.html`

Nueva pestaña en el sidebar del panel con cards de planes y botón "Contratar".

- [ ] **Agregar ítem en el sidebar** (buscar los otros ítem del nav, típicamente `<li>` con íconos). Agregar:

```html
<li id="navPlan" class="nav-item" data-tab="plan" title="Mi Plan">
  <span class="nav-icon">💳</span>
  <span class="nav-label">Mi Plan</span>
</li>
```

- [ ] **Agregar la sección del contenido** (buscar el patrón de otras tabs como `id="tabGastos"`):

```html
<section id="tabPlan" class="tab-content hidden">
  <div style="max-width:720px;margin:0 auto;padding:24px 16px">
    <h2 style="font-size:1.1rem;font-weight:700;color:var(--gold);margin-bottom:4px">Mi Plan</h2>
    <div id="planActualInfo" style="font-size:13px;color:#9a917a;margin-bottom:24px"></div>

    <!-- Banner morosa -->
    <div id="planBannerMorosa" class="hidden" style="background:#7f1d1d;color:#fca5a5;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:13px">
      ⚠️ Tu pago falló. Renueva tu plan para seguir usando la IA.
    </div>

    <!-- Cards de planes -->
    <div id="planCards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px"></div>

    <p style="font-size:11px;color:#555;margin-top:20px;text-align:center">
      Para cancelar o bajar de plan, escríbenos al
      <a href="https://wa.me/56927130792" target="_blank" style="color:var(--gold)">WhatsApp</a>.
    </p>
  </div>
</section>
```

- [ ] **Agregar el JS** que carga y renderiza el plan (buscar la función `loadSaldoCreditos` o similar, y agregar después):

```js
var PLANES_PANEL = [
  { key: 'basico', nombre: 'Básico', precio: '$9.900', shots: 100 },
  { key: 'pyme',   nombre: 'Pyme',   precio: '$24.900', shots: 210 },
  { key: 'empresa',nombre: 'Empresa',precio: '$49.900', shots: 600 },
];

async function loadMiPlan() {
  var cards = $('planCards');
  var info = $('planActualInfo');
  var banner = $('planBannerMorosa');
  if (!cards) return;
  var s;
  try { s = await apiFetch('/suscripcion'); } catch (_) { return; }
  var planActual = s.plan || 'free';
  var estado = s.estado || 'activa';
  var restante = s.restante != null ? s.restante : '—';
  var renovacion = s.ciclo_fin ? new Date(s.ciclo_fin).toLocaleDateString('es-CL') : null;
  info.textContent = 'Plan: ' + planActual.charAt(0).toUpperCase() + planActual.slice(1)
    + '  •  Créditos restantes: ' + restante
    + (renovacion ? '  •  Próxima renovación: ' + renovacion : '');
  banner.classList.toggle('hidden', estado !== 'morosa');

  if (planActual === 'ilimitado') {
    cards.innerHTML = '<p style="color:#9a917a;font-size:13px">Plan especial — sin límite de créditos. Gracias por ser parte de Hash IA.</p>';
    return;
  }

  cards.innerHTML = PLANES_PANEL.map(function(p) {
    var esActual = p.key === planActual;
    var borde = esActual ? '2px solid var(--gold)' : '1px solid #2a2a2a';
    var btn = esActual
      ? '<button disabled style="width:100%;padding:8px;border-radius:8px;background:#2a2a2a;color:#555;border:none;font-size:12px;cursor:default">Plan actual</button>'
      : '<button onclick="contratarPlan(\'' + p.key + '\')" style="width:100%;padding:8px;border-radius:8px;background:var(--gold);color:#1a1000;border:none;font-weight:700;font-size:12px;cursor:pointer">Contratar</button>';
    return '<div style="border:' + borde + ';border-radius:12px;padding:16px;background:#0d0e0f">'
      + '<div style="font-weight:700;color:#e3e2e2">' + p.nombre + '</div>'
      + '<div style="font-size:1.4rem;font-weight:800;color:var(--gold);margin:6px 0">' + p.precio + '<span style="font-size:11px;font-weight:400;color:#555">/mes</span></div>'
      + '<div style="font-size:12px;color:#9a917a;margin-bottom:12px">' + p.shots + ' shots al mes</div>'
      + btn
      + '</div>';
  }).join('');
}

async function contratarPlan(plan) {
  var btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Redirigiendo…';
  try {
    var r = await apiFetch('/suscripcion/crear', { method: 'POST', body: JSON.stringify({ plan }) });
    if (r && r.init_point) {
      window.open(r.init_point, '_blank');
    } else if (r && r.error === 'ya_activa') {
      alert('Ya tienes este plan activo.');
    } else {
      alert('No se pudo iniciar el pago. Intenta de nuevo.');
    }
  } catch (_) {
    alert('Error de conexión. Intenta de nuevo.');
  }
  btn.disabled = false;
  btn.textContent = 'Contratar';
}
```

- [ ] **Conectar la pestaña al sistema de tabs** buscando el `switch` o `if/else` que muestra/oculta tabs al hacer click en el nav, y agregar el caso `'plan'`:

```js
case 'plan':
  $('tabPlan').classList.remove('hidden');
  loadMiPlan();
  break;
```

- [ ] **Verificar visualmente** que la pestaña "Mi Plan" aparece en el sidebar y muestra los cards.

- [ ] **Commit:**

```bash
git add gastos/public/panel/index.html
git commit -m "feat(panel): pestaña Mi Plan con cards de planes y botón Contratar (MP)"
```

---

## Task 23: Deploy y verificación

- [ ] **Correr todos los tests:**

```bash
cd gastos && npm test 2>&1 | tail -8
```

Esperado: solo el fallo preexistente `lib-v2.test.js`. Todo lo nuevo: verde.

- [ ] **Deploy backend:**

```bash
node deploy-gastos.js 2>&1 | tail -6
```

Esperado: `migrate OK`, pm2 online, `=== deploy atiko-gastos OK ===`.

- [ ] **Push a remote:**

```bash
git push origin master:hash-ia
```

- [ ] **Verificar endpoint suscripcion en producción:**

```bash
curl -s https://gastos.atikodigital.cl/health | python -m json.tool
```

- [ ] **Variables de entorno en producción** — recordar al dueño que debe agregar en el `.env` del VPS:

```
MP_ACCESS_TOKEN=APP_USR-...
MP_WEBHOOK_SECRET=...
PANEL_BASE_URL=https://gastos.atikodigital.cl
```

Y hacer `pm2 restart atiko-gastos` después de agregar las vars.

- [ ] **Configurar URL del webhook en Mercado Pago Developers:**

URL a registrar: `https://gastos.atikodigital.cl/api/pagos/mp/webhook`

Eventos a suscribir: `subscription_preapproval` (cubre authorized, payment, paused, cancelled).
