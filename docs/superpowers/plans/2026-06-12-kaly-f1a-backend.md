# K.A.L.Y. F1-A — Backend (token efímero, memoria, espejos, detección cartola/libro)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. Spec: `docs/superpowers/specs/2026-06-12-kaly-fase1-agente-voz-design.md`.

**Goal:** Dejar el backend listo para el agente de voz K.A.L.Y.: sesión Live (token efímero Gemini + contexto), memoria permanente de nombre/trato, endpoints espejo para acciones por voz, y clasificación de cartolas/libros SII en la captura.

**Architecture:** Todo aditivo sobre `gastos/` (Node/Express, jest, pg-mem). Un módulo nuevo `src/agent/` (token efímero injectable + contexto), columna `employees.agent_prefs jsonb`, dos espejos de endpoints existentes con auth de empleado, y el OCR gana los tipos `cartola`/`libro_compra_venta` que cortocircuitan el intake (202, sin insertar).

**Tech Stack:** Node/Express, axios (token efímero), jest + pg-mem, supertest.

---

## File Structure

- `gastos/src/db/migrate.js` — Modify: ALTER `employees ADD COLUMN agent_prefs jsonb` (+ schema.sql).
- `gastos/src/agent/token.js` — Create: `createEphemeralToken({ apiKey, model, http })`.
- `gastos/src/agent/context.js` — Create: `buildAgentContext(db, { companyId, employeeId, now })`.
- `gastos/src/app/router.js` — Modify: `POST /agent/session`, `PATCH /agent/prefs`, `PATCH /expenses/:id/pagar`, `POST /agent/resumen-whatsapp`; POST /expenses devuelve 202 para cartola/libro.
- `gastos/src/ocr/gemini.js` + `extract.js` — Modify: tipos cartola/libro_compra_venta.
- `gastos/src/expenses/intake.js` — Modify: cortocircuito documento.
- `gastos/src/whatsapp/webhook.js` — Modify: aviso si llega cartola/libro por WhatsApp.

Convención test helper (igual a los tests existentes):
```js
const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
```

---

### Task 1: Migración `agent_prefs` + `PATCH /api/app/agent/prefs`

**Files:** Modify `gastos/src/db/schema.sql` (tabla employees: agregar `agent_prefs  jsonb,` antes de `created_at`), `gastos/src/db/migrate.js`, `gastos/src/companies/repo.js`, `gastos/src/app/router.js`. Test: `gastos/tests/agent-prefs.test.js`.

- [ ] **Step 1 — test que falla** (`gastos/tests/agent-prefs.test.js`):

```js
const express = require('express');
const request = require('supertest');
// (helper makeDb de la convención de arriba)
const { createAppRouter } = require('../src/app/router');
const { createEmployee, getAgentPrefs } = require('../src/companies/repo');
const { hashPassword } = require('../src/auth/password');

async function setup() {
  const db = await makeDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const cid = c.rows[0].id;
  const emp = await createEmployee(db, { company_id: cid, nombre: 'Jose', usuario: 'jose', password_hash: await hashPassword('p'), activo: true });
  const app = express(); app.use(express.json());
  app.use('/api/app', createAppRouter({ db }));
  const login = await request(app).post('/api/app/login').send({ usuario: 'jose', password: 'p' });
  return { app, db, cid, empId: emp.id, token: login.body.token };
}

test('PATCH /agent/prefs guarda nombre/trato/onboarded y se puede leer', async () => {
  const { app, db, empId, token } = await setup();
  const res = await request(app).patch('/api/app/agent/prefs').set('Authorization', 'Bearer ' + token)
    .send({ nombre: 'José', trato: 'señor', onboarded: true });
  expect(res.status).toBe(200);
  expect(res.body.agent_prefs.nombre).toBe('José');
  const prefs = await getAgentPrefs(db, empId);
  expect(prefs.trato).toBe('señor');
  expect(prefs.onboarded_at).toBeTruthy();
});

test('PATCH /agent/prefs es merge parcial (no borra lo previo)', async () => {
  const { app, db, empId, token } = await setup();
  await request(app).patch('/api/app/agent/prefs').set('Authorization', 'Bearer ' + token).send({ nombre: 'José' });
  await request(app).patch('/api/app/agent/prefs').set('Authorization', 'Bearer ' + token).send({ trato: 'señor' });
  const prefs = await getAgentPrefs(db, empId);
  expect(prefs.nombre).toBe('José');
  expect(prefs.trato).toBe('señor');
});
```

- [ ] **Step 2 — run** `cd gastos && npx jest tests/agent-prefs.test.js` → FAIL.
- [ ] **Step 3 — schema/migración:** en `schema.sql` (employees) agregar `agent_prefs  jsonb,` antes de `created_at`. En `migrate.js`, añadir a `V2_COLUMNS`: `"ALTER TABLE employees ADD COLUMN IF NOT EXISTS agent_prefs jsonb"`.
- [ ] **Step 4 — repo:** en `companies/repo.js` agregar y exportar:

```js
async function getAgentPrefs(db, employeeId) {
  const r = await db.query('SELECT agent_prefs FROM employees WHERE id=$1', [employeeId]);
  return (r.rows[0] && r.rows[0].agent_prefs) || {};
}

async function setAgentPrefs(db, employeeId, patch) {
  const prev = await getAgentPrefs(db, employeeId);
  const next = { ...prev };
  if (patch.nombre !== undefined) next.nombre = String(patch.nombre).slice(0, 60);
  if (patch.trato !== undefined) next.trato = String(patch.trato).slice(0, 20);
  if (patch.onboarded) next.onboarded_at = new Date().toISOString();
  const r = await db.query('UPDATE employees SET agent_prefs=$1 WHERE id=$2 RETURNING agent_prefs', [JSON.stringify(next), employeeId]);
  return r.rows[0] ? r.rows[0].agent_prefs : null;
}
```

- [ ] **Step 5 — endpoint:** en `app/router.js` (sección autenticada), importar `getAgentPrefs, setAgentPrefs` del repo de companies y agregar:

```js
  router.patch('/agent/prefs', async (req, res) => {
    const prefs = await setAgentPrefs(db, req.auth.employeeId, req.body || {});
    return res.json({ agent_prefs: prefs });
  });
```

- [ ] **Step 6 — run test → PASS; full suite verde.**
- [ ] **Step 7 — commit** `feat(kaly): memoria permanente agent_prefs (nombre/trato/onboarded)`

---

### Task 2: `POST /api/app/agent/session` (token efímero + contexto)

**Files:** Create `gastos/src/agent/token.js`, `gastos/src/agent/context.js`. Modify `gastos/src/app/router.js` (firma `createAppRouter({ db, extractExpense, createLiveToken })`). Test: `gastos/tests/agent-session.test.js`.

- [ ] **Step 1 — test que falla:**

```js
// setup igual a agent-prefs, pero createAppRouter({ db, createLiveToken: jest.fn(async () => ({ token: 'auth_tokens/abc', expireAt: '2026-06-12T13:00:00Z' })) })
test('POST /agent/session devuelve token efímero + contexto', async () => {
  const { app, db, cid, token, createLiveToken } = await setup();
  // un movimiento confirmado para el resumen
  const { createExpense, confirmExpense } = require('../src/expenses/repo');
  const g = await createExpense(db, { company_id: cid, tipo: 'gasto', categoria: 'Arriendos', fecha: '2026-06-05', total: 30000 });
  await confirmExpense(db, g.id);
  const res = await request(app).post('/api/app/agent/session').set('Authorization', 'Bearer ' + token).send({});
  expect(res.status).toBe(200);
  expect(res.body.token).toBe('auth_tokens/abc');
  expect(createLiveToken).toHaveBeenCalled();
  expect(res.body.context.onboarded).toBe(false);
  expect(['dia', 'tarde', 'noche']).toContain(res.body.context.saludoHora);
  expect(res.body.context.resumen.gastos).toBe(30000);
  expect(res.body.context.empresaNombre).toBe('X');
});

test('POST /agent/session con prefs guardadas trae nombre/trato y onboarded true', async () => {
  const { app, token } = await setup();
  await request(app).patch('/api/app/agent/prefs').set('Authorization', 'Bearer ' + token).send({ nombre: 'José', trato: 'señor', onboarded: true });
  const res = await request(app).post('/api/app/agent/session').set('Authorization', 'Bearer ' + token).send({});
  expect(res.body.context.nombre).toBe('José');
  expect(res.body.context.onboarded).toBe(true);
});

test('503 si el emisor de tokens falla', async () => {
  const { app, token, createLiveToken } = await setup();
  createLiveToken.mockRejectedValueOnce(new Error('no soportado'));
  const res = await request(app).post('/api/app/agent/session').set('Authorization', 'Bearer ' + token).send({});
  expect(res.status).toBe(503);
  expect(res.body.error).toBe('live_no_disponible');
});
```

- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — `src/agent/token.js`:**

```js
const axios = require('axios');

const DEFAULT_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-09-2025';

// Crea un token efímero (v1alpha auth_tokens) para que la app abra la sesión Live
// sin conocer la API key real. uses:1 → un solo arranque de sesión por token.
async function createEphemeralToken({ apiKey, model = DEFAULT_MODEL, http = axios } = {}) {
  const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  const res = await http.post(
    `https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${apiKey}`,
    { uses: 1, expireTime, newSessionExpireTime, bidiGenerateContentSetup: { model: `models/${model}` } },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
  );
  const name = res && res.data && res.data.name;
  if (!name) throw new Error('token_efimero_invalido');
  return { token: name, expireAt: expireTime, model };
}

module.exports = { createEphemeralToken, DEFAULT_MODEL };
```

- [ ] **Step 4 — `src/agent/context.js`:**

```js
const { cashflowSummary } = require('../expenses/summary');
const { getAgentPrefs, getCompany } = require('../companies/repo');

function saludoHora(now = new Date()) {
  // Hora de Chile continental
  const h = Number(new Intl.DateTimeFormat('es-CL', { hour: 'numeric', hour12: false, timeZone: 'America/Santiago' }).format(now));
  if (h >= 6 && h < 12) return 'dia';
  if (h >= 12 && h < 20) return 'tarde';
  return 'noche';
}

async function buildAgentContext(db, { companyId, employeeId, now = new Date() }) {
  const [prefs, company] = await Promise.all([
    getAgentPrefs(db, employeeId),
    getCompany(db, companyId),
  ]);
  const s = await cashflowSummary(db, companyId, { year: now.getFullYear(), month: now.getMonth() + 1 });
  const pend = await db.query(
    "SELECT count(*)::int AS n FROM expenses WHERE company_id=$1 AND tipo='gasto' AND estado='confirmado' AND estado_pago='registrada'",
    [companyId]
  );
  return {
    nombre: prefs.nombre || '',
    trato: prefs.trato || '',
    onboarded: Boolean(prefs.onboarded_at),
    saludoHora: saludoHora(now),
    empresaNombre: (company && company.nombre) || '',
    resumen: { ...s, pendientesPago: pend.rows[0].n },
  };
}

module.exports = { buildAgentContext, saludoHora };
```

- [ ] **Step 5 — endpoint en `app/router.js`:** firma `function createAppRouter({ db, extractExpense, createLiveToken } = {})`; `const _liveToken = createLiveToken || (() => require('../agent/token').createEphemeralToken({ apiKey: process.env.GEMINI_API_KEY }));` y en la sección autenticada:

```js
  router.post('/agent/session', async (req, res) => {
    let tok;
    try { tok = await _liveToken(); }
    catch (e) { return res.status(503).json({ error: 'live_no_disponible', detalle: e.message }); }
    const context = await buildAgentContext(db, { companyId: req.auth.companyId, employeeId: req.auth.employeeId });
    console.log('[kaly] token live emitido para empleado', req.auth.employeeId);
    return res.json({ ...tok, context });
  });
```

(importar `buildAgentContext` arriba.)
- [ ] **Step 6 — run tests → PASS; full suite verde.**
- [ ] **Step 7 — commit** `feat(kaly): sesion live con token efimero y contexto del empleado`

---

### Task 3: Espejos — `PATCH /api/app/expenses/:id/pagar` + `POST /api/app/agent/resumen-whatsapp`

**Files:** Modify `gastos/src/app/router.js` (firma agrega `sendText`). Test: `gastos/tests/app-espejos.test.js`.

- [ ] **Step 1 — test que falla:**

```js
// setup como agent-prefs + sendText = jest.fn(async () => ({ messages: [{ id: 'wamid.1' }] }))
// y la company se crea con: INSERT INTO companies(nombre, wa_phone_number_id, wa_token, owner_whatsapp) VALUES('X','PNID','TK','56993300435')
test('PATCH /api/app/expenses/:id/pagar marca pagada (ownership empleado)', async () => {
  const { app, db, cid, token } = await setup();
  const { createExpense } = require('../src/expenses/repo');
  const e = await createExpense(db, { company_id: cid, tipo: 'gasto', total: 1000, estado: 'confirmado' });
  const res = await request(app).patch('/api/app/expenses/' + e.id + '/pagar').set('Authorization', 'Bearer ' + token);
  expect(res.status).toBe(200);
  expect(res.body.estado_pago).toBe('pagada');
});

test('POST /api/app/agent/resumen-whatsapp envía con las creds de la empresa', async () => {
  const { app, token, sendText } = await setup();
  const res = await request(app).post('/api/app/agent/resumen-whatsapp').set('Authorization', 'Bearer ' + token).send({});
  expect(res.status).toBe(200);
  expect(sendText).toHaveBeenCalled();
  expect(sendText.mock.calls[0][0].to).toBe('56993300435');
});

test('resumen-whatsapp 400 si la empresa no tiene WhatsApp', async () => { /* company sin wa_* → 400 */ });
```

- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — implementar en `app/router.js`:** firma `{ db, extractExpense, createLiveToken, sendText }`; `const _sendText = sendText || require('../whatsapp/client').sendText;`. Handlers (sección autenticada, `/pagar` y `/anular` ANTES de cualquier `/:id` genérico):

```js
  router.patch('/expenses/:id/pagar', async (req, res) => {
    if (!(await ownedExpense(req, res))) return;
    return res.json(await markExpensePaid(db, req.auth.companyId, req.params.id));
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
```

(importar `markExpensePaid` de expenses/repo; `getCompanyWa` de companies/repo; `cashflowSummary` de expenses/summary; `formatCashflowSummary` de whatsapp/format.)
- [ ] **Step 4 — run → PASS; full suite verde.**
- [ ] **Step 5 — commit** `feat(kaly): espejos app para acciones por voz (pagar + resumen whatsapp)`

---

### Task 4: Detección cartola / libro de compra-venta en la captura

**Files:** Modify `gastos/src/ocr/gemini.js` (prompt), `gastos/src/ocr/extract.js`, `gastos/src/expenses/intake.js`, `gastos/src/app/router.js` (202), `gastos/src/whatsapp/webhook.js` (aviso). Test: `gastos/tests/match-detect.test.js`.

- [ ] **Step 1 — test que falla:**

```js
// mocks de preprocess/documentai/gemini como en extract-tipo.test.js
test('extract clasifica cartola y libro_compra_venta', async () => {
  geminiExtract.mockResolvedValue({ tipo: 'cartola' });
  expect((await extractExpense({ imageBuffer: Buffer.from('x') })).tipo).toBe('cartola');
  geminiExtract.mockResolvedValue({ tipo: 'libro_compra_venta' });
  expect((await extractExpense({ imageBuffer: Buffer.from('x') })).tipo).toBe('libro_compra_venta');
});

test('intake con cartola NO inserta y devuelve documento', async () => {
  const db = await makeDb(); const cid = await company(db);
  const { expense, documento } = await intakeFromImage({ db, companyId: cid, imageBuffer: Buffer.from('a'), extract: async () => ({ tipo: 'cartola', raw_ocr: {} }) });
  expect(expense).toBeNull();
  expect(documento).toBe('cartola');
  const n = await db.query('SELECT count(*)::int AS n FROM expenses');
  expect(n.rows[0].n).toBe(0);
});

test('POST /api/app/expenses con cartola responde 202 match pendiente', async () => {
  // setup app router con extract fake tipo cartola → status 202, body { documento:'cartola', match:'pendiente' }
});
```

- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — `gemini.js` (buildPrompt):** ampliar la clasificación: `tipo (gasto|ingreso|cartola|libro_compra_venta)` con guía: cartola = listado de movimientos bancarios con cargos/abonos/saldos; libro_compra_venta = registro del SII con múltiples folios/RUTs de compras o ventas. Mantener el resto del prompt.
- [ ] **Step 4 — `extract.js`:** `const tipoRaw = String(gem.tipo || '').toLowerCase();` → si es 'cartola' o 'libro_compra_venta', `tipo = tipoRaw`, categoria = '' y sii vacío; si 'ingreso' → ingreso; else gasto. (El return ya incluye `tipo`.)
- [ ] **Step 5 — `intake.js`:** tras `const extracted = await run(...)`, ANTES del hash/dedup:

```js
  if (extracted.tipo === 'cartola' || extracted.tipo === 'libro_compra_venta') {
    return { expense: null, duplicado: null, documento: extracted.tipo };
  }
```

- [ ] **Step 6 — `app/router.js` POST /expenses:** destructurar `documento` del intake; antes del check de duplicado: `if (documento) return res.status(202).json({ documento, match: 'pendiente' });`
- [ ] **Step 7 — `webhook.js`:** en el bloque de imagen, tras el intake: `if (documento) { await reply('Detecté ' + (documento === 'cartola' ? 'una cartola bancaria' : 'un libro de compra/venta del SII') + ', señor. El módulo Match se activará aquí próximamente.'); continue; }` (destructurar `documento`).
- [ ] **Step 8 — run → PASS; FULL suite verde (los tests previos de intake/dedup no cambian: sus extract fakes devuelven gasto/ingreso).**
- [ ] **Step 9 — commit** `feat(kaly): deteccion de cartola y libro de compra/venta en la captura (202 match pendiente)`

---

## Self-Review

- **Spec A1** (token efímero + contexto) → Task 2 ✅ (riesgo ephemeral: el endpoint responde 503 honesto; plan B proxy queda para validación en runbook). **A2** (agent_prefs) → Task 1 ✅. **A3** (espejos) → Task 3 ✅. **B6** (detección cartola/libro, 202) → Task 4 ✅. Lo demás del spec es F1-B (app).
- **Placeholders:** el test 3 de Task 3 y el test 3 de Task 4 están descritos en una línea — el implementador los escribe siguiendo el patrón exacto de los tests 1-2 de su misma tarea (mismo setup; cambiar solo la company sin wa_* / el status esperado). Aceptado conscientemente para no duplicar 30 líneas de setup.
- **Type consistency:** `createAppRouter({ db, extractExpense, createLiveToken, sendText })` se define en Task 2 y Task 3 amplía la misma firma; `intakeFromImage` devuelve `{ expense, duplicado, documento? }` (Task 4) y todos los callers destructuran. `getAgentPrefs/setAgentPrefs` (Task 1) usados por `context.js` (Task 2). ✅
