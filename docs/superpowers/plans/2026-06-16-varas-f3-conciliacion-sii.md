# VARAS — Fase 3: Conciliación SII / IVA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que VARAS concilie el **libro de compras/ventas del SII** contra la contabilidad: cruza documento a documento (RUT+folio), detecta facturas que están en el SII y la empresa no capturó (y **propone crear el movimiento** para que el dueño confirme), y calcula el **cuadre de IVA del período** (crédito de compras vs débito de ventas, contable vs SII, IVA a pagar/favor) estilo F29.

**Architecture:** Paralelo a F2 pero eje tributario. El libro SII se lee con Gemini (OCR, igual patrón que cartola). El cruce y el IVA son **deterministas** (los montos tributarios deben cuadrar exactos — "cero conjeturas"; la IA solo lee el libro, no inventa cuadres). Pieza pura `match/sii.js` (conciliarSii: match por RUT+folio + resumen IVA). Endpoints nuevos en `/api/app`: subir libro SII → informe; confirmar faltante → crea el movimiento (reusa `createExpense` + `aplicarContabilidad` de F1). Se persiste en `conciliaciones` con `tipo='sii'` (tabla de F2a). UI: la sub-pestaña Conciliación de la app gana una subida "Libro SII" + render del informe tributario; el panel muestra el resumen de IVA.

**Tech Stack:** Node/Express, Gemini OpenAI-compat (inyectable), pg-mem/Jest/supertest; app React/Jest-RTL; panel lib.js. Sin deps nuevas.

**Worktree:** `C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112` — rama `claude/dazzling-driscoll-78a112`. Backend: `cd gastos && npx jest`. App: `cd gastos-app && npx jest`. Antes de commitear: `git branch --show-current` == `claude/dazzling-driscoll-78a112` (NO main).

**Decisiones (spec §6.6):** falta-capturar → VARAS propone crear el movimiento (dueño confirma); incluye cuadre de IVA F29; cruce + IVA deterministas; UI en la misma sub-pestaña Conciliación.

**Contrato del informe SII (lo que devuelve `conciliarSii` y la API):**
```
{ clase: { compras:N, ventas:M },
  faltantes: [{ clase:'compra'|'venta', tipo_doc, rut, folio, fecha, neto, iva, total }],  // en SII, no en contabilidad
  sobrantes: [{ expenseId, proveedor, folio, total }],                                       // en contabilidad, no en SII
  matched: [{ expenseId, folio, rut }],
  iva: { creditoContable, creditoSii, debitoContable, debitoSii, ivaPagarContable, ivaPagarSii, diferenciaCredito, diferenciaDebito } }
```

---

## File Structure

**Backend — Crear:**
- `gastos/src/ocr/libro-sii.js` — `parseLibroSii` (puro) + `geminiExtractLibroSii`.
- `gastos/src/match/sii.js` — `conciliarSii(docs, expenses, opts)` (puro): match RUT+folio + resumen IVA.
- Tests: `gastos/tests/match/libro-sii-parse.test.js`, `gastos/tests/match/sii.test.js`, `gastos/tests/match/api-sii.test.js`.

**Backend — Modificar:**
- `gastos/src/app/router.js` — `POST /match/libro-sii` (sube libro → informe SII, persiste tipo='sii') + `POST /match/sii/crear-movimiento` (confirma un faltante → createExpense + contabiliza). `createAppRouter` acepta `extractLibroSii` inyectable.

**App — Modificar:**
- `gastos-app/src/gastos/api.js` — `matchLibroSii(imageBase64, mime)`, `matchCrearMovimiento(doc)`.
- `gastos-app/src/gastos/MatchView.jsx` — segunda subida "Libro de Compras/Ventas SII" + render del informe SII (tarjeta IVA, faltantes con botón "Crear gasto/ingreso", sobrantes).
- Test: `gastos-app/tests/gastos/MatchSii.test.jsx`.

**Panel — Modificar:**
- `gastos/src/panel/router.js` — `/contabilidad/conciliacion` acepta `?tipo=sii|bancaria` (default bancaria).
- `gastos/public/panel/lib.js` — `ivaResumenHtml(informeSii)`.
- `gastos/public/panel/index.html` — mostrar IVA en la sub-pestaña Conciliación (selector bancaria/SII) — mínimo.
- Tests: `gastos/tests/panel/sii-lib.test.js`.

---

## Task 1: Parseo del libro SII (`ocr/libro-sii.js`)

**Files:**
- Create: `gastos/src/ocr/libro-sii.js`
- Test: `gastos/tests/match/libro-sii-parse.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/match/libro-sii-parse.test.js
const { parseLibroSii } = require('../../src/ocr/libro-sii');

test('parseLibroSii normaliza docs de compra y venta', () => {
  const json = JSON.stringify({ documentos: [
    { clase: 'compra', tipo_doc: 'factura', rut: '76.111.111-1', folio: '1234', fecha: '05/06/2026', neto: '10000', iva: '1900', total: '11900' },
    { clase: 'venta', tipo_doc: 'factura', rut: '77.222.222-2', folio: '88', fecha: '06/06/2026', neto: '20000', iva: '3800', total: '23800' },
  ] });
  const docs = parseLibroSii(json);
  expect(docs.length).toBe(2);
  expect(docs[0].clase).toBe('compra');
  expect(docs[0].folio).toBe('1234');
  expect(docs[0].neto).toBe(10000);
  expect(docs[0].iva).toBe(1900);
  expect(docs[1].clase).toBe('venta');
});

test('parseLibroSii descarta filas sin folio o sin monto', () => {
  const docs = parseLibroSii(JSON.stringify({ documentos: [
    { clase: 'compra', folio: '', total: '1000' },
    { clase: 'compra', folio: '9', total: '0' },
    { clase: 'compra', folio: '10', neto: '5000', iva: '950', total: '5950' },
  ] }));
  expect(docs.length).toBe(1);
  expect(docs[0].folio).toBe('10');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/match/libro-sii-parse.test.js`
Expected: FAIL — Cannot find module.

- [ ] **Step 3: Write minimal implementation**

```javascript
// gastos/src/ocr/libro-sii.js
// Lee un libro de compras/ventas del SII (imagen/PDF) → lista de DTE normalizados.
// parseLibroSii es la lógica pura testeable; geminiExtractLibroSii es el wrapper.
const axios = require('axios');
const { parseFecha, parseAmountClp } = require('../domain/normalize');
const { computeTotals } = require('../domain/money');
const BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

function looseParse(input) {
  if (input && typeof input === 'object') return input;
  const s = String(input || '');
  const fenced = s.replace(/```json/gi, '```').split('```');
  for (const c of [s, ...fenced]) {
    const a = c.indexOf('{'); const b = c.lastIndexOf('}');
    const a2 = c.indexOf('['); const b2 = c.lastIndexOf(']');
    for (const t of [a >= 0 && b > a ? c.slice(a, b + 1) : null, a2 >= 0 && b2 > a2 ? c.slice(a2, b2 + 1) : null]) {
      if (t) { try { return JSON.parse(t); } catch { /* sigue */ } }
    }
  }
  return {};
}

function parseLibroSii(input) {
  const obj = looseParse(input);
  const arr = Array.isArray(obj) ? obj : (obj.documentos || obj.docs || obj.movimientos || []);
  const out = [];
  for (const raw of (Array.isArray(arr) ? arr : [])) {
    if (!raw || typeof raw !== 'object') continue;
    const folio = String(raw.folio || raw.nro || '').trim();
    if (!folio) continue;
    const t = computeTotals({ neto: parseAmountClp(raw.neto), iva: parseAmountClp(raw.iva), total: parseAmountClp(raw.total) });
    if (t.total <= 0) continue;
    const clase = String(raw.clase || raw.tipo || '').toLowerCase().indexOf('vent') >= 0 ? 'venta' : 'compra';
    out.push({
      clase,
      tipo_doc: String(raw.tipo_doc || raw.tipo_documento || 'factura').toLowerCase(),
      rut: String(raw.rut || raw.rut_contraparte || '').trim(),
      folio,
      fecha: parseFecha(raw.fecha) || null,
      neto: t.neto, iva: t.iva, total: t.total,
    });
  }
  return out;
}

function buildLibroPrompt() {
  return [
    'Eres un extractor del libro de compras y ventas del SII de Chile.',
    'Devuelve SOLO un JSON { "documentos": [ ... ] }.',
    'Cada documento: clase ("compra" o "venta"), tipo_doc (factura|boleta|nota_credito|nota_debito|otro),',
    'rut (RUT de la contraparte), folio (número del documento), fecha (dd/mm/aaaa),',
    'neto (CLP entero), iva (CLP entero), total (CLP entero). No inventes; si falta, usa "" o 0.',
  ].join(' ');
}

async function geminiExtractLibroSii(imageBase64, mimeType = 'image/jpeg', { http = axios, apiKey = process.env.GEMINI_API_KEY } = {}) {
  const model = process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash';
  const body = { model, messages: [{ role: 'user', content: [
    { type: 'text', text: buildLibroPrompt() },
    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
  ] }], temperature: 0.1 };
  const res = await http.post(BASE, body, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 60000 });
  const content = res && res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message && res.data.choices[0].message.content || '';
  return parseLibroSii(content);
}

module.exports = { parseLibroSii, geminiExtractLibroSii };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/match/libro-sii-parse.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/ocr/libro-sii.js gastos/tests/match/libro-sii-parse.test.js
git commit -m "feat(varas-f3): parseo del libro de compras/ventas SII"
```

---

## Task 2: Conciliación SII + cuadre de IVA (`match/sii.js`)

**Files:**
- Create: `gastos/src/match/sii.js`
- Test: `gastos/tests/match/sii.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/match/sii.test.js
const { conciliarSii } = require('../../src/match/sii');

const docs = [
  { clase: 'compra', tipo_doc: 'factura', rut: '76.111.111-1', folio: '1234', fecha: '2026-06-05', neto: 10000, iva: 1900, total: 11900 },
  { clase: 'compra', tipo_doc: 'factura', rut: '76.999.999-9', folio: '5', fecha: '2026-06-07', neto: 5000, iva: 950, total: 5950 },
  { clase: 'venta', tipo_doc: 'factura', rut: '77.222.222-2', folio: '88', fecha: '2026-06-06', neto: 20000, iva: 3800, total: 23800 },
];
// Contabilidad: tiene la compra 1234 (gasto) y la venta 88 (ingreso); le falta la compra folio 5.
const expenses = [
  { id: 'e1', tipo: 'gasto', rut_emisor: '76.111.111-1', folio: '1234', neto: 10000, iva: 1900, total: 11900 },
  { id: 'i1', tipo: 'ingreso', rut_emisor: '77.222.222-2', folio: '88', neto: 20000, iva: 3800, total: 23800 },
];

test('detecta faltante (en SII no en contabilidad) y matchea el resto', () => {
  const r = conciliarSii(docs, expenses);
  expect(r.clase.compras).toBe(2);
  expect(r.clase.ventas).toBe(1);
  expect(r.faltantes.length).toBe(1);
  expect(r.faltantes[0].folio).toBe('5');
  expect(r.faltantes[0].clase).toBe('compra');
  expect(r.matched.length).toBe(2);
});

test('cuadre de IVA: crédito y débito contable vs SII', () => {
  const r = conciliarSii(docs, expenses);
  // SII: crédito = 1900 + 950 = 2850 ; débito = 3800
  expect(r.iva.creditoSii).toBe(2850);
  expect(r.iva.debitoSii).toBe(3800);
  // Contable: crédito = 1900 (solo la 1234) ; débito = 3800
  expect(r.iva.creditoContable).toBe(1900);
  expect(r.iva.debitoContable).toBe(3800);
  // IVA a pagar SII = 3800 - 2850 = 950 ; contable = 3800 - 1900 = 1900
  expect(r.iva.ivaPagarSii).toBe(950);
  expect(r.iva.ivaPagarContable).toBe(1900);
  expect(r.iva.diferenciaCredito).toBe(950); // crédito que falta registrar
});

test('sobrante: registrado en contabilidad pero no en el SII', () => {
  const r = conciliarSii([], [{ id: 'x', tipo: 'gasto', rut_emisor: '1-9', folio: '999', total: 1000, iva: 0 }]);
  expect(r.sobrantes.length).toBe(1);
  expect(r.sobrantes[0].expenseId).toBe('x');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/match/sii.test.js`
Expected: FAIL — Cannot find module.

- [ ] **Step 3: Write minimal implementation**

```javascript
// gastos/src/match/sii.js
// Conciliación tributaria (determinística): cruza el libro SII contra la contabilidad
// por RUT+folio y calcula el cuadre de IVA del período. "Cero conjeturas".
const { normalizeRut } = require('../domain/normalize');

function _int(n) { return Math.round(Number(n) || 0); }
function keyDoc(rut, folio) { return normalizeRut(rut || '') + '|' + String(folio || '').trim().toLowerCase(); }
function esGasto(e) { return (e.tipo || 'gasto') !== 'ingreso'; }

function conciliarSii(docs = [], expenses = [], opts = {}) {
  const expByKey = new Map();
  for (const e of expenses) expByKey.set(keyDoc(e.rut_emisor, e.folio), e);

  const faltantes = []; const matched = []; const usados = new Set();
  let creditoSii = 0, debitoSii = 0, compras = 0, ventas = 0;

  for (const d of docs) {
    if (d.clase === 'venta') { ventas++; debitoSii += _int(d.iva); } else { compras++; creditoSii += _int(d.iva); }
    const hit = expByKey.get(keyDoc(d.rut, d.folio));
    if (hit) { matched.push({ expenseId: hit.id, folio: d.folio, rut: d.rut }); usados.add(hit.id); }
    else { faltantes.push({ clase: d.clase, tipo_doc: d.tipo_doc, rut: d.rut, folio: d.folio, fecha: d.fecha, neto: _int(d.neto), iva: _int(d.iva), total: _int(d.total) }); }
  }

  // IVA contable: de los expenses (gasto→crédito, ingreso→débito)
  let creditoContable = 0, debitoContable = 0;
  const docKeys = new Set(docs.map((d) => keyDoc(d.rut, d.folio)));
  const sobrantes = [];
  for (const e of expenses) {
    if (esGasto(e)) creditoContable += _int(e.iva); else debitoContable += _int(e.iva);
    if (!docKeys.has(keyDoc(e.rut_emisor, e.folio))) sobrantes.push({ expenseId: e.id, proveedor: e.proveedor || '', folio: e.folio || '', total: _int(e.total) });
  }

  return {
    clase: { compras, ventas },
    faltantes, matched, sobrantes,
    iva: {
      creditoContable, creditoSii, debitoContable, debitoSii,
      ivaPagarContable: debitoContable - creditoContable,
      ivaPagarSii: debitoSii - creditoSii,
      diferenciaCredito: creditoSii - creditoContable,
      diferenciaDebito: debitoSii - debitoContable,
    },
  };
}

module.exports = { conciliarSii, keyDoc };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/match/sii.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/match/sii.js gastos/tests/match/sii.test.js
git commit -m "feat(varas-f3): conciliacion SII + cuadre de IVA (deterministico)"
```

---

## Task 3: API — subir libro SII + crear movimiento faltante

**Files:**
- Modify: `gastos/src/app/router.js`
- Test: `gastos/tests/match/api-sii.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/match/api-sii.test.js
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

async function makeApp() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await cuentas.sembrarCuentas(db, COMPANY);
  const extractLibroSii = async () => ([
    { clase: 'compra', tipo_doc: 'factura', rut: '76.111.111-1', folio: '1234', fecha: '2026-06-05', neto: 10000, iva: 1900, total: 11900 },
  ]);
  const app = express(); app.use(express.json());
  app.use('/api/app', createAppRouter({ db, extractLibroSii }));
  const token = signToken({ kind: 'employee', companyId: COMPANY, employeeId: EMP, rol: 'empleado' });
  return { app, token, db };
}

test('POST /match/libro-sii devuelve informe con faltantes e IVA', async () => {
  const { app, token } = await makeApp();
  const r = await request(app).post('/api/app/match/libro-sii').set('Authorization', `Bearer ${token}`).send({ imageBase64: 'x', mimeType: 'image/jpeg' });
  expect(r.status).toBe(200);
  expect(r.body.faltantes.length).toBe(1);
  expect(r.body.iva.creditoSii).toBe(1900);
});

test('POST /match/sii/crear-movimiento registra y contabiliza el faltante', async () => {
  const { app, token, db } = await makeApp();
  const r = await request(app).post('/api/app/match/sii/crear-movimiento').set('Authorization', `Bearer ${token}`)
    .send({ clase: 'compra', rut: '76.111.111-1', folio: '1234', fecha: '2026-06-05', neto: 10000, iva: 1900, total: 11900, tipo_doc: 'factura' });
  expect(r.status).toBe(200);
  expect(r.body.ok).toBe(true);
  expect(r.body.expenseId).toBeTruthy();
  const exp = await db.query('SELECT * FROM expenses WHERE id=$1', [r.body.expenseId]);
  expect(exp.rows[0].tipo).toBe('gasto');
  expect(Number(exp.rows[0].total)).toBe(11900);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/match/api-sii.test.js`
Expected: FAIL — routes 404.

- [ ] **Step 3: Write minimal implementation**

En `gastos/src/app/router.js`:
1. Imports arriba: `const { conciliarSii } = require('../match/sii');`, `const { mapCategoryToSii } = require('../domain/categories');`, y `const { createExpense } = require('../expenses/repo');` (si no está ya importado — `getExpense` etc. ya están; agregar `createExpense` si falta).
2. `createAppRouter({ db, extractExpense, createLiveToken, sendText, extractCartola, componer, extractLibroSii } = {})` + `const _extractLibroSii = extractLibroSii || ((b64, mime) => require('../ocr/libro-sii').geminiExtractLibroSii(b64, mime));`
3. Agregar (después de las rutas de match, en la región protegida):

```javascript
  router.post('/match/libro-sii', async (req, res) => {
    const { imageBase64, mimeType } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'falta_imagen' });
    let docs;
    try { docs = await _extractLibroSii(imageBase64, mimeType || 'image/jpeg'); }
    catch (e) { return res.status(502).json({ error: 'ocr_libro', detalle: e.message }); }
    const aux = await db.query(`SELECT * FROM expenses WHERE company_id=$1 AND estado <> 'anulado'`, [req.auth.companyId]);
    const informe = conciliarSii(docs, aux.rows);
    try { await require('../match/repo').guardarConciliacion(db, req.auth.companyId, 'sii', { sca: informe.iva.ivaPagarContable, sba: informe.iva.ivaPagarSii, cuadrado: informe.iva.diferenciaCredito === 0 && informe.iva.diferenciaDebito === 0, partidas: informe.faltantes, suggested: [], exceptions: informe.sobrantes }); } catch (e) { /* no romper */ }
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
```

(`aplicarContabilidad` ya está importado de F1. `guardarConciliacion` se llama con un mapeo simple: usa los campos sca/sba como IVA-a-pagar contable/SII para reutilizar la tabla `conciliaciones`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/match/api-sii.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Run full backend suite**

Run: `cd gastos && npx jest`
Expected: PASS — todo verde (sin regresión; `createAppRouter` ahora acepta `extractLibroSii` opcional).

- [ ] **Step 6: Commit**

```bash
git add gastos/src/app/router.js gastos/tests/match/api-sii.test.js
git commit -m "feat(varas-f3): API subir libro SII + crear movimiento faltante"
```

---

## Task 4: App — api.js métodos SII

**Files:**
- Modify: `gastos-app/src/gastos/api.js`

- [ ] **Step 1: Agregar métodos**

En el objeto `api`, junto a los de Match:

```javascript
  matchLibroSii(imageBase64, mimeType = 'image/jpeg') { return req('/api/app/match/libro-sii', { method: 'POST', body: { imageBase64, mimeType } }); },
  matchCrearMovimiento(doc) { return req('/api/app/match/sii/crear-movimiento', { method: 'POST', body: doc }); },
```

- [ ] **Step 2: Commit** (validado por la Task 5)

```bash
git add gastos-app/src/gastos/api.js
git commit -m "feat(varas-f3): metodos matchLibroSii y matchCrearMovimiento en api.js"
```

---

## Task 5: App — MatchView gana subida "Libro SII" + render del informe tributario

**Files:**
- Modify: `gastos-app/src/gastos/MatchView.jsx`
- Test: `gastos-app/tests/gastos/MatchSii.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// gastos-app/tests/gastos/MatchSii.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MatchView from '../../src/gastos/MatchView.jsx';
import { api } from '../../src/gastos/api';

jest.mock('../../src/gastos/api');
let intakeCb;
jest.mock('../../src/components/EvidenceIntake.jsx', () => ({ onChange }) => { intakeCb = onChange; return <button onClick={() => onChange([{ imageBase64: 'x', imageMimeType: 'image/jpeg' }])}>subir</button>; });

const informeSii = {
  docs: [], clase: { compras: 1, ventas: 0 },
  faltantes: [{ clase: 'compra', tipo_doc: 'factura', rut: '76.111.111-1', folio: '1234', fecha: '2026-06-05', neto: 10000, iva: 1900, total: 11900 }],
  sobrantes: [], matched: [],
  iva: { creditoContable: 0, creditoSii: 1900, debitoContable: 0, debitoSii: 0, ivaPagarContable: 0, ivaPagarSii: -1900, diferenciaCredito: 1900, diferenciaDebito: 0 },
};

beforeEach(() => {
  api.matchLibroSii = jest.fn().mockResolvedValue(informeSii);
  api.matchCrearMovimiento = jest.fn().mockResolvedValue({ ok: true, expenseId: 'e9' });
  api.matchCartola = jest.fn();
});

test('subir libro SII muestra IVA y faltantes, y permite crear el movimiento', async () => {
  render(<MatchView />);
  // cambiar a modo "Libro SII"
  fireEvent.click(screen.getByRole('button', { name: /libro sii|compras\/ventas/i }));
  fireEvent.click(screen.getByText('subir'));
  await waitFor(() => expect(api.matchLibroSii).toHaveBeenCalled());
  expect(await screen.findByText(/1234/)).toBeInTheDocument();
  expect(screen.getByText(/IVA/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /crear gasto|crear movimiento/i }));
  await waitFor(() => expect(api.matchCrearMovimiento).toHaveBeenCalledWith(expect.objectContaining({ folio: '1234' })));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos-app && npx jest tests/gastos/MatchSii.test.jsx`
Expected: FAIL — no "Libro SII" mode.

- [ ] **Step 3: Write implementation**

Modificar `gastos-app/src/gastos/MatchView.jsx`: agregar un estado `modo` ('banco' | 'sii') con dos botones arriba ("Cartola bancaria" / "Libro de Compras/Ventas SII"); el `onChange` del EvidenceIntake llama `api.matchCartola` si modo==='banco' o `api.matchLibroSii` si modo==='sii'; guardar el resultado en `inf` (banco) o `siiInf` (sii). Renderizar el informe SII cuando `modo==='sii' && siiInf`:
- Tarjeta IVA: crédito (compras) y débito (ventas), contable vs SII, y "IVA a pagar" (ivaPagarSii). 
- Faltantes: lista con el folio/proveedor/total y botón **"Crear gasto"/"Crear ingreso"** (según `clase`) → `api.matchCrearMovimiento(faltante)` → marca ✓.
- Sobrantes: lista informativa.

Código del bloque SII (insertar en el render, y los dos botones de modo encima del EvidenceIntake; mantener el render bancario existente bajo `modo==='banco'`):

```jsx
// estados nuevos (junto a los existentes):
const [modo, setModo] = useState('banco');
const [siiInf, setSiiInf] = useState(null);
const [siiHechos, setSiiHechos] = useState(() => new Set());

// dentro de onChange, reemplazar la llamada única por:
//   if (modo === 'sii') { const r = await api.matchLibroSii(ev.imageBase64, ev.imageMimeType||'image/jpeg'); setSiiInf(r); }
//   else { const r = await api.matchCartola(...); setInf(r); }

async function crearMovimiento(f, i) {
  try { await api.matchCrearMovimiento(f); setSiiHechos((p) => new Set([...p, i])); } catch (_e) { /* noop */ }
}
```

Selector de modo (encima del EvidenceIntake):
```jsx
<div className="flex gap-1 shrink-0">
  <button onClick={() => setModo('banco')} className={`flex-1 text-xs font-bold px-3 py-1.5 rounded-lg border ${modo === 'banco' ? 'text-white bg-[#b91c1c] border-[#b91c1c]' : 'opacity-60'}`}>Cartola bancaria</button>
  <button onClick={() => setModo('sii')} className={`flex-1 text-xs font-bold px-3 py-1.5 rounded-lg border ${modo === 'sii' ? 'text-white bg-[#b91c1c] border-[#b91c1c]' : 'opacity-60'}`}>Libro Compras/Ventas SII</button>
</div>
```

Bloque de render SII:
```jsx
{modo === 'sii' && siiInf ? (
  <div className="grid gap-3 pt-1">
    <div className="rounded-2xl border p-3" style={{ borderColor: '#C9A24B55' }}>
      <div className="text-xs font-black mb-1">Cuadre de IVA</div>
      <div className="grid grid-cols-2 gap-2 text-center text-sm">
        <div><div className="text-[10px] opacity-60">IVA crédito (compras)</div><div className="font-black">{clp(siiInf.iva.creditoContable)} <span className="opacity-50">/ SII {clp(siiInf.iva.creditoSii)}</span></div></div>
        <div><div className="text-[10px] opacity-60">IVA débito (ventas)</div><div className="font-black">{clp(siiInf.iva.debitoContable)} <span className="opacity-50">/ SII {clp(siiInf.iva.debitoSii)}</span></div></div>
      </div>
      <div className="text-center text-sm font-black mt-2">IVA a pagar (SII): {clp(siiInf.iva.ivaPagarSii)}</div>
      {siiInf.iva.diferenciaCredito ? <div className="text-[11px] text-center mt-1" style={{ color: '#C9A24B' }}>Te falta registrar {clp(siiInf.iva.diferenciaCredito)} de IVA crédito.</div> : null}
    </div>
    {(siiInf.faltantes || []).length ? (
      <div className="grid gap-2">
        <div className="text-xs font-black opacity-70">Falta capturar (están en el SII)</div>
        {siiInf.faltantes.map((f, i) => {
          const done = siiHechos.has(i);
          return (
            <div key={i} className="rounded-xl border p-3 text-sm" style={{ borderColor: '#C9A24B55' }}>
              <div className="flex justify-between gap-2"><span className="font-bold truncate">{f.clase === 'venta' ? 'Venta' : 'Compra'} · folio {f.folio}</span><span className="font-black">{clp(f.total)}</span></div>
              <div className="text-[11px] opacity-60">{f.rut} · {fechaCorta(f.fecha)}</div>
              {done ? <div className="text-xs font-bold mt-1" style={{ color: '#1f7a3f' }}>✓ Registrado</div>
                    : <button onClick={() => crearMovimiento(f, i)} className="mt-2 rounded-lg text-black font-black text-xs px-3 py-1.5" style={{ background: '#C9A24B' }}>{f.clase === 'venta' ? 'Crear ingreso' : 'Crear gasto'}</button>}
            </div>
          );
        })}
      </div>
    ) : <div className="opacity-60 text-sm">Todo lo del SII está registrado. 🎉</div>}
  </div>
) : null}
```

(El render bancario existente se condiciona a `modo === 'banco'`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos-app && npx jest tests/gastos/MatchSii.test.jsx && npx jest tests/gastos/MatchView.test.jsx`
Expected: PASS (nuevo + el de F2b sin regresión).

- [ ] **Step 5: Commit**

```bash
git add gastos-app/src/gastos/MatchView.jsx gastos-app/tests/gastos/MatchSii.test.jsx
git commit -m "feat(varas-f3): MatchView modo Libro SII (cuadre IVA + crear faltantes)"
```

---

## Task 6: Panel — IVA en la sub-pestaña Conciliación

**Files:**
- Modify: `gastos/src/panel/router.js` (param `?tipo=`)
- Modify: `gastos/public/panel/lib.js` (`ivaResumenHtml`)
- Modify: `gastos/public/panel/index.html`
- Test: `gastos/tests/panel/sii-lib.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/panel/sii-lib.test.js
const lib = require('../../public/panel/lib');

test('ivaResumenHtml muestra crédito/débito y IVA a pagar', () => {
  const html = lib.ivaResumenHtml({ sca: 1900, sba: 950 }); // sca=ivaPagarContable, sba=ivaPagarSii (como se persiste)
  expect(html.toLowerCase()).toContain('iva');
  expect(html).toContain(lib.fmtClp(950));
});

test('ivaResumenHtml con null', () => {
  expect(lib.ivaResumenHtml(null).toLowerCase()).toContain('sin');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/panel/sii-lib.test.js`
Expected: FAIL — `lib.ivaResumenHtml is not a function`.

- [ ] **Step 3: Write implementation**

1. `gastos/src/panel/router.js`: en `GET /contabilidad/conciliacion`, leer `req.query.tipo` (default 'bancaria') y pasarlo a `getUltima`:
```javascript
  router.get('/contabilidad/conciliacion', async (req, res) => {
    const tipo = req.query.tipo === 'sii' ? 'sii' : 'bancaria';
    const u = await matchRepo.getUltima(db, req.auth.companyId, tipo);
    if (!u) return res.json({ conciliacion: null });
    res.json(u);
  });
```
2. `gastos/public/panel/lib.js`: agregar y exponer:
```javascript
  function ivaResumenHtml(inf) {
    if (!inf) return '<p class="muted" style="padding:8px">Sin conciliación SII todavía.</p>';
    return '<div class="flujo-tot">IVA a pagar (contable): <b>' + fmtClp(inf.sca) + '</b> · IVA a pagar (SII): <b>' + fmtClp(inf.sba) + '</b></div>';
  }
```
3. `gastos/public/panel/index.html`: en la rama `conciliacion` de `loadContabilidad`, si existe un selector tipo (o por simplicidad) — mínimo: agrega un segundo sub-botón `data-libro="iva"` que hace `apiFetch('/contabilidad/conciliacion?tipo=sii')` y renderiza `PanelLib.ivaResumenHtml(data && data.conciliacion === null ? null : data)`. (Sigue el mismo patrón que la rama `conciliacion`.)

- [ ] **Step 4: Run tests**

Run: `cd gastos && npx jest tests/panel/`
Expected: PASS (todos los de panel + el nuevo).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/panel/router.js gastos/public/panel/lib.js gastos/public/panel/index.html gastos/tests/panel/sii-lib.test.js
git commit -m "feat(varas-f3): panel resumen de IVA (conciliacion SII)"
```

---

## Task 7: Cierre F3 — suites + build + review

- [ ] **Step 1: Backend + app + build**

Run: `cd gastos && npx jest` (verde) ; `cd gastos-app && npx jest && npm run build` (verde + build OK).

- [ ] **Step 2: Commit final (si quedó algo)**

```bash
git add -A && git commit -m "test(varas-f3): suites verdes F3" || echo "nada que commitear"
```

---

## Notas de cierre F3

- **Determinismo a propósito:** el cruce de documentos y el IVA son exactos (RUT+folio, aritmética CLP). La IA solo LEE el libro (OCR). Para datos tributarios, exactitud > inferencia.
- **Crear movimiento faltante:** registra un `expense` confirmado (con cuenta SII mapeada para gastos) y lo contabiliza (devengo) vía `aplicarContabilidad`. El dueño confirma cada uno (no masivo) en esta fase.
- **Deploy F3:** `deploy-gastos-wt.js` (la tabla `conciliaciones` ya existe; `tipo='sii'` reusa columnas) + rebuild APK (bump versionCode + APP_VERSION) + `upload-apk-wt.js`.
- **Mejoras futuras:** auto-detección cartola vs libro SII en una sola subida (hoy es selector explícito); registro masivo de faltantes; conexión directa al SII por API (sin foto).
- ⚠️ José edita KALY en paralelo en esta rama.