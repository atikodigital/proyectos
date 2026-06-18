# VARAS F4a-2 — Adaptador Gemini + acciones + endpoints — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar el cerebro de VARAS (F4a-1) a Gemini real, ejecutar las acciones confirmadas, y exponer `POST /varas/chat` y `POST /varas/accion` en app y panel. Tras esto VARAS responde de verdad por API.

**Architecture:** Adaptador `varas/gemini.js` (`geminiChat`) estilo ReAct: arma UN prompt con el system + las tools + el transcript, llama a Gemini (OpenAI-compat, texto), y **parsea**: si el modelo responde un JSON `{"tool":...,"args":...}` → `{tool}`; si no → `{text}`. Encaja con el loop de `responder` (F4a-1) que ya pasa mensajes `{role,text}`. `varas/acciones.js` (`ejecutarAccion`) ejecuta las acciones (marcar_pagado, crear_asiento_manual, enviar_resumen_whatsapp) reusando módulos existentes. Endpoints en app y panel. Gemini y sendText inyectables (tests sin red). Multi-tenant.

**Tech Stack:** Node/Express + pg-mem/Jest/supertest. Gemini OpenAI-compat (inyectable). Sin deps nuevas.

**Repo:** `C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA` (canónico, rama `master`). Tests: `cd "...\HASH IA\gastos" && npx jest`. Commit `git -c user.name="José Antonio Olguín" -c user.email="atikodigital@gmail.com"`. Confirmar `rev-parse --show-toplevel` ends in `HASH IA`.

**Depende de F4a-1:** `varas/chat.js` (`responder`, recibe `{gemini}`), `varas/tools.js` (`TOOL_DECLARATIONS`, `ACCION_NAMES`). Y de: `expenses/repo` (markExpensePaid, query), `contabilidad/contabilizar` (aplicarContabilidad), `contabilidad/manual` (crearAsientoManual), `expenses/summary` (cashflowSummary), `whatsapp/format` (formatCashflowSummary), `companies/repo` (getCompanyWa), `whatsapp/client` (sendText).

---

## File Structure

**Crear:**
- `gastos/src/varas/gemini.js` — `geminiChat({systemPrompt, messages, tools}, {http, apiKey, model})` (ReAct, parse tool/text).
- `gastos/src/varas/acciones.js` — `ejecutarAccion(db, companyId, tipo, args, {sendText})`.
- Tests: `gastos/tests/varas/gemini.test.js`, `gastos/tests/varas/acciones.test.js`, `gastos/tests/varas/api.test.js`.

**Modificar:**
- `gastos/src/app/router.js` — `POST /varas/chat`, `POST /varas/accion`.
- `gastos/src/panel/router.js` — `POST /varas/chat`, `POST /varas/accion`.

---

## Task 1: Adaptador Gemini (`varas/gemini.js`)

**Files:**
- Create: `gastos/src/varas/gemini.js`
- Test: `gastos/tests/varas/gemini.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/varas/gemini.test.js
const { geminiChat, buildPromptChat, parseSalida } = require('../../src/varas/gemini');
const { TOOL_DECLARATIONS } = require('../../src/varas/tools');

test('buildPromptChat incluye system, las tools y el transcript', () => {
  const p = buildPromptChat({ systemPrompt: 'Eres VARAS.', tools: TOOL_DECLARATIONS, messages: [{ role: 'user', text: '¿cuánto debo?' }] });
  expect(p).toMatch(/VARAS/);
  expect(p).toMatch(/deudas/);          // alguna tool aparece
  expect(p).toMatch(/cuánto debo/);
});

test('parseSalida detecta tool-call JSON vs texto', () => {
  expect(parseSalida('{"tool":"deudas","args":{}}')).toEqual({ tool: { name: 'deudas', args: {} } });
  expect(parseSalida('```json\n{"tool":"consumo_insumo","args":{"nombre":"harina"}}\n```').tool.name).toBe('consumo_insumo');
  expect(parseSalida('Tu balance cuadra.')).toEqual({ text: 'Tu balance cuadra.' });
});

test('geminiChat usa el http inyectado y devuelve {tool} o {text}', async () => {
  const httpTool = { post: async () => ({ data: { choices: [{ message: { content: '{"tool":"balance","args":{}}' } }] } }) };
  const r1 = await geminiChat({ systemPrompt: 'x', tools: TOOL_DECLARATIONS, messages: [{ role: 'user', text: 'balance?' }] }, { http: httpTool, apiKey: 'k' });
  expect(r1.tool.name).toBe('balance');
  const httpText = { post: async () => ({ data: { choices: [{ message: { content: 'Hola' } }] } }) };
  const r2 = await geminiChat({ systemPrompt: 'x', tools: [], messages: [] }, { http: httpText, apiKey: 'k' });
  expect(r2.text).toBe('Hola');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/varas/gemini.test.js`
Expected: FAIL — Cannot find module.

- [ ] **Step 3: Write minimal implementation**

```javascript
// gastos/src/varas/gemini.js
// Adaptador Gemini (OpenAI-compat) para VARAS, estilo ReAct: el modelo emite un JSON
// {"tool":...,"args":...} para llamar una tool, o responde texto. Encaja con responder().
const axios = require('axios');
const BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

function buildPromptChat({ systemPrompt = '', tools = [], messages = [] }) {
  const herramientas = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');
  const transcript = (messages || []).map((m) => {
    if (m.role === 'tool') return `RESULTADO de ${m.name || 'tool'}: ${m.text}`;
    if (m.role === 'assistant') return `VARAS: ${m.text}`;
    return `USUARIO: ${m.text}`;
  }).join('\n');
  return [
    systemPrompt,
    'Tienes estas herramientas:',
    herramientas,
    'Para usar UNA herramienta, responde EXACTAMENTE un JSON {"tool":"<nombre>","args":{...}} y NADA más.',
    'Cuando ya tengas los datos para responder, escribe la respuesta al usuario en texto normal (sin JSON).',
    'Conversación:',
    transcript,
  ].join('\n');
}

function parseSalida(content) {
  const s = String(content || '').trim();
  const fenced = s.replace(/```json/gi, '```').split('```');
  for (const c of [s, ...fenced]) {
    const a = c.indexOf('{'); const b = c.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        const obj = JSON.parse(c.slice(a, b + 1));
        if (obj && typeof obj.tool === 'string') return { tool: { name: obj.tool, args: obj.args || {} } };
      } catch (_) { /* no es JSON de tool */ }
    }
  }
  return { text: s };
}

async function geminiChat(payload, { http = axios, apiKey = process.env.GEMINI_API_KEY, model } = {}) {
  const m = model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const body = { model: m, messages: [{ role: 'user', content: buildPromptChat(payload) }], temperature: 0.1 };
  const res = await http.post(BASE, body, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 30000 });
  const content = res && res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message && res.data.choices[0].message.content || '';
  return parseSalida(content);
}

module.exports = { geminiChat, buildPromptChat, parseSalida };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/varas/gemini.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/varas/gemini.js gastos/tests/varas/gemini.test.js
git commit -m "feat(varas-f4): adaptador Gemini (ReAct) para el chat"
```

---

## Task 2: Ejecutar acciones (`varas/acciones.js`)

**Files:**
- Create: `gastos/src/varas/acciones.js`
- Test: `gastos/tests/varas/acciones.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/varas/acciones.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const cuentas = require('../../src/contabilidad/cuentas');
const { createExpense, getExpense } = require('../../src/expenses/repo');
const { ejecutarAccion } = require('../../src/varas/acciones');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await db.query("INSERT INTO companies (id, nombre, owner_whatsapp) VALUES ($1,'T','56999')", [COMPANY]);
  await cuentas.sembrarCuentas(db, COMPANY);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';

test('marcar_pagado por descripción marca el gasto', async () => {
  const db = await makeDb();
  const e = await createExpense(db, { company_id: COMPANY, tipo: 'gasto', total: 50000, proveedor: 'Arriendo Local', estado: 'confirmado', estado_pago: 'registrada' });
  const r = await ejecutarAccion(db, COMPANY, 'marcar_pagado', { descripcion: 'arriendo' }, {});
  expect(r.ok).toBe(true);
  const upd = await getExpense(db, e.id);
  expect(upd.estado_pago).toBe('pagado');
});

test('crear_asiento_manual crea asiento balanceado', async () => {
  const db = await makeDb();
  const cs = await cuentas.listCuentas(db, COMPANY);
  const r = await ejecutarAccion(db, COMPANY, 'crear_asiento_manual', { glosa: 'Ajuste', lineas: [{ cuenta_id: cs[0].id, debe: 1000, haber: 0 }, { cuenta_id: cs[1].id, debe: 0, haber: 1000 }] }, {});
  expect(r.ok).toBe(true);
  expect(r.asientoId).toBeTruthy();
});

test('enviar_resumen_whatsapp usa sendText inyectado', async () => {
  const db = await makeDb();
  let enviado = null;
  const sendText = async (to, text) => { enviado = { to, text }; return { ok: true }; };
  const r = await ejecutarAccion(db, COMPANY, 'enviar_resumen_whatsapp', {}, { sendText });
  expect(r.ok).toBe(true);
  expect(enviado.to).toBeTruthy();
});

test('acción desconocida -> error', async () => {
  const db = await makeDb();
  const r = await ejecutarAccion(db, COMPANY, 'formatear_disco', {}, {});
  expect(r.ok).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/varas/acciones.test.js`
Expected: FAIL — Cannot find module.

- [ ] **Step 3: Write minimal implementation**

```javascript
// gastos/src/varas/acciones.js
// Ejecuta las acciones que VARAS propuso y el dueño confirmó. Scoped por empresa.
const { markExpensePaid, getExpense } = require('../expenses/repo');
const { listExpenses } = require('../expenses/query');
const { aplicarContabilidad } = require('../contabilidad/contabilizar');
const { crearAsientoManual } = require('../contabilidad/manual');
const { cashflowSummary } = require('../expenses/summary');
const { formatCashflowSummary } = require('../whatsapp/format');
const { getCompanyWa } = require('../companies/repo');

async function _marcarPagado(db, companyId, args) {
  let id = args.expenseId;
  if (!id && args.descripcion) {
    const rows = await listExpenses(db, companyId, { proveedor: args.descripcion, estadoPago: 'registrada' });
    if (rows[0]) id = rows[0].id;
  }
  if (!id) return { ok: false, error: 'no_encontrado' };
  const upd = await markExpensePaid(db, companyId, id);
  if (!upd) return { ok: false, error: 'no_encontrado' };
  try { const exp = await getExpense(db, id); if (exp) await aplicarContabilidad(db, companyId, exp, 'pagar'); } catch (_) {}
  return { ok: true, expenseId: id };
}

async function _crearAsiento(db, companyId, args) {
  try { const a = await crearAsientoManual(db, companyId, args || {}); return { ok: true, asientoId: a.id }; }
  catch (e) { return { ok: false, error: e.code || 'invalido' }; }
}

async function _resumenWhatsapp(db, companyId, args, sendText) {
  const wa = await getCompanyWa(db, companyId);
  if (!wa || !wa.owner_whatsapp) return { ok: false, error: 'sin_whatsapp' };
  const d = new Date();
  const resumen = await cashflowSummary(db, companyId, { year: d.getFullYear(), month: d.getMonth() + 1 });
  const texto = formatCashflowSummary(resumen);
  await sendText(wa.owner_whatsapp, texto, wa);
  return { ok: true, to: wa.owner_whatsapp };
}

async function ejecutarAccion(db, companyId, tipo, args = {}, { sendText } = {}) {
  const _send = sendText || require('../whatsapp/client').sendText;
  if (tipo === 'marcar_pagado') return _marcarPagado(db, companyId, args);
  if (tipo === 'crear_asiento_manual') return _crearAsiento(db, companyId, args);
  if (tipo === 'enviar_resumen_whatsapp') return _resumenWhatsapp(db, companyId, args, _send);
  return { ok: false, error: 'accion_desconocida' };
}

module.exports = { ejecutarAccion };
```

> Nota: revisar la firma real de `getCompanyWa` (qué campos trae: `owner_whatsapp`, `wa_phone_number_id`, `wa_token`) y de `whatsapp/client.sendText` (parámetros). Ajustar la llamada `_send(...)` a la firma real (puede recibir `(to, text, { phoneNumberId, token })`). El test inyecta `sendText` y solo verifica que se llame con un `to`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/varas/acciones.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/varas/acciones.js gastos/tests/varas/acciones.test.js
git commit -m "feat(varas-f4): ejecutar acciones confirmadas (pagar/asiento/resumen)"
```

---

## Task 3: Endpoints `/varas/chat` y `/varas/accion` (app + panel)

**Files:**
- Modify: `gastos/src/app/router.js`, `gastos/src/panel/router.js`
- Test: `gastos/tests/varas/api.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/varas/api.test.js
const request = require('supertest');
const express = require('express');
require('express-async-errors');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { signToken } = require('../../src/auth/jwt');
const cuentas = require('../../src/contabilidad/cuentas');
const { createAppRouter } = require('../../src/app/router');

const COMPANY = '11111111-1111-1111-1111-111111111111';
const EMP = '22222222-2222-2222-2222-222222222222';

async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await db.query("INSERT INTO companies (id, nombre) VALUES ($1,'T')", [COMPANY]);
  await cuentas.sembrarCuentas(db, COMPANY);
  // Gemini fake: 1ª vez pide tool balance, 2ª responde texto.
  let n = 0;
  const varasGemini = async () => { n++; return n === 1 ? { tool: { name: 'balance', args: {} } } : { text: 'Tu balance cuadra.' }; };
  const app = express(); app.use(express.json());
  app.use('/api/app', createAppRouter({ db, varasGemini }));
  const token = signToken({ kind: 'employee', companyId: COMPANY, employeeId: EMP, rol: 'empleado' });
  return { app, token };
}

test('POST /varas/chat responde texto usando una tool', async () => {
  const { app, token } = await setup();
  const r = await request(app).post('/api/app/varas/chat').set('Authorization', `Bearer ${token}`).send({ messages: [{ role: 'user', text: '¿mi balance cuadra?' }] });
  expect(r.status).toBe(200);
  expect(r.body.reply).toMatch(/cuadra/i);
});

test('POST /varas/accion ejecuta una acción', async () => {
  const { app, token } = await setup();
  const cs = (await request(app).get('/api/app/cuentas').set('Authorization', `Bearer ${token}`)).body.cuentas;
  const r = await request(app).post('/api/app/varas/accion').set('Authorization', `Bearer ${token}`)
    .send({ tipo: 'crear_asiento_manual', args: { glosa: 'Ajuste', lineas: [{ cuenta_id: cs[0].id, debe: 1000, haber: 0 }, { cuenta_id: cs[1].id, debe: 0, haber: 1000 }] } });
  expect(r.status).toBe(200);
  expect(r.body.ok).toBe(true);
});

test('sin token -> 401', async () => {
  const { app } = await setup();
  expect((await request(app).post('/api/app/varas/chat').send({ messages: [] })).status).toBe(401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/varas/api.test.js`
Expected: FAIL — 404.

- [ ] **Step 3: Write minimal implementation**

En `gastos/src/app/router.js`: importar `const { responder } = require('../varas/chat'); const { geminiChat } = require('../varas/gemini'); const { ejecutarAccion } = require('../varas/acciones');`. Agregar `varasGemini` a los params de `createAppRouter({ ..., varasGemini })` y `const _varasGemini = varasGemini || geminiChat;`. En la región protegida:
```javascript
  router.post('/varas/chat', async (req, res) => {
    const messages = (req.body && req.body.messages) || [];
    res.json(await responder(db, req.auth.companyId, messages, { gemini: _varasGemini }));
  });
  router.post('/varas/accion', async (req, res) => {
    const b = req.body || {};
    res.json(await ejecutarAccion(db, req.auth.companyId, b.tipo, b.args || {}, { sendText: _sendText }));
  });
```
(`_sendText` ya existe en el router app. Si no, usa `require('../whatsapp/client').sendText`.)

En `gastos/src/panel/router.js`: mismos imports + `varasGemini` opcional en `createPanelRouter`, y las mismas 2 rutas en la región `requireKind('user')` (usar el sendText del panel si existe, o el de `whatsapp/client`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/varas/api.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/app/router.js gastos/src/panel/router.js gastos/tests/varas/api.test.js
git commit -m "feat(varas-f4): endpoints /varas/chat y /varas/accion (app + panel)"
```

---

## Task 4: Cierre F4a-2 — suite

- [ ] **Step 1: Suite backend**

Run: `cd gastos && npx jest`
Expected: PASS — todo verde, sin regresión.

- [ ] **Step 2: Commit final (si quedó algo)**

```bash
git add -A && git commit -m "test(varas-f4): suite F4a-2 verde" || echo "nada que commitear"
```

---

## Notas de cierre F4a-2

- VARAS ya responde por API (texto) con datos reales y puede ejecutar acciones confirmadas. El `geminiChat` por defecto se usa en producción; en tests se inyecta `varasGemini`.
- **Pendiente F4a-3/4 (UI):** chat de VARAS en la app (hub VARAS · Contabilidad) y en el panel — burbujas + input + botón "Confirmar" cuando hay `accionPropuesta` (→ `/varas/accion`). Métodos en `api.js` (`varasChat`, `varasAccion`).
- **Pendiente F4b:** voz (reusa Gemini Live de KALY).
- ⚠️ Trabajar SOLO en `HASH IA\`.
