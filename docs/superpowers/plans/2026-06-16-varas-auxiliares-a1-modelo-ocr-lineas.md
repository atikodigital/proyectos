# VARAS Auxiliares — Fase A1: Modelo + OCR líneas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar el detalle línea-a-línea de las facturas recibidas: OCR que lee cada ítem (descripción, cantidad, unidad, montos), tablas `auxiliares` y `expense_lineas`, y persistencia de las líneas al registrar un gasto (con `auxiliar_id` aún nulo — el mapeo a auxiliar es A2).

**Architecture:** Aditivo y sin romper lo actual. El OCR (`ocr/gemini.js`) gana un arreglo `lineas`; un normalizador PURO (`domain/lineas.js`) las limpia; el intake guarda las líneas en `expense_lineas` tras crear el `expenses` (si la factura no detalla líneas, no se guarda ninguna — la cabecera ya tiene el total). La tabla `auxiliares` se crea con un repo mínimo (el mapeo/normalización IA es A2). Multi-tenant por `company_id`. Mismo patrón `ensureTable`+WeakMap que `contabilidad/repo.js` y `catalog/repo.js`.

**Tech Stack:** Node/Express, Postgres/pg-mem, Jest/supertest. Sin deps nuevas.

**Repo:** `C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA` (repo canónico, su propio git — NO el worktree). Backend tests: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\gastos" && npx jest`. Commits con `git -c user.name="José Antonio Olguín" -c user.email="atikodigital@gmail.com"`. Confirmar `git -C "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" rev-parse --show-toplevel` apunta a HASH IA antes de commitear.

---

## File Structure

**Crear:**
- `gastos/src/domain/lineas.js` — `normalizeLineas(raw)` PURO (limpia descripción, cantidad, unidad, neto/total por línea).
- `gastos/src/expenses/lineas-repo.js` — tabla `expense_lineas` + `ensureLineasTable`, `createLineas`, `getLineas`.
- `gastos/src/auxiliares/repo.js` — tabla `auxiliares` + `ensureAuxiliaresTable`, `createAuxiliar`, `listAuxiliares` (mínimo; mapeo/fusión = A2).
- Tests: `gastos/tests/lineas/normalize.test.js`, `gastos/tests/lineas/repo.test.js`, `gastos/tests/auxiliares/repo.test.js`, `gastos/tests/lineas/intake-lineas.test.js`, `gastos/tests/lineas/api-lineas.test.js`.

**Modificar:**
- `gastos/src/ocr/gemini.js` — el prompt pide `lineas`; pasa el arreglo crudo.
- `gastos/src/ocr/extract.js` — devuelve `lineas: normalizeLineas(gem.lineas)`.
- `gastos/src/expenses/intake.js` — tras `createExpense`, persiste las líneas en `expense_lineas`.
- `gastos/src/app/router.js` — `GET /expenses/:id/lineas` (auth + tenant).

**Modelo (spec §4):** `auxiliares(id, company_id, nombre, cuenta_id, naturaleza, unidad_principal, sinonimos jsonb, estado, activo, created_at)`; `expense_lineas(id, expense_id, orden, descripcion, auxiliar_id, cantidad numeric, unidad, neto, iva, total)`.

---

## Task 1: Normalizador puro de líneas (`domain/lineas.js`)

**Files:**
- Create: `gastos/src/domain/lineas.js`
- Test: `gastos/tests/lineas/normalize.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/lineas/normalize.test.js
const { normalizeLineas } = require('../../src/domain/lineas');

test('normaliza descripción, cantidad, unidad y montos', () => {
  const r = normalizeLineas([
    { descripcion: '  Harina de trigo 25kg  ', cantidad: '2', unidad: 'KG', neto: '10000', total: '11900' },
    { descripcion: 'Levadura', cantidad: 1, unidad: '', total: 2380 },
  ]);
  expect(r.length).toBe(2);
  expect(r[0].descripcion).toBe('Harina de trigo 25kg');
  expect(r[0].cantidad).toBe(2);
  expect(r[0].unidad).toBe('kg');
  expect(r[0].neto).toBe(10000);
  expect(r[0].total).toBe(11900);
  expect(r[1].unidad).toBe('un'); // default cuando no viene
  expect(r[1].cantidad).toBe(1);
});

test('descarta líneas sin descripción y sin monto', () => {
  const r = normalizeLineas([
    { descripcion: '', total: 0 },
    { descripcion: 'Queso', total: 5000 },
    null,
  ]);
  expect(r.length).toBe(1);
  expect(r[0].descripcion).toBe('Queso');
});

test('entrada no-array → []', () => {
  expect(normalizeLineas(undefined)).toEqual([]);
  expect(normalizeLineas('x')).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/lineas/normalize.test.js`
Expected: FAIL — Cannot find module.

- [ ] **Step 3: Write minimal implementation**

```javascript
// gastos/src/domain/lineas.js
// Normaliza las líneas crudas que devuelve el OCR. PURO (sin DB).
function _int(n) { const v = Math.round(Number(n) || 0); return v > 0 ? v : 0; }
function _num(n) { const v = Number(n); return Number.isFinite(v) && v > 0 ? v : 0; }

// Unidades reconocidas (canónicas). Lo demás cae a 'un'.
const UNIDADES = ['kg', 'g', 'l', 'ml', 'kwh', 'm3', 'm2', 'un', 'hora', 'fijo'];
function _unidad(u) {
  const s = String(u || '').trim().toLowerCase().replace(/\./g, '');
  if (s === 'm³') return 'm3';
  if (s === 'm²') return 'm2';
  if (s === 'lt' || s === 'lts' || s === 'litro' || s === 'litros') return 'l';
  if (s === 'kgs' || s === 'kilo' || s === 'kilos') return 'kg';
  if (s === 'kw' || s === 'kw/h' || s === 'kwh') return 'kwh';
  if (UNIDADES.includes(s)) return s;
  return 'un';
}

function normalizeLineas(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const l of raw) {
    if (!l || typeof l !== 'object') continue;
    const descripcion = String(l.descripcion || l.detalle || l.glosa || '').trim().slice(0, 200);
    const neto = _int(l.neto);
    const total = _int(l.total) || (neto + _int(l.iva));
    if (!descripcion && total <= 0) continue;
    out.push({
      descripcion,
      cantidad: _num(l.cantidad != null ? l.cantidad : 1) || 1,
      unidad: _unidad(l.unidad),
      neto,
      iva: _int(l.iva),
      total,
    });
  }
  return out;
}

module.exports = { normalizeLineas, UNIDADES };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/lineas/normalize.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/domain/lineas.js gastos/tests/lineas/normalize.test.js
git commit -m "feat(varas-aux): normalizador puro de líneas de factura"
```

---

## Task 2: OCR devuelve líneas (`gemini.js` + `extract.js`)

**Files:**
- Modify: `gastos/src/ocr/gemini.js`
- Modify: `gastos/src/ocr/extract.js`
- Test: `gastos/tests/lineas/extract-lineas.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/lineas/extract-lineas.test.js
const { extractExpense } = require('../../src/ocr/extract');

test('extractExpense incluye lineas normalizadas desde el OCR', async () => {
  // OCR fake: inyectamos un gemini que devuelve líneas.
  const fakeGemini = async () => ({
    tipo: 'gasto', tipo_documento: 'factura', proveedor: 'Distribuidora', fecha: '10/06/2026',
    neto: 15000, iva: 2850, total: 17850, categoria: 'Mercadería e insumos del giro', glosa: 'compra',
    lineas: [
      { descripcion: 'Harina 25kg', cantidad: 2, unidad: 'kg', neto: 10000, total: 11900 },
      { descripcion: 'Levadura', cantidad: 1, unidad: 'un', neto: 5000, total: 5950 },
    ],
  });
  const r = await extractExpense({ imageBuffer: Buffer.from('x'), mimeType: 'image/jpeg', gemini: fakeGemini });
  expect(Array.isArray(r.lineas)).toBe(true);
  expect(r.lineas.length).toBe(2);
  expect(r.lineas[0].descripcion).toBe('Harina 25kg');
  expect(r.lineas[0].cantidad).toBe(2);
  expect(r.lineas[0].unidad).toBe('kg');
});
```

> Nota: revisar la firma real de `extractExpense` en `gastos/src/ocr/extract.js`. Si NO acepta un `gemini` inyectable, el test debe inyectarlo del modo que el código permita (p. ej. mockear el módulo `../ocr/gemini` con `jest.mock`). Ajustar el test a la firma real, pero la aserción (r.lineas normalizadas) se mantiene.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/lineas/extract-lineas.test.js`
Expected: FAIL — `r.lineas` undefined.

- [ ] **Step 3: Write minimal implementation**

En `gastos/src/ocr/gemini.js`, dentro de `buildPrompt()`, agregar a la lista de campos pedidos (antes del cierre):
```javascript
    'lineas (arreglo del detalle del documento; SOLO para gasto/factura con ítems): cada elemento { descripcion, cantidad, unidad (kg|g|L|ml|kWh|m3|m2|un|hora), neto, iva, total } en CLP entero. Si no hay detalle de ítems, usa [].',
```
(El `parseJsonLoose` ya devuelve el objeto completo, así que `lineas` llega tal cual.)

En `gastos/src/ocr/extract.js`, importar arriba `const { normalizeLineas } = require('../domain/lineas');` y agregar al objeto que retorna (junto a neto/iva/total):
```javascript
    lineas: normalizeLineas(gem.lineas),
```
(Leer primero `extract.js` para insertar `lineas` en el `return {...}` final sin romper los campos existentes.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/lineas/extract-lineas.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/ocr/gemini.js gastos/src/ocr/extract.js gastos/tests/lineas/extract-lineas.test.js
git commit -m "feat(varas-aux): OCR devuelve lineas del detalle de la factura"
```

---

## Task 3: Tabla `expense_lineas` + repo

**Files:**
- Create: `gastos/src/expenses/lineas-repo.js`
- Test: `gastos/tests/lineas/repo.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/lineas/repo.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const repo = require('../../src/expenses/lineas-repo');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const EXP = '11111111-1111-1111-1111-111111111111';

test('createLineas guarda y getLineas devuelve en orden', async () => {
  const db = await makeDb();
  await repo.createLineas(db, EXP, [
    { descripcion: 'Harina 25kg', cantidad: 2, unidad: 'kg', neto: 10000, iva: 1900, total: 11900 },
    { descripcion: 'Levadura', cantidad: 1, unidad: 'un', neto: 5000, iva: 950, total: 5950 },
  ]);
  const rows = await repo.getLineas(db, EXP);
  expect(rows.length).toBe(2);
  expect(rows[0].descripcion).toBe('Harina 25kg');
  expect(Number(rows[0].total)).toBe(11900);
  expect(rows[0].orden).toBe(0);
  expect(rows[1].orden).toBe(1);
  expect(rows[0].auxiliar_id).toBeNull();
});

test('createLineas con arreglo vacío no inserta nada', async () => {
  const db = await makeDb();
  await repo.createLineas(db, EXP, []);
  expect((await repo.getLineas(db, EXP)).length).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/lineas/repo.test.js`
Expected: FAIL — Cannot find module.

- [ ] **Step 3: Write minimal implementation**

```javascript
// gastos/src/expenses/lineas-repo.js
// Detalle línea-a-línea de un gasto. Una fila por ítem de la factura.
const _ready = new WeakMap();
async function ensureLineasTable(db) {
  if (!_ready.has(db)) {
    const p = db.query(`
      CREATE TABLE IF NOT EXISTS expense_lineas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        expense_id uuid NOT NULL,
        orden int NOT NULL DEFAULT 0,
        descripcion text,
        auxiliar_id uuid,
        cantidad numeric,
        unidad text,
        neto bigint NOT NULL DEFAULT 0,
        iva bigint NOT NULL DEFAULT 0,
        total bigint NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_expense_lineas_exp ON expense_lineas(expense_id);
    `).catch((e) => { _ready.delete(db); throw e; });
    _ready.set(db, p);
  }
  return _ready.get(db);
}

async function createLineas(db, expenseId, lineas) {
  await ensureLineasTable(db);
  const arr = Array.isArray(lineas) ? lineas : [];
  for (let i = 0; i < arr.length; i++) {
    const l = arr[i] || {};
    await db.query(
      `INSERT INTO expense_lineas (expense_id, orden, descripcion, auxiliar_id, cantidad, unidad, neto, iva, total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [expenseId, i, l.descripcion || null, l.auxiliar_id || null,
       (l.cantidad != null ? Number(l.cantidad) : null), l.unidad || null,
       Math.round(Number(l.neto) || 0), Math.round(Number(l.iva) || 0), Math.round(Number(l.total) || 0)]
    );
  }
  return arr.length;
}

async function getLineas(db, expenseId) {
  await ensureLineasTable(db);
  const r = await db.query('SELECT * FROM expense_lineas WHERE expense_id=$1 ORDER BY orden ASC', [expenseId]);
  return r.rows;
}

module.exports = { ensureLineasTable, createLineas, getLineas };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/lineas/repo.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/expenses/lineas-repo.js gastos/tests/lineas/repo.test.js
git commit -m "feat(varas-aux): tabla expense_lineas + repo"
```

---

## Task 4: Tabla `auxiliares` + repo mínimo

**Files:**
- Create: `gastos/src/auxiliares/repo.js`
- Test: `gastos/tests/auxiliares/repo.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/auxiliares/repo.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const repo = require('../../src/auxiliares/repo');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';

test('createAuxiliar y listAuxiliares scoped por empresa', async () => {
  const db = await makeDb();
  const a = await repo.createAuxiliar(db, COMPANY, { nombre: 'Harina', naturaleza: 'insumo', unidad_principal: 'kg', sinonimos: ['harina de trigo'] });
  expect(a.id).toBeTruthy();
  expect(a.nombre).toBe('Harina');
  expect(a.estado).toBe('sugerido');
  const lista = await repo.listAuxiliares(db, COMPANY);
  expect(lista.length).toBe(1);
  expect(lista[0].sinonimos).toContain('harina de trigo'); // jsonb round-trip
  // otra empresa no la ve
  expect((await repo.listAuxiliares(db, '22222222-2222-2222-2222-222222222222')).length).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/auxiliares/repo.test.js`
Expected: FAIL — Cannot find module.

- [ ] **Step 3: Write minimal implementation**

```javascript
// gastos/src/auxiliares/repo.js
// Catálogo de auxiliares (insumos) por empresa. CRUD mínimo (mapeo/fusión = A2).
const _ready = new WeakMap();
async function ensureAuxiliaresTable(db) {
  if (!_ready.has(db)) {
    const p = db.query(`
      CREATE TABLE IF NOT EXISTS auxiliares (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL,
        nombre text NOT NULL,
        cuenta_id uuid,
        naturaleza text,
        unidad_principal text,
        sinonimos jsonb NOT NULL DEFAULT '[]',
        estado text NOT NULL DEFAULT 'sugerido',
        activo boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_auxiliares_company ON auxiliares(company_id);
    `).catch((e) => { _ready.delete(db); throw e; });
    _ready.set(db, p);
  }
  return _ready.get(db);
}

const COLS = 'id, company_id, nombre, cuenta_id, naturaleza, unidad_principal, sinonimos, estado, activo, created_at';

async function createAuxiliar(db, companyId, d = {}) {
  await ensureAuxiliaresTable(db);
  const r = await db.query(
    `INSERT INTO auxiliares (company_id, nombre, cuenta_id, naturaleza, unidad_principal, sinonimos, estado)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING ${COLS}`,
    [companyId, String(d.nombre || '').trim(), d.cuenta_id || null, d.naturaleza || 'insumo',
     d.unidad_principal || 'un', JSON.stringify(Array.isArray(d.sinonimos) ? d.sinonimos : []), d.estado || 'sugerido']
  );
  return r.rows[0];
}

async function listAuxiliares(db, companyId) {
  await ensureAuxiliaresTable(db);
  const r = await db.query(`SELECT ${COLS} FROM auxiliares WHERE company_id=$1 AND activo=true ORDER BY nombre ASC`, [companyId]);
  return r.rows;
}

module.exports = { ensureAuxiliaresTable, createAuxiliar, listAuxiliares };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/auxiliares/repo.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/auxiliares/repo.js gastos/tests/auxiliares/repo.test.js
git commit -m "feat(varas-aux): tabla auxiliares + repo minimo"
```

---

## Task 5: El intake persiste las líneas

**Files:**
- Modify: `gastos/src/expenses/intake.js`
- Test: `gastos/tests/lineas/intake-lineas.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/lineas/intake-lineas.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { intakeFromImage } = require('../../src/expenses/intake');
const lineasRepo = require('../../src/expenses/lineas-repo');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';

test('intake guarda las lineas del gasto', async () => {
  const db = await makeDb();
  const extract = async () => ({
    tipo: 'gasto', tipo_documento: 'factura', proveedor: 'Distribuidora', fecha: '2026-06-10',
    neto: 15000, iva: 2850, total: 17850, categoria: 'Mercadería e insumos del giro',
    lineas: [
      { descripcion: 'Harina 25kg', cantidad: 2, unidad: 'kg', neto: 10000, iva: 1900, total: 11900 },
      { descripcion: 'Levadura', cantidad: 1, unidad: 'un', neto: 5000, iva: 950, total: 5950 },
    ],
  });
  const { expense } = await intakeFromImage({
    db, companyId: COMPANY, employeeId: null, imageBuffer: Buffer.from('x'), mimeType: 'image/jpeg',
    canal: 'app', extract, storeImage: () => null,
  });
  expect(expense).toBeTruthy();
  const lineas = await lineasRepo.getLineas(db, expense.id);
  expect(lineas.length).toBe(2);
  expect(lineas[0].descripcion).toBe('Harina 25kg');
  expect(lineas[0].unidad).toBe('kg');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/lineas/intake-lineas.test.js`
Expected: FAIL — no se guardan líneas (getLineas vacío).

- [ ] **Step 3: Write minimal implementation**

En `gastos/src/expenses/intake.js`: importar arriba `const { createLineas } = require('./lineas-repo');`. Tras crear el `expense` (donde hoy se hace `const expense = await createExpense(...)` y luego se guarda la foto), añadir, justo después de obtener `expense` y antes del `return`:
```javascript
  if (expense && Array.isArray(extracted.lineas) && extracted.lineas.length) {
    try { await createLineas(db, expense.id, extracted.lineas); } catch (e) { /* no romper el alta por las líneas */ }
  }
```
(Leer `intake.js` para insertar el bloque en el punto correcto — después del `createExpense` y del guardado de foto, antes del `return { expense, duplicado }`. `extracted` es el resultado de `run(...)` que ya tiene `.lineas` desde la Task 2.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/lineas/intake-lineas.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/expenses/intake.js gastos/tests/lineas/intake-lineas.test.js
git commit -m "feat(varas-aux): el intake persiste las lineas del gasto"
```

---

## Task 6: API — leer las líneas de un gasto

**Files:**
- Modify: `gastos/src/app/router.js`
- Test: `gastos/tests/lineas/api-lineas.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/lineas/api-lineas.test.js
const request = require('supertest');
const express = require('express');
require('express-async-errors');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { signToken } = require('../../src/auth/jwt');
const { createExpense } = require('../../src/expenses/repo');
const lineasRepo = require('../../src/expenses/lineas-repo');
const { createAppRouter } = require('../../src/app/router');

const COMPANY = '11111111-1111-1111-1111-111111111111';
const EMP = '22222222-2222-2222-2222-222222222222';

async function makeApp() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  const exp = await createExpense(db, { company_id: COMPANY, employee_id: EMP, canal: 'app', tipo: 'gasto', total: 11900, neto: 10000, iva: 1900 });
  await lineasRepo.createLineas(db, exp.id, [{ descripcion: 'Harina 25kg', cantidad: 2, unidad: 'kg', neto: 10000, iva: 1900, total: 11900 }]);
  const app = express(); app.use(express.json());
  app.use('/api/app', createAppRouter({ db }));
  const token = signToken({ kind: 'employee', companyId: COMPANY, employeeId: EMP, rol: 'empleado' });
  return { app, token, expId: exp.id };
}

test('GET /api/app/expenses/:id/lineas devuelve las líneas (auth + tenant)', async () => {
  const { app, token, expId } = await makeApp();
  const r = await request(app).get(`/api/app/expenses/${expId}/lineas`).set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(200);
  expect(r.body.lineas.length).toBe(1);
  expect(r.body.lineas[0].descripcion).toBe('Harina 25kg');
});

test('sin token -> 401', async () => {
  const { app, expId } = await makeApp();
  const r = await request(app).get(`/api/app/expenses/${expId}/lineas`);
  expect(r.status).toBe(401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/lineas/api-lineas.test.js`
Expected: FAIL — 404.

- [ ] **Step 3: Write minimal implementation**

En `gastos/src/app/router.js`: importar arriba `const { getLineas } = require('../expenses/lineas-repo');`. Junto a las otras rutas `/expenses/:id/*` (en la región protegida, usando el guard `ownedExpense` que ya existe para verificar tenant), agregar:
```javascript
  router.get('/expenses/:id/lineas', async (req, res) => {
    if (!(await ownedExpense(req, res))) return;
    res.json({ lineas: await getLineas(db, req.params.id) });
  });
```
(Verificar el nombre exacto del guard de ownership en el router — `ownedExpense` se usa en las rutas de confirmar/pagar/anular; reusarlo para acotar por empresa. Si devuelve el expense o un booleano, seguir el patrón de las rutas vecinas.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/lineas/api-lineas.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/app/router.js gastos/tests/lineas/api-lineas.test.js
git commit -m "feat(varas-aux): API leer lineas de un gasto"
```

---

## Task 7: Cierre A1 — suite completa

- [ ] **Step 1: Suite backend completa**

Run: `cd gastos && npx jest`
Expected: PASS — todo verde (los ~5 archivos nuevos de líneas/auxiliares + sin regresión).

- [ ] **Step 2: Verificar no-regresión**

Confirmar que el conteo de tests subió y nada existente se rompió (especialmente `tests/` de intake/extract/expenses). Si algo se rompió porque ahora `extract` devuelve `lineas`, ajustar la causa (no el test).

- [ ] **Step 3: Commit final (si quedó algo)**

```bash
git add -A && git commit -m "test(varas-aux): suite A1 verde" || echo "nada que commitear"
```

---

## Notas de cierre A1

- **No rompe lo actual:** si el OCR no detecta líneas, `extracted.lineas` = `[]` y no se guarda detalle (la cabecera tiene el total, como hoy). El `auxiliar_id` queda nulo en A1.
- **Pendiente A2:** `auxiliares/mapear.js` (línea→auxiliar con IA, normaliza/agrupa por sinónimos, crea auxiliar sugerido), semilla por rubro, y rellenar `auxiliar_id` en las líneas.
- **Pendiente A3:** desglose confirmable en la app (ConfirmScreen muestra líneas→auxiliar→cantidad) + CRUD de auxiliares en el panel (renombrar/fusionar/borrar).
- **Pendiente A4:** reportes de consumo/evolución por auxiliar + tools conversacionales de VARAS.
- **Deploy:** A1 es backend puro (migración aditiva: las tablas se crean por `ensureTable` / `scripts/migrate.js`). No requiere APK (no hay UI nueva todavía). Desplegar con `node deploy-gastos-wt.js` desde `HASH IA\` cuando se decida (idealmente junto con A2/A3 para que aporte valor visible).
- ⚠️ Trabajar SOLO en `HASH IA\` (repo canónico).
