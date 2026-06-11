# Atiko Gastos MVP — Roadmap de planes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-06-09-atiko-gastos-design.md`

El MVP se descompone en 6 planes secuenciales. Cada uno deja software funcionando y testeable.

| # | Plan | Entrega | Depende de |
|---|------|---------|-----------|
| 1 | **Fundación + motor OCR** (este doc) | Backend `gastos/` + DB + pipeline que convierte una imagen en un gasto estructurado (Document AI + Gemini), con math CLP y mapeo SII. | — |
| 2 | Canal WhatsApp | Webhook multi-número, resolución de tenant/empleado, flujo captura+confirma, resumen al dueño (programado + a demanda). | 1 |
| 3 | API app + Auth + Panel API | JWT, login empleado, subir/confirmar/editar, "mis gastos", API del panel (listar/filtrar/Excel). | 1 |
| 4 | App Android (Capacitor) | App nueva reusando los plugins de captura de Matico + login + captura→subir→confirmar + "mis gastos". | 3 |
| 5 | Panel web del dueño | Dashboard branded: tabla, filtros por columna, descarga Excel, gestión de empleados, ajustes. | 3 |
| 6 | Deploy + onboarding | `deploy-gastos.js`, bloque Caddy, contenedor Postgres en VPS, alta de 1 cliente real. | 1-5 |

Solo el **Plan 1** está escrito en detalle abajo. Los planes 2-6 se escriben al completar el anterior.

---

# Plan 1 — Fundación + motor OCR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el backend base de `atiko-gastos` y el motor que toma la imagen de una boleta/factura y devuelve un gasto estructurado (tipo doc, RUT, folio, dirección, proveedor, fecha, neto/IVA/total CLP, categoría + cuenta SII, glosa, confianza), persistido en Postgres.

**Architecture:** Servicio Node/Express nuevo en `gastos/`, 100% aparte del agente KAI. El pipeline OCR es híbrido: Document AI (motor de boletas) + Gemini Flash (campos chilenos), unidos por un orquestador que normaliza, reconcilia montos en CLP y mapea la categoría a cuenta SII. La lógica pura (math, normalización, mapeo, merge) se prueba con TDD mockeando las llamadas externas; la capa DB se prueba con `pg-mem` (Postgres en memoria, corre en Windows sin Docker).

**Tech Stack:** Node.js, Express, `pg`, `pg-mem` (tests DB), Jest, `@google-cloud/documentai`, `axios` (Gemini vía endpoint OpenAI-compat de Google AI Studio), `sharp` (preprocesado de imagen).

---

## Estructura de archivos (Plan 1)

```
gastos/
  package.json
  jest.config.js
  .env.example
  src/
    server.js              # Express app + health
    db/
      pool.js              # pool pg (lee GASTOS_DB_URL)
      schema.sql           # DDL companies/employees/expenses/users
      migrate.js           # aplica schema.sql
    domain/
      categories.js        # CATEGORIES + SII_ACCOUNTS + mapCategoryToSii
      money.js             # computeTotals (CLP, IVA 19%)
      normalize.js         # normalizeRut, parseAmountClp, parseFecha
    ocr/
      preprocess.js        # processDocumentImage (sharp)
      documentai.js        # documentAiExtract (adapter)
      gemini.js            # geminiExtract (adapter) + parseJsonLoose
      extract.js           # extractExpense (orquestador merge)
    expenses/
      repo.js              # createExpense/getExpense/confirmExpense/updateExpense
  tests/
    domain/categories.test.js
    domain/money.test.js
    domain/normalize.test.js
    ocr/gemini.test.js
    ocr/documentai.test.js
    ocr/extract.test.js
    expenses/repo.test.js
    server.test.js
```

> **Ubicación local:** carpeta nueva `gastos/` en la raíz del repo (este worktree), **trackeada en git** (a diferencia del agente, que quedó untrackeado). Despliega a `/root/atiko-gastos` en el VPS (Plan 6).

---

## Task 1: Scaffold del proyecto + health endpoint

**Files:**
- Create: `gastos/package.json`
- Create: `gastos/jest.config.js`
- Create: `gastos/.env.example`
- Create: `gastos/src/server.js`
- Test: `gastos/tests/server.test.js`

- [ ] **Step 1: Crear `gastos/package.json`**

```json
{
  "name": "atiko-gastos",
  "version": "0.1.0",
  "private": true,
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "test": "jest --runInBand"
  },
  "dependencies": {
    "@google-cloud/documentai": "^8.7.0",
    "axios": "^1.7.0",
    "dotenv": "^16.4.0",
    "express": "^4.19.0",
    "pg": "^8.11.0",
    "sharp": "^0.33.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "pg-mem": "^3.0.0",
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 2: Crear `gastos/jest.config.js`**

```js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  clearMocks: true,
};
```

- [ ] **Step 3: Crear `gastos/.env.example`**

```
PORT=3100
GASTOS_DB_URL=postgres://atiko:CHANGEME@127.0.0.1:5434/atiko_gastos
GEMINI_API_KEY=
GEMINI_VISION_MODEL=gemini-2.5-flash
DOCAI_PROJECT_ID=
DOCAI_LOCATION=us
DOCAI_PROCESSOR_ID=
JWT_SECRET=CHANGEME
```

- [ ] **Step 4: Instalar dependencias**

Run: `cd gastos && npm install`
Expected: instala sin errores; crea `node_modules` y `package-lock.json`.

- [ ] **Step 5: Escribir el test que falla**

```js
// gastos/tests/server.test.js
const request = require('supertest');
const { app } = require('../src/server');

test('GET /health responde ok', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ status: 'ok', service: 'atiko-gastos' });
});
```

- [ ] **Step 6: Correr el test y verificar que falla**

Run: `cd gastos && npx jest tests/server.test.js`
Expected: FAIL — `Cannot find module '../src/server'`.

- [ ] **Step 7: Implementar `gastos/src/server.js`**

```js
require('dotenv').config();
const express = require('express');

const app = express();
app.use(express.json({ limit: '15mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'atiko-gastos' });
});

if (require.main === module) {
  const port = process.env.PORT || 3100;
  app.listen(port, () => console.log(`atiko-gastos en :${port}`));
}

module.exports = { app };
```

- [ ] **Step 8: Correr el test y verificar que pasa**

Run: `cd gastos && npx jest tests/server.test.js`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add gastos/package.json gastos/package-lock.json gastos/jest.config.js gastos/.env.example gastos/src/server.js gastos/tests/server.test.js
git commit -m "feat(gastos): scaffold backend + health endpoint"
```

---

## Task 2: Categorías fijas + mapeo a cuenta SII

**Files:**
- Create: `gastos/src/domain/categories.js`
- Test: `gastos/tests/domain/categories.test.js`

- [ ] **Step 1: Escribir el test que falla**

```js
// gastos/tests/domain/categories.test.js
const { CATEGORIES, mapCategoryToSii, isValidCategory } = require('../../src/domain/categories');

test('hay 13 categorías y todas son válidas', () => {
  expect(CATEGORIES).toHaveLength(13);
  expect(isValidCategory('Honorarios')).toBe(true);
  expect(isValidCategory('No existe')).toBe(false);
});

test('mapea categoría a su cuenta SII', () => {
  expect(mapCategoryToSii('Honorarios')).toEqual({
    codigo: '4.3.90.1',
    nombre: 'Honorarios',
  });
  expect(mapCategoryToSii('Mercadería e insumos del giro')).toEqual({
    codigo: '4.2.10.1',
    nombre: 'Costos Directos del Giro',
  });
});

test('categoría desconocida cae en Otros gastos', () => {
  expect(mapCategoryToSii('cualquier cosa')).toEqual({
    codigo: '4.3.150.1',
    nombre: 'Otros Gastos de Administración y Venta',
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd gastos && npx jest tests/domain/categories.test.js`
Expected: FAIL — `Cannot find module`.

- [ ] **Step 3: Implementar `gastos/src/domain/categories.js`**

```js
// Set fijo chileno → cuenta del plan SII Mipyme. Ver spec §6.1.
const OTROS = { codigo: '4.3.150.1', nombre: 'Otros Gastos de Administración y Venta' };

const CATEGORY_TO_SII = {
  'Mercadería e insumos del giro': { codigo: '4.2.10.1', nombre: 'Costos Directos del Giro' },
  'Alimentación y representación': OTROS,
  'Combustible y transporte': OTROS,
  'Mantención y reparaciones': { codigo: '4.3.40.1', nombre: 'Reparaciones Automóviles' },
  'Arriendos': OTROS,
  'Servicios básicos': { codigo: '4.3.10.1', nombre: 'Gastos Generales' },
  'Útiles de oficina / generales': { codigo: '4.3.10.1', nombre: 'Gastos Generales' },
  'Seguros': OTROS,
  'Publicidad y promoción': { codigo: '4.3.140.1', nombre: 'Gasto Promoción' },
  'Honorarios': { codigo: '4.3.90.1', nombre: 'Honorarios' },
  'Contribuciones, patentes e impuestos': { codigo: '4.3.20.1', nombre: 'Contribuciones' },
  'Gastos financieros': { codigo: '4.5.10.1', nombre: 'Gastos Financieros' },
  'Otros gastos': OTROS,
};

const CATEGORIES = Object.keys(CATEGORY_TO_SII);

function isValidCategory(cat) {
  return Object.prototype.hasOwnProperty.call(CATEGORY_TO_SII, cat);
}

function mapCategoryToSii(cat) {
  return CATEGORY_TO_SII[cat] || OTROS;
}

module.exports = { CATEGORIES, CATEGORY_TO_SII, isValidCategory, mapCategoryToSii };
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd gastos && npx jest tests/domain/categories.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gastos/src/domain/categories.js gastos/tests/domain/categories.test.js
git commit -m "feat(gastos): categorias fijas CL + mapeo a cuenta SII"
```

---

## Task 3: Aritmética de montos CLP (computeTotals)

**Files:**
- Create: `gastos/src/domain/money.js`
- Test: `gastos/tests/domain/money.test.js`

Regla: montos en pesos CLP enteros (sin decimales). IVA por defecto 19%. Se reconcilia a partir
de lo que venga: si hay total y no neto → neto = round(total / 1.19), iva = total - neto. Si hay
neto y no total → iva = round(neto * 0.19), total = neto + iva. Si vienen los tres, se respeta
total y se recalcula iva = total - neto (neto manda sobre iva).

- [ ] **Step 1: Escribir el test que falla**

```js
// gastos/tests/domain/money.test.js
const { computeTotals } = require('../../src/domain/money');

test('desde total deriva neto e iva (19%)', () => {
  expect(computeTotals({ total: 25000 })).toEqual({ neto: 21008, iva: 3992, total: 25000 });
});

test('desde neto deriva iva y total', () => {
  expect(computeTotals({ neto: 21008 })).toEqual({ neto: 21008, iva: 3992, total: 25000 });
});

test('con neto y total, iva = total - neto', () => {
  expect(computeTotals({ neto: 20000, total: 25000 })).toEqual({ neto: 20000, iva: 5000, total: 25000 });
});

test('iva 0 cuando no hay datos', () => {
  expect(computeTotals({})).toEqual({ neto: 0, iva: 0, total: 0 });
});

test('redondea a entero y nunca negativo', () => {
  const r = computeTotals({ total: 1000 });
  expect(Number.isInteger(r.neto)).toBe(true);
  expect(r.iva).toBeGreaterThanOrEqual(0);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd gastos && npx jest tests/domain/money.test.js`
Expected: FAIL — `Cannot find module`.

- [ ] **Step 3: Implementar `gastos/src/domain/money.js`**

```js
const IVA_PCT = 0.19;

function toInt(n) {
  const v = Math.round(Number(n) || 0);
  return v > 0 ? v : 0;
}

// Reconcilia neto/iva/total en CLP entero. neto manda sobre iva cuando ambos + total existen.
function computeTotals({ neto, iva, total } = {}) {
  let n = toInt(neto);
  let t = toInt(total);

  if (n > 0 && t > 0) {
    return { neto: n, iva: Math.max(0, t - n), total: t };
  }
  if (t > 0) {
    n = Math.round(t / (1 + IVA_PCT));
    return { neto: n, iva: t - n, total: t };
  }
  if (n > 0) {
    const i = Math.round(n * IVA_PCT);
    return { neto: n, iva: i, total: n + i };
  }
  const i = toInt(iva);
  if (i > 0) {
    return { neto: 0, iva: i, total: i };
  }
  return { neto: 0, iva: 0, total: 0 };
}

module.exports = { computeTotals, IVA_PCT };
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd gastos && npx jest tests/domain/money.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gastos/src/domain/money.js gastos/tests/domain/money.test.js
git commit -m "feat(gastos): computeTotals CLP entero con IVA 19%"
```

---

## Task 4: Normalización (RUT, monto, fecha)

**Files:**
- Create: `gastos/src/domain/normalize.js`
- Test: `gastos/tests/domain/normalize.test.js`

- [ ] **Step 1: Escribir el test que falla**

```js
// gastos/tests/domain/normalize.test.js
const { normalizeRut, isValidRut, parseAmountClp, parseFecha } = require('../../src/domain/normalize');

test('normaliza RUT a formato con guion y DV mayúscula', () => {
  expect(normalizeRut('76.086.428-5')).toBe('76086428-5');
  expect(normalizeRut('760864285')).toBe('76086428-5');
  expect(normalizeRut('18.765.432-k')).toBe('18765432-K');
});

test('valida DV por módulo 11', () => {
  expect(isValidRut('76.086.428-5')).toBe(true);
  expect(isValidRut('76.086.428-9')).toBe(false);
  expect(isValidRut('basura')).toBe(false);
});

test('parsea montos CLP chilenos a entero', () => {
  expect(parseAmountClp('$25.000')).toBe(25000);
  expect(parseAmountClp('25.000')).toBe(25000);
  expect(parseAmountClp('1.011.500')).toBe(1011500);
  expect(parseAmountClp('$ 3.992 ')).toBe(3992);
  expect(parseAmountClp('')).toBe(0);
});

test('parsea fechas a ISO YYYY-MM-DD', () => {
  expect(parseFecha('12/06/2026')).toBe('2026-06-12');
  expect(parseFecha('12-06-2026')).toBe('2026-06-12');
  expect(parseFecha('2026-06-12')).toBe('2026-06-12');
  expect(parseFecha('basura')).toBeNull();
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd gastos && npx jest tests/domain/normalize.test.js`
Expected: FAIL — `Cannot find module`.

- [ ] **Step 3: Implementar `gastos/src/domain/normalize.js`**

```js
function cleanRut(rut) {
  return String(rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
}

function normalizeRut(rut) {
  const c = cleanRut(rut);
  if (c.length < 2) return '';
  const body = c.slice(0, -1);
  const dv = c.slice(-1);
  return `${body}-${dv}`;
}

function computeDv(body) {
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const res = 11 - (sum % 11);
  if (res === 11) return '0';
  if (res === 10) return 'K';
  return String(res);
}

function isValidRut(rut) {
  const c = cleanRut(rut);
  if (c.length < 2) return false;
  const body = c.slice(0, -1);
  const dv = c.slice(-1);
  if (!/^\d+$/.test(body)) return false;
  return computeDv(body) === dv;
}

function parseAmountClp(s) {
  const digits = String(s || '').replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function parseFecha(s) {
  const str = String(s || '').trim();
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = str.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}

module.exports = { normalizeRut, isValidRut, parseAmountClp, parseFecha };
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd gastos && npx jest tests/domain/normalize.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gastos/src/domain/normalize.js gastos/tests/domain/normalize.test.js
git commit -m "feat(gastos): normalizacion RUT/monto/fecha chilenos"
```

---

## Task 5: Adapter Gemini (visión) + parseJsonLoose

**Files:**
- Create: `gastos/src/ocr/gemini.js`
- Test: `gastos/tests/ocr/gemini.test.js`

`geminiExtract(imageBase64, mimeType)` llama al endpoint OpenAI-compat de Google AI Studio (igual
patrón que el agente) pidiendo JSON con los campos chilenos. La llamada HTTP (`axios`) se mockea en
el test; probamos el armado del prompt, el parseo tolerante y el mapeo de la respuesta.

- [ ] **Step 1: Escribir el test que falla**

```js
// gastos/tests/ocr/gemini.test.js
jest.mock('axios');
const axios = require('axios');
const { geminiExtract, parseJsonLoose } = require('../../src/ocr/gemini');

test('parseJsonLoose tolera fences y texto alrededor', () => {
  expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  expect(parseJsonLoose('basura {"a":2} cola')).toEqual({ a: 2 });
  expect(parseJsonLoose('no-json')).toEqual({});
});

test('geminiExtract mapea la respuesta JSON del modelo', async () => {
  axios.post.mockResolvedValue({
    data: {
      choices: [
        { message: { content: '{"tipo_documento":"boleta","rut_emisor":"76.086.428-5","folio":"123","direccion_emisor":"Av Siempre Viva 1","proveedor":"Copec","fecha":"12/06/2026","neto":21008,"iva":3992,"total":25000,"categoria":"Combustible y transporte","glosa":"bencina"}' } },
      ],
    },
  });

  const out = await geminiExtract('BASE64', 'image/jpeg');
  expect(out.proveedor).toBe('Copec');
  expect(out.tipo_documento).toBe('boleta');
  expect(out.folio).toBe('123');
  expect(axios.post).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd gastos && npx jest tests/ocr/gemini.test.js`
Expected: FAIL — `Cannot find module`.

- [ ] **Step 3: Implementar `gastos/src/ocr/gemini.js`**

```js
const axios = require('axios');
const { CATEGORIES } = require('../domain/categories');

const BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

function parseJsonLoose(text) {
  const s = String(text || '');
  const fenced = s.replace(/```json/gi, '```').split('```');
  const candidates = [s, ...fenced];
  for (const c of candidates) {
    const start = c.indexOf('{');
    const end = c.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(c.slice(start, end + 1)); } catch { /* sigue */ }
    }
  }
  return {};
}

function buildPrompt() {
  return [
    'Eres un extractor de datos de boletas y facturas chilenas.',
    'Devuelve SOLO un JSON con estos campos:',
    'tipo_documento (boleta|factura|otro), rut_emisor, folio, direccion_emisor,',
    'proveedor, fecha (dd/mm/aaaa), neto, iva, total (en pesos CLP enteros),',
    `categoria (una de: ${CATEGORIES.join(', ')}), glosa (descripción corta).`,
    'Si un campo no aparece, usa "" o 0. No inventes montos.',
  ].join(' ');
}

async function geminiExtract(imageBase64, mimeType = 'image/jpeg') {
  const model = process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash';
  const key = process.env.GEMINI_API_KEY;
  const body = {
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildPrompt() },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ],
      },
    ],
    temperature: 0.1,
  };
  const res = await axios.post(BASE, body, {
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    timeout: 30000,
  });
  const content = res?.data?.choices?.[0]?.message?.content || '';
  return parseJsonLoose(content);
}

module.exports = { geminiExtract, parseJsonLoose };
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd gastos && npx jest tests/ocr/gemini.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gastos/src/ocr/gemini.js gastos/tests/ocr/gemini.test.js
git commit -m "feat(gastos): adapter Gemini vision + parseJsonLoose"
```

---

## Task 6: Adapter Document AI

**Files:**
- Create: `gastos/src/ocr/documentai.js`
- Test: `gastos/tests/ocr/documentai.test.js`

`documentAiExtract(imageBuffer, mimeType)` usa `@google-cloud/documentai`. El cliente se inyecta
(parámetro opcional) para poder mockearlo en el test. Mapea entidades del Expense parser
(`total_amount`, `net_amount`, `total_tax_amount`, `supplier_name`, `receipt_date`,
`supplier_address`) a nuestros campos intermedios.

- [ ] **Step 1: Escribir el test que falla**

```js
// gastos/tests/ocr/documentai.test.js
const { mapDocAiEntities, documentAiExtract } = require('../../src/ocr/documentai');

test('mapea entidades del Expense parser', () => {
  const entities = [
    { type: 'total_amount', mentionText: '$25.000' },
    { type: 'net_amount', mentionText: '21.008' },
    { type: 'total_tax_amount', mentionText: '3.992' },
    { type: 'supplier_name', mentionText: 'Copec' },
    { type: 'receipt_date', mentionText: '12/06/2026' },
    { type: 'supplier_address', mentionText: 'Av Siempre Viva 1' },
  ];
  expect(mapDocAiEntities(entities)).toEqual({
    total: 25000, neto: 21008, iva: 3992,
    proveedor: 'Copec', fecha: '12/06/2026', direccion_emisor: 'Av Siempre Viva 1',
  });
});

test('documentAiExtract usa el cliente inyectado y devuelve campos mapeados', async () => {
  const fakeClient = {
    processorPath: () => 'proj/loc/proc',
    processDocument: async () => ([{ document: { entities: [
      { type: 'supplier_name', mentionText: 'Lider' },
      { type: 'total_amount', mentionText: '$9.990' },
    ] } }]),
  };
  const out = await documentAiExtract(Buffer.from('x'), 'image/jpeg', fakeClient);
  expect(out.proveedor).toBe('Lider');
  expect(out.total).toBe(9990);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd gastos && npx jest tests/ocr/documentai.test.js`
Expected: FAIL — `Cannot find module`.

- [ ] **Step 3: Implementar `gastos/src/ocr/documentai.js`**

```js
const { parseAmountClp } = require('../domain/normalize');

function mapDocAiEntities(entities = []) {
  const out = {};
  for (const e of entities) {
    const t = e.type;
    const v = e.mentionText || '';
    if (t === 'total_amount') out.total = parseAmountClp(v);
    else if (t === 'net_amount') out.neto = parseAmountClp(v);
    else if (t === 'total_tax_amount') out.iva = parseAmountClp(v);
    else if (t === 'supplier_name') out.proveedor = v.trim();
    else if (t === 'receipt_date') out.fecha = v.trim();
    else if (t === 'supplier_address') out.direccion_emisor = v.trim();
  }
  return out;
}

let _client = null;
function getClient() {
  if (_client) return _client;
  const { DocumentProcessorServiceClient } = require('@google-cloud/documentai').v1;
  _client = new DocumentProcessorServiceClient();
  return _client;
}

async function documentAiExtract(imageBuffer, mimeType = 'image/jpeg', client) {
  const c = client || getClient();
  const name = c.processorPath(
    process.env.DOCAI_PROJECT_ID,
    process.env.DOCAI_LOCATION || 'us',
    process.env.DOCAI_PROCESSOR_ID
  );
  const [result] = await c.processDocument({
    name,
    rawDocument: { content: imageBuffer.toString('base64'), mimeType },
  });
  return mapDocAiEntities(result?.document?.entities || []);
}

module.exports = { mapDocAiEntities, documentAiExtract };
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd gastos && npx jest tests/ocr/documentai.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gastos/src/ocr/documentai.js gastos/tests/ocr/documentai.test.js
git commit -m "feat(gastos): adapter Document AI (Expense parser)"
```

---

## Task 7: Preprocesado de imagen (sharp)

**Files:**
- Create: `gastos/src/ocr/preprocess.js`
- Test: `gastos/tests/ocr/preprocess.test.js`

Port server-side del `processDocumentImage` de la app: escala de grises, sube contraste, reescala
a máx 1800px. Mejora la lectura del OCR para imágenes que llegan por WhatsApp (la app ya
preprocesa local).

- [ ] **Step 1: Escribir el test que falla**

```js
// gastos/tests/ocr/preprocess.test.js
const sharp = require('sharp');
const { preprocessForOcr } = require('../../src/ocr/preprocess');

async function makeImage(w, h) {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 100, b: 50 } } })
    .jpeg().toBuffer();
}

test('reescala a máx 1800px y devuelve JPEG', async () => {
  const big = await makeImage(3000, 2000);
  const out = await preprocessForOcr(big);
  const meta = await sharp(out).metadata();
  expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(1800);
  expect(meta.format).toBe('jpeg');
});

test('no agranda imágenes chicas', async () => {
  const small = await makeImage(800, 600);
  const out = await preprocessForOcr(small);
  const meta = await sharp(out).metadata();
  expect(meta.width).toBe(800);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd gastos && npx jest tests/ocr/preprocess.test.js`
Expected: FAIL — `Cannot find module`.

- [ ] **Step 3: Implementar `gastos/src/ocr/preprocess.js`**

```js
const sharp = require('sharp');

// Grises + contraste + reescala a máx 1800px (espejo de processDocumentImage de la app).
async function preprocessForOcr(inputBuffer) {
  const img = sharp(inputBuffer).rotate(); // respeta EXIF
  const meta = await img.metadata();
  const maxSide = Math.max(meta.width || 0, meta.height || 0);
  let pipeline = img;
  if (maxSide > 1800) {
    pipeline = pipeline.resize({ width: meta.width >= meta.height ? 1800 : null,
                                 height: meta.height > meta.width ? 1800 : null,
                                 fit: 'inside' });
  }
  return pipeline.grayscale().normalize().linear(1.2, -15).jpeg({ quality: 85 }).toBuffer();
}

module.exports = { preprocessForOcr };
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd gastos && npx jest tests/ocr/preprocess.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gastos/src/ocr/preprocess.js gastos/tests/ocr/preprocess.test.js
git commit -m "feat(gastos): preprocesado de imagen para OCR (sharp)"
```

---

## Task 8: Orquestador extractExpense (merge DocAI + Gemini)

**Files:**
- Create: `gastos/src/ocr/extract.js`
- Test: `gastos/tests/ocr/extract.test.js`

`extractExpense({ imageBuffer })` corre ambos adapters, mezcla (Document AI manda en montos/fecha;
Gemini manda en tipo_doc/RUT/folio/dirección/categoría/glosa), normaliza, reconcilia montos con
`computeTotals`, valida categoría y mapea cuenta SII. Calcula `confianza` simple. Ambos adapters
se mockean.

- [ ] **Step 1: Escribir el test que falla**

```js
// gastos/tests/ocr/extract.test.js
jest.mock('../../src/ocr/documentai');
jest.mock('../../src/ocr/gemini');
jest.mock('../../src/ocr/preprocess');

const { documentAiExtract } = require('../../src/ocr/documentai');
const { geminiExtract } = require('../../src/ocr/gemini');
const { preprocessForOcr } = require('../../src/ocr/preprocess');
const { extractExpense } = require('../../src/ocr/extract');

beforeEach(() => {
  preprocessForOcr.mockResolvedValue(Buffer.from('img'));
});

test('mezcla DocAI (montos/fecha) + Gemini (campos CL) y mapea SII', async () => {
  documentAiExtract.mockResolvedValue({ total: 25000, proveedor: 'Copec', fecha: '12/06/2026' });
  geminiExtract.mockResolvedValue({
    tipo_documento: 'boleta', rut_emisor: '76.086.428-5', folio: '123',
    direccion_emisor: 'Av 1', categoria: 'Combustible y transporte', glosa: 'bencina',
    proveedor: 'COPEC SA',
  });

  const r = await extractExpense({ imageBuffer: Buffer.from('x'), mimeType: 'image/jpeg' });

  expect(r.proveedor).toBe('Copec');           // DocAI manda en proveedor cuando existe
  expect(r.fecha).toBe('2026-06-12');          // normalizada a ISO
  expect(r.rut_emisor).toBe('76086428-5');     // normalizado
  expect(r.folio).toBe('123');
  expect(r.tipo_documento).toBe('boleta');
  expect(r.categoria).toBe('Combustible y transporte');
  expect(r.cuenta_sii_codigo).toBe('4.3.150.1');
  expect(r).toMatchObject({ neto: 21008, iva: 3992, total: 25000 });
  expect(r.confianza).toBeGreaterThan(0);
});

test('categoría inválida del modelo cae en Otros gastos', async () => {
  documentAiExtract.mockResolvedValue({ total: 1000 });
  geminiExtract.mockResolvedValue({ categoria: 'inventada' });
  const r = await extractExpense({ imageBuffer: Buffer.from('x') });
  expect(r.categoria).toBe('Otros gastos');
  expect(r.cuenta_sii_codigo).toBe('4.3.150.1');
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd gastos && npx jest tests/ocr/extract.test.js`
Expected: FAIL — `Cannot find module`.

- [ ] **Step 3: Implementar `gastos/src/ocr/extract.js`**

```js
const { documentAiExtract } = require('./documentai');
const { geminiExtract } = require('./gemini');
const { preprocessForOcr } = require('./preprocess');
const { computeTotals } = require('../domain/money');
const { normalizeRut, parseFecha } = require('../domain/normalize');
const { isValidCategory, mapCategoryToSii } = require('../domain/categories');

function pick(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== '' && v !== 0) return v;
  }
  return '';
}

async function extractExpense({ imageBuffer, mimeType = 'image/jpeg' }) {
  const processed = await preprocessForOcr(imageBuffer);
  const b64 = processed.toString('base64');

  const [docai, gem] = await Promise.all([
    documentAiExtract(processed, mimeType).catch(() => ({})),
    geminiExtract(b64, mimeType).catch(() => ({})),
  ]);

  // Montos: DocAI manda; si falta, Gemini.
  const totals = computeTotals({
    neto: pick(docai.neto, gem.neto) || 0,
    iva: pick(docai.iva, gem.iva) || 0,
    total: pick(docai.total, gem.total) || 0,
  });

  const proveedor = String(pick(docai.proveedor, gem.proveedor) || '').trim();
  const fecha = parseFecha(pick(docai.fecha, gem.fecha));
  const direccion = String(pick(docai.direccion_emisor, gem.direccion_emisor) || '').trim();

  let categoria = String(gem.categoria || '').trim();
  if (!isValidCategory(categoria)) categoria = 'Otros gastos';
  const sii = mapCategoryToSii(categoria);

  // Confianza simple: cuántos campos clave salieron.
  const keys = [totals.total, proveedor, fecha, gem.rut_emisor];
  const got = keys.filter((k) => k && String(k).trim() !== '').length;
  const confianza = Math.round((got / keys.length) * 100);

  return {
    tipo_documento: String(gem.tipo_documento || 'otro').toLowerCase(),
    rut_emisor: gem.rut_emisor ? normalizeRut(gem.rut_emisor) : '',
    folio: String(gem.folio || '').trim(),
    direccion_emisor: direccion,
    proveedor,
    fecha,
    neto: totals.neto,
    iva: totals.iva,
    total: totals.total,
    moneda: 'CLP',
    categoria,
    cuenta_sii_codigo: sii.codigo,
    cuenta_sii_nombre: sii.nombre,
    glosa: String(gem.glosa || '').trim(),
    confianza,
    raw_ocr: { docai, gemini: gem },
  };
}

module.exports = { extractExpense };
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd gastos && npx jest tests/ocr/extract.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gastos/src/ocr/extract.js gastos/tests/ocr/extract.test.js
git commit -m "feat(gastos): orquestador extractExpense (merge DocAI+Gemini+SII)"
```

---

## Task 9: Schema SQL + migrate

**Files:**
- Create: `gastos/src/db/schema.sql`
- Create: `gastos/src/db/pool.js`
- Create: `gastos/src/db/migrate.js`
- Test: `gastos/tests/db/schema.test.js`

El test usa `pg-mem` (Postgres en memoria) para aplicar el schema y verificar tablas/columnas sin
Docker. `pool.js` expone un pool real `pg` para producción; `migrate.js` aplica `schema.sql`.

- [ ] **Step 1: Crear `gastos/src/db/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS companies (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       text NOT NULL,
  rut          text,
  wa_phone_number_id text UNIQUE,
  wa_token     text,
  owner_nombre text,
  owner_whatsapp text,
  resumen_frecuencia text NOT NULL DEFAULT 'mensual',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employees (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nombre       text NOT NULL,
  phone        text,
  usuario      text,
  password_hash text,
  rol          text NOT NULL DEFAULT 'empleado',
  activo       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id  uuid REFERENCES employees(id) ON DELETE SET NULL,
  wa_message_id text,
  foto_path    text,
  canal        text NOT NULL DEFAULT 'app',
  tipo_documento text,
  rut_emisor   text,
  proveedor    text,
  folio        text,
  direccion_emisor text,
  fecha        date,
  neto         bigint NOT NULL DEFAULT 0,
  iva          bigint NOT NULL DEFAULT 0,
  total        bigint NOT NULL DEFAULT 0,
  moneda       text NOT NULL DEFAULT 'CLP',
  categoria    text,
  cuenta_sii_codigo text,
  cuenta_sii_nombre text,
  glosa        text,
  estado       text NOT NULL DEFAULT 'pendiente_confirmacion',
  raw_ocr      jsonb,
  confianza    int,
  created_at   timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);

CREATE TABLE IF NOT EXISTS users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid REFERENCES companies(id) ON DELETE CASCADE,
  email        text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  rol          text NOT NULL DEFAULT 'owner',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_company ON expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_expenses_estado ON expenses(estado);
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_wamsg ON expenses(company_id, wa_message_id) WHERE wa_message_id IS NOT NULL;
```

- [ ] **Step 2: Crear `gastos/src/db/pool.js`**

```js
const { Pool } = require('pg');

let pool = null;
function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.GASTOS_DB_URL });
  }
  return pool;
}

module.exports = { getPool };
```

- [ ] **Step 3: Crear `gastos/src/db/migrate.js`**

```js
const fs = require('fs');
const path = require('path');

function schemaSql() {
  return fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
}

async function migrate(db) {
  await db.query(schemaSql());
}

module.exports = { migrate, schemaSql };
```

- [ ] **Step 4: Escribir el test que falla**

```js
// gastos/tests/db/schema.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');

test('el schema crea las 4 tablas con columnas clave', async () => {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', implementation: () => '00000000-0000-0000-0000-000000000000' });
  const db = mem.adapters.createPg();
  const client = new db.Pool();
  await migrate(client);

  const t = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
  );
  const names = t.rows.map((r) => r.table_name);
  expect(names).toEqual(['companies', 'employees', 'expenses', 'users']);

  const cols = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='expenses'"
  );
  const colNames = cols.rows.map((r) => r.column_name);
  expect(colNames).toEqual(expect.arrayContaining(['folio', 'direccion_emisor', 'cuenta_sii_codigo', 'canal', 'estado']));
});
```

- [ ] **Step 5: Correr el test y verificar que falla**

Run: `cd gastos && npx jest tests/db/schema.test.js`
Expected: FAIL — `Cannot find module '../../src/db/migrate'` (o falta `pg-mem`; ya está en devDeps del Task 1).

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `cd gastos && npx jest tests/db/schema.test.js`
Expected: PASS (los archivos de los steps 1-3 ya existen).

> Si `pg-mem` se queja de alguna función (`gen_random_uuid`), ya se registra en el test. Si se queja
> del índice parcial `WHERE wa_message_id IS NOT NULL`, mover esa línea a `migrate.js` para
> ejecutarla solo contra Postgres real y omitirla en `pg-mem` (envolver en try/catch en el test).

- [ ] **Step 7: Commit**

```bash
git add gastos/src/db/schema.sql gastos/src/db/pool.js gastos/src/db/migrate.js gastos/tests/db/schema.test.js
git commit -m "feat(gastos): schema Postgres (companies/employees/expenses/users) + migrate"
```

---

## Task 10: Repo de gastos (create/get/confirm/update)

**Files:**
- Create: `gastos/src/expenses/repo.js`
- Test: `gastos/tests/expenses/repo.test.js`

Funciones que reciben un cliente DB (inyectado) para ser testeables con `pg-mem`:
`createExpense(db, data)`, `getExpense(db, id)`, `confirmExpense(db, id)`,
`updateExpense(db, id, patch)`.

- [ ] **Step 1: Escribir el test que falla**

```js
// gastos/tests/expenses/repo.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createExpense, getExpense, confirmExpense, updateExpense } = require('../../src/expenses/repo');

async function freshDb() {
  const mem = newDb();
  let counter = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => `00000000-0000-0000-0000-${String(++counter).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const db = mem.adapters.createPg();
  const client = new db.Pool();
  await migrate(client).catch(() => {});
  const c = await client.query(
    "INSERT INTO companies(nombre) VALUES('Atiko') RETURNING id"
  );
  return { client, companyId: c.rows[0].id };
}

test('crea un gasto en estado pendiente_confirmacion', async () => {
  const { client, companyId } = await freshDb();
  const exp = await createExpense(client, {
    company_id: companyId, canal: 'app', proveedor: 'Copec',
    neto: 21008, iva: 3992, total: 25000, categoria: 'Combustible y transporte',
    cuenta_sii_codigo: '4.3.150.1', cuenta_sii_nombre: 'Otros Gastos de Administración y Venta',
  });
  expect(exp.estado).toBe('pendiente_confirmacion');
  expect(exp.total).toBe('25000');
  const fetched = await getExpense(client, exp.id);
  expect(fetched.proveedor).toBe('Copec');
});

test('confirmExpense pone estado confirmado y confirmed_at', async () => {
  const { client, companyId } = await freshDb();
  const exp = await createExpense(client, { company_id: companyId, total: 1000 });
  const conf = await confirmExpense(client, exp.id);
  expect(conf.estado).toBe('confirmado');
  expect(conf.confirmed_at).toBeTruthy();
});

test('updateExpense aplica patch de campos editables', async () => {
  const { client, companyId } = await freshDb();
  const exp = await createExpense(client, { company_id: companyId, total: 1000, categoria: 'Otros gastos' });
  const upd = await updateExpense(client, exp.id, { categoria: 'Honorarios', total: 2000 });
  expect(upd.categoria).toBe('Honorarios');
  expect(upd.total).toBe('2000');
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd gastos && npx jest tests/expenses/repo.test.js`
Expected: FAIL — `Cannot find module`.

- [ ] **Step 3: Implementar `gastos/src/expenses/repo.js`**

```js
const FIELDS = [
  'company_id', 'employee_id', 'wa_message_id', 'foto_path', 'canal',
  'tipo_documento', 'rut_emisor', 'proveedor', 'folio', 'direccion_emisor',
  'fecha', 'neto', 'iva', 'total', 'moneda', 'categoria',
  'cuenta_sii_codigo', 'cuenta_sii_nombre', 'glosa', 'confianza', 'raw_ocr',
];

async function createExpense(db, data) {
  const cols = FIELDS.filter((f) => data[f] !== undefined);
  const vals = cols.map((f) => (f === 'raw_ocr' && data[f] ? JSON.stringify(data[f]) : data[f]));
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `INSERT INTO expenses(${cols.join(', ')}) VALUES(${ph}) RETURNING *`;
  const r = await db.query(sql, vals);
  return r.rows[0];
}

async function getExpense(db, id) {
  const r = await db.query('SELECT * FROM expenses WHERE id=$1', [id]);
  return r.rows[0] || null;
}

async function confirmExpense(db, id) {
  const r = await db.query(
    "UPDATE expenses SET estado='confirmado', confirmed_at=now() WHERE id=$1 RETURNING *",
    [id]
  );
  return r.rows[0] || null;
}

const EDITABLE = ['tipo_documento', 'rut_emisor', 'proveedor', 'folio', 'direccion_emisor',
  'fecha', 'neto', 'iva', 'total', 'categoria', 'cuenta_sii_codigo', 'cuenta_sii_nombre', 'glosa'];

async function updateExpense(db, id, patch) {
  const cols = EDITABLE.filter((f) => patch[f] !== undefined);
  if (!cols.length) return getExpense(db, id);
  const set = cols.map((f, i) => `${f}=$${i + 2}`).join(', ');
  const vals = cols.map((f) => patch[f]);
  const r = await db.query(`UPDATE expenses SET ${set} WHERE id=$1 RETURNING *`, [id, ...vals]);
  return r.rows[0] || null;
}

module.exports = { createExpense, getExpense, confirmExpense, updateExpense };
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd gastos && npx jest tests/expenses/repo.test.js`
Expected: PASS.

- [ ] **Step 5: Correr toda la suite**

Run: `cd gastos && npm test`
Expected: PASS — todos los tests verdes.

- [ ] **Step 6: Commit**

```bash
git add gastos/src/expenses/repo.js gastos/tests/expenses/repo.test.js
git commit -m "feat(gastos): repo de gastos (create/get/confirm/update)"
```

---

## Cierre del Plan 1

Al terminar: el backend `gastos/` corre, tiene su schema, y el motor `extractExpense(imageBuffer)`
devuelve un gasto estructurado listo para persistir con `createExpense`. Todo testeado (lógica pura
mockeando externos; DB con `pg-mem`). Falta probar con **imágenes reales** las llamadas a Document
AI/Gemini (test manual/integración fuera de esta suite, requiere keys), lo que se hará al conectar
los canales (Plan 2/3).

**Siguiente:** Plan 2 (canal WhatsApp) o Plan 3 (API app + panel) — se escriben al cerrar este.
