# VARAS F5a — Asientos manuales (backend) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir crear asientos contables manuales (partida doble libre que debe cuadrar Σdebe=Σhaber) y anularlos, vía API en app y panel. Aparecen automáticamente en Libro Diario/Mayor/Balance (F1 ya los lee).

**Architecture:** Un módulo `contabilidad/manual.js`: `validarAsientoManual` (puro: ≥2 líneas, cuadre), `crearAsientoManual` (valida + verifica que las cuentas sean de la empresa + persiste con `repo.guardarAsiento` origen='manual' tipo_asiento='ajuste'), `anularAsientoManual` (scoped por empresa → `repo.anularAsiento`). Endpoints en app y panel: listar cuentas (selector), crear asiento manual, anular. Reusa F1 (`contabilidad/repo.js`, `cuentas.js`). No cambia el contabilizador automático ni los reportes. Multi-tenant por `company_id`.

**Tech Stack:** Node/Express + pg-mem/Jest/supertest. Sin deps nuevas.

**Repo:** `C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA` (canónico, rama `master`). Tests: `cd "...\HASH IA\gastos" && npx jest`. Commit `git -c user.name="José Antonio Olguín" -c user.email="atikodigital@gmail.com"`. Confirmar `rev-parse --show-toplevel` ends in `HASH IA`.

**Depende de F1:** `contabilidad/repo.js` (`guardarAsiento(db, companyId, asiento)`, `anularAsiento(db, asientoId)`, `ensureAsientosTables`), `contabilidad/cuentas.js` (`listCuentas`, `sembrarCuentas`).

---

## File Structure

**Crear:**
- `gastos/src/contabilidad/manual.js` — `validarAsientoManual`, `crearAsientoManual`, `anularAsientoManual`.
- Tests: `gastos/tests/contabilidad/manual.test.js`, `gastos/tests/contabilidad/manual-api.test.js`, `gastos/tests/panel/manual-api.test.js`.

**Modificar:**
- `gastos/src/app/router.js` — `GET /cuentas`, `POST /asientos/manual`, `POST /asientos/:id/anular`.
- `gastos/src/panel/router.js` — `GET /cuentas`, `POST /asientos/manual`, `POST /asientos/:id/anular`.

**Contrato:** `crearAsientoManual(db, companyId, { fecha, glosa, lineas:[{cuenta_id, debe, haber, glosa}] })` → el asiento creado, o lanza Error con `.code` ('descuadrado' | 'min_lineas' | 'cuenta_invalida').

---

## Task 1: Motor de asientos manuales (`manual.js`)

**Files:**
- Create: `gastos/src/contabilidad/manual.js`
- Test: `gastos/tests/contabilidad/manual.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/contabilidad/manual.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const cuentas = require('../../src/contabilidad/cuentas');
const repo = require('../../src/contabilidad/repo');
const { validarAsientoManual, crearAsientoManual, anularAsientoManual } = require('../../src/contabilidad/manual');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';
const OTRA = '99999999-9999-9999-9999-999999999999';

test('validarAsientoManual: cuadra / descuadrado / min líneas', () => {
  expect(validarAsientoManual({ lineas: [{ cuenta_id: 'a', debe: 1000, haber: 0 }, { cuenta_id: 'b', debe: 0, haber: 1000 }] }).ok).toBe(true);
  expect(validarAsientoManual({ lineas: [{ cuenta_id: 'a', debe: 1000, haber: 0 }, { cuenta_id: 'b', debe: 0, haber: 900 }] }).ok).toBe(false);
  expect(validarAsientoManual({ lineas: [{ cuenta_id: 'a', debe: 1000, haber: 0 }] }).ok).toBe(false); // <2
  expect(validarAsientoManual({ lineas: [{ debe: 1000, haber: 0 }, { cuenta_id: 'b', debe: 0, haber: 1000 }] }).ok).toBe(false); // sin cuenta
});

test('crearAsientoManual persiste un asiento balanceado origen=manual', async () => {
  const db = await makeDb();
  await cuentas.sembrarCuentas(db, COMPANY);
  const lista = await cuentas.listCuentas(db, COMPANY);
  const c1 = lista[0].id; const c2 = lista[1].id;
  const a = await crearAsientoManual(db, COMPANY, { fecha: '2026-06-10', glosa: 'Ajuste', lineas: [
    { cuenta_id: c1, debe: 5000, haber: 0 }, { cuenta_id: c2, debe: 0, haber: 5000 },
  ] });
  expect(a.id).toBeTruthy();
  expect(a.origen).toBe('manual');
  expect(a.tipo_asiento).toBe('ajuste');
  const lineas = await repo.getLineas(db, a.id);
  expect(lineas.reduce((s, l) => s + Number(l.debe), 0)).toBe(5000);
});

test('crearAsientoManual rechaza descuadre y cuenta de otra empresa', async () => {
  const db = await makeDb();
  await cuentas.sembrarCuentas(db, COMPANY);
  await cuentas.sembrarCuentas(db, OTRA);
  const mias = await cuentas.listCuentas(db, COMPANY);
  const ajenas = await cuentas.listCuentas(db, OTRA);
  await expect(crearAsientoManual(db, COMPANY, { lineas: [
    { cuenta_id: mias[0].id, debe: 1000, haber: 0 }, { cuenta_id: mias[1].id, debe: 0, haber: 900 },
  ] })).rejects.toThrow('descuadrado');
  await expect(crearAsientoManual(db, COMPANY, { lineas: [
    { cuenta_id: mias[0].id, debe: 1000, haber: 0 }, { cuenta_id: ajenas[0].id, debe: 0, haber: 1000 },
  ] })).rejects.toThrow('cuenta_invalida');
});

test('anularAsientoManual scoped: no anula asiento de otra empresa', async () => {
  const db = await makeDb();
  await cuentas.sembrarCuentas(db, COMPANY);
  const lista = await cuentas.listCuentas(db, COMPANY);
  const a = await crearAsientoManual(db, COMPANY, { lineas: [{ cuenta_id: lista[0].id, debe: 5000, haber: 0 }, { cuenta_id: lista[1].id, debe: 0, haber: 5000 }] });
  expect(await anularAsientoManual(db, OTRA, a.id)).toBeNull();      // otra empresa → null
  const ok = await anularAsientoManual(db, COMPANY, a.id);
  expect(ok.estado).toBe('anulado');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/contabilidad/manual.test.js`
Expected: FAIL — Cannot find module.

- [ ] **Step 3: Write minimal implementation**

```javascript
// gastos/src/contabilidad/manual.js
// Asientos manuales: partida doble libre que debe cuadrar (Σdebe == Σhaber).
const repo = require('./repo');
const cuentas = require('./cuentas');

function _int(n) { const v = Math.round(Number(n) || 0); return v > 0 ? v : 0; }

// PURO: valida estructura y cuadre. Devuelve { ok, error }.
function validarAsientoManual({ lineas } = {}) {
  const ls = Array.isArray(lineas) ? lineas : [];
  if (ls.length < 2) return { ok: false, error: 'min_lineas' };
  if (ls.some((l) => !l || !l.cuenta_id)) return { ok: false, error: 'sin_cuenta' };
  const sumD = ls.reduce((s, l) => s + _int(l.debe), 0);
  const sumH = ls.reduce((s, l) => s + _int(l.haber), 0);
  if (sumD <= 0 || sumD !== sumH) return { ok: false, error: 'descuadrado' };
  return { ok: true };
}

async function crearAsientoManual(db, companyId, { fecha, glosa, lineas } = {}) {
  const v = validarAsientoManual({ lineas });
  if (!v.ok) { const e = new Error(v.error); e.code = v.error; throw e; }
  // Verifica que todas las cuentas pertenezcan a la empresa.
  const mias = new Set((await cuentas.listCuentas(db, companyId)).map((c) => String(c.id)));
  for (const l of lineas) {
    if (!mias.has(String(l.cuenta_id))) { const e = new Error('cuenta_invalida'); e.code = 'cuenta_invalida'; throw e; }
  }
  const asiento = {
    origen: 'manual',
    origen_ref: null,
    tipo_asiento: 'ajuste',
    fecha: fecha || null,
    glosa: glosa || 'Asiento manual',
    lineas: lineas.map((l) => ({ cuenta_id: l.cuenta_id, debe: _int(l.debe), haber: _int(l.haber), glosa: l.glosa || null })),
  };
  return repo.guardarAsiento(db, companyId, asiento);
}

async function anularAsientoManual(db, companyId, asientoId) {
  await repo.ensureAsientosTables(db);
  const r = await db.query('SELECT id FROM asientos WHERE id=$1 AND company_id=$2', [asientoId, companyId]);
  if (!r.rows[0]) return null;
  return repo.anularAsiento(db, asientoId);
}

module.exports = { validarAsientoManual, crearAsientoManual, anularAsientoManual };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/contabilidad/manual.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/contabilidad/manual.js gastos/tests/contabilidad/manual.test.js
git commit -m "feat(varas-f5): motor de asientos manuales (validar cuadre + crear + anular scoped)"
```

---

## Task 2: App API — cuentas + crear/anular asiento manual

**Files:**
- Modify: `gastos/src/app/router.js`
- Test: `gastos/tests/contabilidad/manual-api.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/contabilidad/manual-api.test.js
const request = require('supertest');
const express = require('express');
require('express-async-errors');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { signToken } = require('../../src/auth/jwt');
const cuentasMod = require('../../src/contabilidad/cuentas');
const { createAppRouter } = require('../../src/app/router');

const COMPANY = '11111111-1111-1111-1111-111111111111';
const EMP = '22222222-2222-2222-2222-222222222222';

async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await cuentasMod.sembrarCuentas(db, COMPANY);
  const app = express(); app.use(express.json()); app.use('/api/app', createAppRouter({ db }));
  const token = signToken({ kind: 'employee', companyId: COMPANY, employeeId: EMP, rol: 'empleado' });
  return { app, token, db };
}

test('GET /cuentas lista', async () => {
  const { app, token } = await setup();
  const r = await request(app).get('/api/app/cuentas').set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(200);
  expect(r.body.cuentas.length).toBeGreaterThan(2);
});

test('POST /asientos/manual crea balanceado y anular lo anula', async () => {
  const { app, token } = await setup();
  const cs = (await request(app).get('/api/app/cuentas').set('Authorization', `Bearer ${token}`)).body.cuentas;
  const r = await request(app).post('/api/app/asientos/manual').set('Authorization', `Bearer ${token}`)
    .send({ fecha: '2026-06-10', glosa: 'Ajuste', lineas: [{ cuenta_id: cs[0].id, debe: 5000, haber: 0 }, { cuenta_id: cs[1].id, debe: 0, haber: 5000 }] });
  expect(r.status).toBe(201);
  const id = r.body.asiento.id;
  const an = await request(app).post(`/api/app/asientos/${id}/anular`).set('Authorization', `Bearer ${token}`);
  expect(an.status).toBe(200);
});

test('POST /asientos/manual descuadrado -> 400', async () => {
  const { app, token } = await setup();
  const cs = (await request(app).get('/api/app/cuentas').set('Authorization', `Bearer ${token}`)).body.cuentas;
  const r = await request(app).post('/api/app/asientos/manual').set('Authorization', `Bearer ${token}`)
    .send({ lineas: [{ cuenta_id: cs[0].id, debe: 5000, haber: 0 }, { cuenta_id: cs[1].id, debe: 0, haber: 4000 }] });
  expect(r.status).toBe(400);
  expect(r.body.error).toBe('descuadrado');
});

test('sin token -> 401', async () => {
  const { app } = await setup();
  expect((await request(app).get('/api/app/cuentas')).status).toBe(401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/contabilidad/manual-api.test.js`
Expected: FAIL — 404.

- [ ] **Step 3: Write minimal implementation**

En `gastos/src/app/router.js`: importar arriba `const { crearAsientoManual, anularAsientoManual } = require('../contabilidad/manual');` y `const contaCuentasMod = require('../contabilidad/cuentas');` (si `contaCuentas` ya está importado como `../contabilidad/cuentas`, reusarlo). En la región protegida agregar:
```javascript
  router.get('/cuentas', async (req, res) => {
    res.json({ cuentas: await contaCuentasMod.listCuentas(db, req.auth.companyId) });
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
```
(Si en el router ya existe `contaCuentas = require('../contabilidad/cuentas')`, usar ese nombre en `/cuentas` en vez de `contaCuentasMod`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/contabilidad/manual-api.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/app/router.js gastos/tests/contabilidad/manual-api.test.js
git commit -m "feat(varas-f5): API app cuentas + crear/anular asiento manual"
```

---

## Task 3: Panel API — cuentas + crear/anular asiento manual

**Files:**
- Modify: `gastos/src/panel/router.js`
- Test: `gastos/tests/panel/manual-api.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/panel/manual-api.test.js
const request = require('supertest');
const express = require('express');
require('express-async-errors');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { signToken } = require('../../src/auth/jwt');
const cuentasMod = require('../../src/contabilidad/cuentas');
const { createPanelRouter } = require('../../src/panel/router');

const COMPANY = '11111111-1111-1111-1111-111111111111';

async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await cuentasMod.sembrarCuentas(db, COMPANY);
  const app = express(); app.use(express.json()); app.use('/api/panel', createPanelRouter({ db }));
  const token = signToken({ kind: 'user', companyId: COMPANY, userId: 'u', rol: 'owner' });
  return { app, token };
}

test('panel: GET /cuentas + POST /asientos/manual + anular', async () => {
  const { app, token } = await setup();
  const cs = (await request(app).get('/api/panel/cuentas').set('Authorization', `Bearer ${token}`)).body.cuentas;
  expect(cs.length).toBeGreaterThan(2);
  const r = await request(app).post('/api/panel/asientos/manual').set('Authorization', `Bearer ${token}`)
    .send({ fecha: '2026-06-10', glosa: 'Sueldos', lineas: [{ cuenta_id: cs[0].id, debe: 8000, haber: 0 }, { cuenta_id: cs[1].id, debe: 0, haber: 8000 }] });
  expect(r.status).toBe(201);
  const an = await request(app).post(`/api/panel/asientos/${r.body.asiento.id}/anular`).set('Authorization', `Bearer ${token}`);
  expect(an.status).toBe(200);
});

test('panel descuadrado -> 400; sin token -> 401', async () => {
  const { app, token } = await setup();
  const cs = (await request(app).get('/api/panel/cuentas').set('Authorization', `Bearer ${token}`)).body.cuentas;
  const r = await request(app).post('/api/panel/asientos/manual').set('Authorization', `Bearer ${token}`)
    .send({ lineas: [{ cuenta_id: cs[0].id, debe: 8000, haber: 0 }, { cuenta_id: cs[1].id, debe: 0, haber: 1 }] });
  expect(r.status).toBe(400);
  expect((await request(app).get('/api/panel/cuentas')).status).toBe(401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/panel/manual-api.test.js`
Expected: FAIL — 404.

- [ ] **Step 3: Write minimal implementation**

En `gastos/src/panel/router.js`: importar `const { crearAsientoManual, anularAsientoManual } = require('../contabilidad/manual'); const contaCuentas = require('../contabilidad/cuentas');`. En la región protegida (`requireKind('user')`) agregar las mismas 3 rutas que en la app:
```javascript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/panel/manual-api.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/panel/router.js gastos/tests/panel/manual-api.test.js
git commit -m "feat(varas-f5): API panel cuentas + crear/anular asiento manual"
```

---

## Task 4: Cierre F5a — suite completa

- [ ] **Step 1: Suite backend**

Run: `cd gastos && npx jest`
Expected: PASS — todo verde, sin regresión (un asiento manual aparece en Diario/Mayor/Balance; al anularlo desaparece — F1 ya lo maneja).

- [ ] **Step 2: Commit final (si quedó algo)**

```bash
git add -A && git commit -m "test(varas-f5): suite F5a verde" || echo "nada que commitear"
```

---

## Notas de cierre F5a

- El asiento manual `ajuste` NO entra al Flujo de Caja (los reportes de flujo filtran `tipo_asiento='pago'`) — correcto: un ajuste no es movimiento de caja. Si alguna vez se quiere un asiento manual que SÍ afecte caja, sería `tipo_asiento='pago'` (futuro).
- **Pendiente F5b (UI):** panel — formulario "Nuevo asiento manual" (filas cuenta·debe·haber + cuadre en vivo) + botón Anular en el Libro Diario; app — mismo formulario en el hub VARAS + anular desde Diario. Métodos en `api.js` (`listCuentasApp`, `crearAsientoManual`, `anularAsiento`).
- **Deploy:** backend puro (sin migración nueva — usa las tablas de F1). Desplegar con F5b para valor visible.
- ⚠️ Trabajar SOLO en `HASH IA\`.
