# VARAS Auxiliares — Fase A3: UI confirmable + CRUD panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el dueño vea y corrija el mapeo de insumos: en la app, la pantalla de confirmar muestra el desglose de líneas → auxiliar (reasignable) → cantidad·unidad; en el panel, una sección "Auxiliares" para curar el catálogo (renombrar, fusionar, borrar, recolgar a una cuenta), setear el **giro** de la empresa y **sembrar** auxiliares por rubro.

**Architecture:** Backend agrega endpoints de lectura/edición (app: listar auxiliares + reasignar el auxiliar de una línea; panel: CRUD de auxiliares + merge + sembrar + giro), todos scoped por `company_id`. La app: `ConfirmScreen` carga las líneas (`GET /expenses/:id/lineas`, de A1) + el catálogo y permite reasignar el auxiliar por línea. El panel: helper puro `auxiliaresTableHtml` en `lib.js` + pestaña "Auxiliares" en `index.html`. Reusa A1/A2 (repos de auxiliares y líneas, `mapearLineas`, `semilla`, `getGiro/setGiro`).

**Tech Stack:** Node/Express + pg-mem/Jest/supertest; app React/Jest-RTL (tests en `gastos-app/tests/`); panel lib.js (jest node) + index.html. Sin deps nuevas.

**Repo:** `C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA` (canónico, rama `master`). Backend: `cd "...\HASH IA\gastos" && npx jest`. App: `cd "...\HASH IA\gastos-app" && npx jest` / `npm run build`. Commit `git -c user.name="José Antonio Olguín" -c user.email="atikodigital@gmail.com"`. Confirmar `rev-parse --show-toplevel` ends in `HASH IA`.

---

## File Structure

**Backend — Modificar:**
- `gastos/src/expenses/lineas-repo.js` — `getLineaConCompany(db, lineaId)`, `setLineaAuxiliar(db, lineaId, auxiliarId)`.
- `gastos/src/auxiliares/repo.js` — `updateAuxiliar`, `setActivo`, `mergeAuxiliar`.
- `gastos/src/app/router.js` — `GET /auxiliares`, `PATCH /lineas/:id` (reasignar auxiliar / cantidad / unidad).
- `gastos/src/panel/router.js` — `GET/POST /auxiliares`, `PATCH /auxiliares/:id`, `POST /auxiliares/:id/merge`, `POST /auxiliares/sembrar`, `GET/PATCH /giro`.
- `gastos/public/panel/lib.js` — `auxiliaresTableHtml`.
- `gastos/public/panel/index.html` — pestaña "Auxiliares".

**App — Modificar:**
- `gastos-app/src/gastos/api.js` — `listAuxiliares`, `setLineaAuxiliar`, `getExpenseLineas`.
- `gastos-app/src/gastos/ConfirmScreen.jsx` — sección "Insumos detectados".

**Tests:** `gastos/tests/auxiliares/repo-edit.test.js`, `gastos/tests/auxiliares/app-lineas-patch.test.js`, `gastos/tests/panel/auxiliares-router.test.js`, `gastos/tests/panel/auxiliares-lib.test.js`, `gastos-app/tests/gastos/ConfirmInsumos.test.jsx`.

---

## Task 1: Repos — editar/fusionar auxiliar y reasignar línea

**Files:**
- Modify: `gastos/src/expenses/lineas-repo.js`, `gastos/src/auxiliares/repo.js`
- Test: `gastos/tests/auxiliares/repo-edit.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/auxiliares/repo-edit.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const aux = require('../../src/auxiliares/repo');
const lineas = require('../../src/expenses/lineas-repo');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';
const EXP = '33333333-3333-3333-3333-333333333333';

test('updateAuxiliar renombra y setActivo desactiva', async () => {
  const db = await makeDb();
  const a = await aux.createAuxiliar(db, COMPANY, { nombre: 'Harnia' });
  const up = await aux.updateAuxiliar(db, COMPANY, a.id, { nombre: 'Harina', unidad_principal: 'kg' });
  expect(up.nombre).toBe('Harina');
  await aux.setActivo(db, COMPANY, a.id, false);
  expect((await aux.listAuxiliares(db, COMPANY)).length).toBe(0); // listAuxiliares solo activos
});

test('setLineaAuxiliar reasigna y getLineaConCompany trae company_id del gasto', async () => {
  const db = await makeDb();
  const { createExpense } = require('../../src/expenses/repo');
  await db.query("INSERT INTO companies (id, nombre) VALUES ($1,'T')", [COMPANY]);
  const exp = await createExpense(db, { company_id: COMPANY, tipo: 'gasto', total: 1000 });
  await lineas.createLineas(db, exp.id, [{ descripcion: 'X', total: 1000 }]);
  const ls = await lineas.getLineas(db, exp.id);
  const a = await aux.createAuxiliar(db, COMPANY, { nombre: 'Harina' });
  await lineas.setLineaAuxiliar(db, ls[0].id, a.id);
  const lc = await lineas.getLineaConCompany(db, ls[0].id);
  expect(lc.company_id).toBe(COMPANY);
  expect(lc.auxiliar_id).toBe(a.id);
});

test('mergeAuxiliar reapunta las líneas del "from" al "to" y desactiva el from', async () => {
  const db = await makeDb();
  const { createExpense } = require('../../src/expenses/repo');
  await db.query("INSERT INTO companies (id, nombre) VALUES ($1,'T')", [COMPANY]);
  const exp = await createExpense(db, { company_id: COMPANY, tipo: 'gasto', total: 1000 });
  const from = await aux.createAuxiliar(db, COMPANY, { nombre: 'harina trigo', sinonimos: ['harina 0000'] });
  const to = await aux.createAuxiliar(db, COMPANY, { nombre: 'Harina' });
  await lineas.createLineas(db, exp.id, [{ descripcion: 'X', total: 1000, auxiliar_id: from.id }]);
  await aux.mergeAuxiliar(db, COMPANY, from.id, to.id);
  const ls = await lineas.getLineas(db, exp.id);
  expect(ls[0].auxiliar_id).toBe(to.id);
  expect((await aux.listAuxiliares(db, COMPANY)).find((x) => x.id === from.id)).toBeFalsy(); // from desactivado
  const toAux = await aux.getById(db, to.id);
  expect(toAux.sinonimos).toContain('harina 0000'); // hereda sinónimos
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/auxiliares/repo-edit.test.js`
Expected: FAIL — funciones no existen.

- [ ] **Step 3: Write minimal implementation**

En `gastos/src/expenses/lineas-repo.js` (append antes de `module.exports`, y exportarlas):
```javascript
async function getLineaConCompany(db, lineaId) {
  await ensureLineasTable(db);
  const r = await db.query(
    `SELECT el.*, e.company_id FROM expense_lineas el JOIN expenses e ON e.id = el.expense_id WHERE el.id=$1`,
    [lineaId]
  );
  return r.rows[0] || null;
}
async function setLineaAuxiliar(db, lineaId, auxiliarId, patch = {}) {
  await ensureLineasTable(db);
  const sets = ['auxiliar_id=$2']; const vals = [lineaId, auxiliarId || null];
  if (patch.cantidad != null) { vals.push(Number(patch.cantidad)); sets.push(`cantidad=$${vals.length}`); }
  if (patch.unidad != null) { vals.push(String(patch.unidad)); sets.push(`unidad=$${vals.length}`); }
  const r = await db.query(`UPDATE expense_lineas SET ${sets.join(', ')} WHERE id=$1 RETURNING *`, vals);
  return r.rows[0] || null;
}
```
En `gastos/src/auxiliares/repo.js` (append antes de `module.exports`, y exportarlas):
```javascript
async function updateAuxiliar(db, companyId, id, patch = {}) {
  await ensureAuxiliaresTable(db);
  const exists = (await db.query('SELECT id FROM auxiliares WHERE id=$1 AND company_id=$2', [id, companyId])).rows[0];
  if (!exists) return null;
  const campos = ['nombre', 'naturaleza', 'unidad_principal', 'cuenta_id', 'estado'];
  const sets = []; const vals = [id, companyId];
  for (const c of campos) { if (patch[c] !== undefined) { vals.push(patch[c]); sets.push(`${c}=$${vals.length}`); } }
  if (!sets.length) return getById(db, id);
  const r = await db.query(`UPDATE auxiliares SET ${sets.join(', ')} WHERE id=$1 AND company_id=$2 RETURNING ${COLS}`, vals);
  return r.rows[0] || null;
}
async function setActivo(db, companyId, id, activo) {
  await ensureAuxiliaresTable(db);
  const r = await db.query(`UPDATE auxiliares SET activo=$3 WHERE id=$1 AND company_id=$2 RETURNING ${COLS}`, [id, companyId, !!activo]);
  return r.rows[0] || null;
}
async function mergeAuxiliar(db, companyId, fromId, toId) {
  await ensureAuxiliaresTable(db);
  const from = await getById(db, fromId); const to = await getById(db, toId);
  if (!from || !to || from.company_id !== companyId || to.company_id !== companyId) return null;
  // reapunta las líneas del from al to
  await db.query('UPDATE expense_lineas SET auxiliar_id=$1 WHERE auxiliar_id=$2', [toId, fromId]);
  // hereda sinónimos (nombre + sinónimos del from)
  const merged = new Set([...(to.sinonimos || []), from.nombre, ...((from.sinonimos) || [])].filter(Boolean));
  await db.query('UPDATE auxiliares SET sinonimos=$2::jsonb WHERE id=$1', [toId, JSON.stringify([...merged])]);
  await db.query('UPDATE auxiliares SET activo=false WHERE id=$1', [fromId]);
  return getById(db, toId);
}
```
(`getById`, `COLS`, `ensureAuxiliaresTable` ya existen de A1/A2.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/auxiliares/repo-edit.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/expenses/lineas-repo.js gastos/src/auxiliares/repo.js gastos/tests/auxiliares/repo-edit.test.js
git commit -m "feat(varas-aux): repos editar/fusionar auxiliar + reasignar linea"
```

---

## Task 2: App API — listar auxiliares + reasignar auxiliar de una línea

**Files:**
- Modify: `gastos/src/app/router.js`
- Test: `gastos/tests/auxiliares/app-lineas-patch.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/auxiliares/app-lineas-patch.test.js
const request = require('supertest');
const express = require('express');
require('express-async-errors');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { signToken } = require('../../src/auth/jwt');
const { createExpense } = require('../../src/expenses/repo');
const lineas = require('../../src/expenses/lineas-repo');
const aux = require('../../src/auxiliares/repo');
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
  const a = await aux.createAuxiliar(db, COMPANY, { nombre: 'Harina' });
  const exp = await createExpense(db, { company_id: COMPANY, employee_id: EMP, tipo: 'gasto', total: 1000 });
  await lineas.createLineas(db, exp.id, [{ descripcion: 'X', total: 1000 }]);
  const ls = await lineas.getLineas(db, exp.id);
  const app = express(); app.use(express.json()); app.use('/api/app', createAppRouter({ db }));
  const token = signToken({ kind: 'employee', companyId: COMPANY, employeeId: EMP, rol: 'empleado' });
  return { app, token, auxId: a.id, lineaId: ls[0].id };
}

test('GET /api/app/auxiliares lista', async () => {
  const { app, token } = await setup();
  const r = await request(app).get('/api/app/auxiliares').set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(200);
  expect(r.body.auxiliares.length).toBe(1);
});

test('PATCH /api/app/lineas/:id reasigna auxiliar (tenant ok)', async () => {
  const { app, token, auxId, lineaId } = await setup();
  const r = await request(app).patch(`/api/app/lineas/${lineaId}`).set('Authorization', `Bearer ${token}`).send({ auxiliar_id: auxId });
  expect(r.status).toBe(200);
  expect(r.body.linea.auxiliar_id).toBe(auxId);
});

test('PATCH /api/app/lineas/:id de otra empresa -> 404', async () => {
  const { app, lineaId } = await setup();
  const otro = signToken({ kind: 'employee', companyId: '99999999-9999-9999-9999-999999999999', employeeId: 'x', rol: 'empleado' });
  const r = await request(app).patch(`/api/app/lineas/${lineaId}`).set('Authorization', `Bearer ${otro}`).send({ auxiliar_id: null });
  expect(r.status).toBe(404);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/auxiliares/app-lineas-patch.test.js`
Expected: FAIL — 404 en las rutas.

- [ ] **Step 3: Write minimal implementation**

En `gastos/src/app/router.js`: importar arriba `const { listAuxiliares } = require('../auxiliares/repo');` y `const { getLineaConCompany, setLineaAuxiliar } = require('../expenses/lineas-repo');` (junto al `getLineas` ya importado en A1). En la región protegida agregar:
```javascript
  router.get('/auxiliares', async (req, res) => {
    res.json({ auxiliares: await listAuxiliares(db, req.auth.companyId) });
  });
  router.patch('/lineas/:id', async (req, res) => {
    const lc = await getLineaConCompany(db, req.params.id);
    if (!lc || lc.company_id !== req.auth.companyId) return res.status(404).json({ error: 'no_existe' });
    const b = req.body || {};
    const linea = await setLineaAuxiliar(db, req.params.id, b.auxiliar_id !== undefined ? b.auxiliar_id : lc.auxiliar_id, { cantidad: b.cantidad, unidad: b.unidad });
    res.json({ linea });
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/auxiliares/app-lineas-patch.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/app/router.js gastos/tests/auxiliares/app-lineas-patch.test.js
git commit -m "feat(varas-aux): API app listar auxiliares + reasignar linea"
```

---

## Task 3: App — `ConfirmScreen` muestra y reasigna insumos

**Files:**
- Modify: `gastos-app/src/gastos/api.js`, `gastos-app/src/gastos/ConfirmScreen.jsx`
- Test: `gastos-app/tests/gastos/ConfirmInsumos.test.jsx`

- [ ] **Step 1: Agregar métodos a `api.js`** (junto a los de expenses):
```javascript
  getExpenseLineas(id) { return req(`/api/app/expenses/${id}/lineas`); },
  listAuxiliaresApp() { return req('/api/app/auxiliares'); },
  setLineaAuxiliar(lineaId, auxiliar_id) { return req(`/api/app/lineas/${lineaId}`, { method: 'PATCH', body: { auxiliar_id } }); },
```

- [ ] **Step 2: Write the failing test**

```jsx
// gastos-app/tests/gastos/ConfirmInsumos.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConfirmScreen from '../../src/gastos/ConfirmScreen.jsx';
import { api } from '../../src/gastos/api';
jest.mock('../../src/gastos/api');

beforeEach(() => {
  api.getExpenseLineas = jest.fn().mockResolvedValue({ lineas: [
    { id: 'l1', descripcion: 'Harina 25kg', cantidad: 2, unidad: 'kg', total: 11900, auxiliar_id: 'a1' },
  ] });
  api.listAuxiliaresApp = jest.fn().mockResolvedValue({ auxiliares: [
    { id: 'a1', nombre: 'Harina' }, { id: 'a2', nombre: 'Levadura' },
  ] });
  api.setLineaAuxiliar = jest.fn().mockResolvedValue({ linea: { id: 'l1', auxiliar_id: 'a2' } });
  api.updateExpense = jest.fn(); api.confirmExpense = jest.fn().mockResolvedValue({});
});

test('muestra las líneas con su insumo y permite reasignar', async () => {
  render(<ConfirmScreen expense={{ id: 'e1', tipo: 'gasto', total: 11900 }} onDone={() => {}} />);
  expect(await screen.findByText(/Harina 25kg/)).toBeInTheDocument();
  const select = await screen.findByLabelText(/insumo-l1/i);
  fireEvent.change(select, { target: { value: 'a2' } });
  await waitFor(() => expect(api.setLineaAuxiliar).toHaveBeenCalledWith('l1', 'a2'));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd gastos-app && npx jest tests/gastos/ConfirmInsumos.test.jsx`
Expected: FAIL — no muestra insumos.

- [ ] **Step 4: Write implementation** (en `ConfirmScreen.jsx`, agregar estado + carga + bloque)

Tras los `useState` existentes, agregar:
```jsx
  const [lineas, setLineas] = useState([]);
  const [auxes, setAuxes] = useState([]);
  useState(() => { /* placeholder para evitar lint si no usado */ });
  // carga inicial (solo gasto)
  useEffect(() => {
    let vivo = true;
    if (e.tipo === 'ingreso') return undefined;
    Promise.all([api.getExpenseLineas(e.id).catch(() => ({ lineas: [] })), api.listAuxiliaresApp().catch(() => ({ auxiliares: [] }))])
      .then(([l, a]) => { if (!vivo) return; setLineas((l && l.lineas) || []); setAuxes((a && a.auxiliares) || []); });
    return () => { vivo = false; };
  }, [e.id, e.tipo]);
  async function reasignar(lineaId, auxiliarId) {
    setLineas((prev) => prev.map((x) => x.id === lineaId ? { ...x, auxiliar_id: auxiliarId } : x));
    try { await api.setLineaAuxiliar(lineaId, auxiliarId); } catch (_) { /* noop */ }
  }
```
(IMPORTA `useEffect` desde 'react' en el import del tope: `import { useState, useEffect } from 'react';`.)

Insertar el bloque ANTES de los botones de confirmar (después del bloque de categoría), solo para gasto y si hay líneas:
```jsx
      {!esIngreso && lineas.length ? (
        <div className="grid gap-2">
          <div className="text-xs font-black opacity-70">Insumos detectados — corrige el auxiliar si hace falta:</div>
          {lineas.map((l) => (
            <div key={l.id} className="rounded-xl border p-2 text-sm grid gap-1">
              <div className="flex justify-between gap-2"><span className="truncate">{l.descripcion}</span><span className="font-bold">{clp(l.total)}</span></div>
              <div className="text-[11px] opacity-60">{l.cantidad != null ? l.cantidad + ' ' + (l.unidad || '') : ''}</div>
              <select aria-label={`insumo-${l.id}`} className="w-full rounded-lg border px-2 py-1 bg-black/5 text-sm"
                value={l.auxiliar_id || ''} onChange={(ev) => reasignar(l.id, ev.target.value || null)}>
                <option value="">— sin insumo —</option>
                {auxes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
          ))}
        </div>
      ) : null}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd gastos-app && npx jest tests/gastos/ConfirmInsumos.test.jsx`
Expected: PASS. Si el placeholder `useState(() => {})` molesta al lint/test, quítalo (era solo recordatorio); deja `useEffect`.

- [ ] **Step 6: Commit**

```bash
git add gastos-app/src/gastos/api.js gastos-app/src/gastos/ConfirmScreen.jsx gastos-app/tests/gastos/ConfirmInsumos.test.jsx
git commit -m "feat(varas-aux): ConfirmScreen muestra y reasigna insumos por linea"
```

---

## Task 4: Panel API — CRUD auxiliares + merge + sembrar + giro

**Files:**
- Modify: `gastos/src/panel/router.js`
- Test: `gastos/tests/panel/auxiliares-router.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/panel/auxiliares-router.test.js
const request = require('supertest');
const express = require('express');
require('express-async-errors');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { signToken } = require('../../src/auth/jwt');
const aux = require('../../src/auxiliares/repo');
const { createPanelRouter } = require('../../src/panel/router');

const COMPANY = '11111111-1111-1111-1111-111111111111';
async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await db.query("INSERT INTO companies (id, nombre) VALUES ($1,'T')", [COMPANY]);
  const app = express(); app.use(express.json()); app.use('/api/panel', createPanelRouter({ db }));
  const token = signToken({ kind: 'user', companyId: COMPANY, userId: 'u', rol: 'owner' });
  return { app, token, db };
}

test('POST/GET/PATCH auxiliares + sembrar (componer inyectado) + giro', async () => {
  const { app, token } = await setup();
  // crear
  let r = await request(app).post('/api/panel/auxiliares').set('Authorization', `Bearer ${token}`).send({ nombre: 'Harina', unidad_principal: 'kg' });
  expect(r.status).toBe(201);
  const id = r.body.id;
  // listar
  r = await request(app).get('/api/panel/auxiliares').set('Authorization', `Bearer ${token}`);
  expect(r.body.auxiliares.length).toBe(1);
  // renombrar
  r = await request(app).patch(`/api/panel/auxiliares/${id}`).set('Authorization', `Bearer ${token}`).send({ nombre: 'Harina selecta' });
  expect(r.body.auxiliar.nombre).toBe('Harina selecta');
  // giro
  r = await request(app).patch('/api/panel/giro').set('Authorization', `Bearer ${token}`).send({ giro: 'pizzería' });
  expect(r.status).toBe(200);
  r = await request(app).get('/api/panel/giro').set('Authorization', `Bearer ${token}`);
  expect(r.body.giro).toBe('pizzería');
});

test('sin token -> 401', async () => {
  const { app } = await setup();
  expect((await request(app).get('/api/panel/auxiliares')).status).toBe(401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/panel/auxiliares-router.test.js`
Expected: FAIL — 404.

- [ ] **Step 3: Write minimal implementation**

En `gastos/src/panel/router.js`: importar arriba `const auxRepo = require('../auxiliares/repo'); const { sembrarPorRubro } = require('../auxiliares/semilla'); const { getGiro, setGiro } = require('../companies/repo');`. En la región protegida (`requireKind('user')`) agregar:
```javascript
  router.get('/auxiliares', async (req, res) => res.json({ auxiliares: await auxRepo.listAuxiliares(db, req.auth.companyId) }));
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
  router.post('/auxiliares/sembrar', async (req, res) => {
    const giro = (req.body && req.body.giro) || (await getGiro(db, req.auth.companyId));
    const n = await sembrarPorRubro(db, req.auth.companyId, giro);
    res.json({ creados: n });
  });
  router.get('/giro', async (req, res) => res.json({ giro: await getGiro(db, req.auth.companyId) }));
  router.patch('/giro', async (req, res) => { await setGiro(db, req.auth.companyId, (req.body || {}).giro); res.json({ ok: true }); });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/panel/auxiliares-router.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/panel/router.js gastos/tests/panel/auxiliares-router.test.js
git commit -m "feat(varas-aux): API panel CRUD auxiliares + merge + sembrar + giro"
```

---

## Task 5: Panel UI — pestaña "Auxiliares" (lib.js + index.html)

**Files:**
- Modify: `gastos/public/panel/lib.js`, `gastos/public/panel/index.html`
- Test: `gastos/tests/panel/auxiliares-lib.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/panel/auxiliares-lib.test.js
const lib = require('../../public/panel/lib');

test('auxiliaresTableHtml lista nombre/naturaleza/unidad y escapa XSS', () => {
  const html = lib.auxiliaresTableHtml([
    { id: 'a1', nombre: 'Harina', naturaleza: 'insumo', unidad_principal: 'kg', estado: 'confirmado' },
    { id: 'a2', nombre: '<script>x</script>', naturaleza: 'insumo', unidad_principal: 'un', estado: 'sugerido' },
  ]);
  expect(html).toContain('Harina');
  expect(html).toContain('kg');
  expect(html).not.toContain('<script>x</script>');
});

test('auxiliaresTableHtml vacío', () => {
  expect(lib.auxiliaresTableHtml([]).toLowerCase()).toContain('sin auxiliares');
});

const fs = require('fs'); const path = require('path');
test('index.html declara la pestaña Auxiliares', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../public/panel/index.html'), 'utf8');
  expect(html).toContain('data-tab="auxiliares"');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/panel/auxiliares-lib.test.js`
Expected: FAIL — `auxiliaresTableHtml is not a function`.

- [ ] **Step 3: Write minimal implementation**

(a) En `gastos/public/panel/lib.js`, agregar y exponer en el `return {...}`:
```javascript
  function auxiliaresTableHtml(auxiliares) {
    const rows = (auxiliares || []).map(function (a) {
      return '<tr data-aux="' + escapeHtml(a.id) + '">'
        + '<td>' + escapeHtml(a.nombre) + '</td>'
        + '<td>' + escapeHtml(a.naturaleza || '') + '</td>'
        + '<td>' + escapeHtml(a.unidad_principal || '') + '</td>'
        + '<td>' + escapeHtml(a.estado || '') + '</td>'
        + '<td><button class="btn-ghost aux-del" data-aux="' + escapeHtml(a.id) + '">Borrar</button></td>'
        + '</tr>';
    }).join('');
    return '<table class="tbl"><thead><tr><th>Insumo</th><th>Tipo</th><th>Unidad</th><th>Estado</th><th></th></tr></thead><tbody>'
      + (rows || '<tr><td colspan="5">Sin auxiliares. Setea el giro y pulsa "Sembrar".</td></tr>') + '</tbody></table>';
  }
```
(b) En `gastos/public/panel/index.html`: agregar `<button class="tab" data-tab="auxiliares">Auxiliares</button>` a la barra; una sección `<section id="auxiliaresSection" class="hidden">` con: input giro + botón "Guardar giro" + botón "Sembrar por rubro" + form simple "agregar insumo" (nombre + unidad) + `<div id="auxContenido">`. Cablear en el IIFE (reusar `apiFetch`/`PanelLib`): al abrir la tab cargar `apiFetch('/auxiliares')` → `PanelLib.auxiliaresTableHtml(d.auxiliares)`; botón sembrar → `POST /auxiliares/sembrar` → recargar; guardar giro → `PATCH /giro`; agregar → `POST /auxiliares` → recargar; `.aux-del` → `POST /auxiliares/:id/desactivar` → recargar. Seguir el patrón exacto de las otras tabs (toggle `.hidden`, `res = await apiFetch(...); data = await res.json();`). Cargar el giro actual con `GET /giro` al abrir.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/panel/`
Expected: PASS (todos los de panel + el nuevo).

- [ ] **Step 5: Commit**

```bash
git add gastos/public/panel/lib.js gastos/public/panel/index.html gastos/tests/panel/auxiliares-lib.test.js
git commit -m "feat(varas-aux): pestaña Auxiliares en el panel (CRUD + giro + sembrar)"
```

---

## Task 6: Cierre A3 — suites + build

- [ ] **Step 1: Backend + app + build**

Run: `cd gastos && npx jest` (verde) ; `cd gastos-app && npx jest && npm run build` (verde + build OK).

- [ ] **Step 2: Commit final (si quedó algo)**

```bash
git add -A && git commit -m "test(varas-aux): suites A3 verdes" || echo "nada que commitear"
```

---

## Notas de cierre A3

- Con A3, el ciclo de auxiliares es usable de punta a punta salvo los REPORTES (A4): el dueño ve/corrige insumos al confirmar y cura el catálogo en el panel.
- **A4 (siguiente):** `GET /api/app/auxiliares/:id/consumo?periodo=` (cantidad por unidad + monto + serie) + vista de consumo/evolución en el panel + tools conversacionales de VARAS ("¿cuántos kilos de harina?").
- **Deploy:** A1+A2+A3 juntos = `node deploy-gastos-wt.js` desde `HASH IA\` (backend+panel) + rebuild APK (bump versión) para el ConfirmScreen. Migración aditiva (tablas auxiliares/expense_lineas + columna giro).
- ⚠️ Trabajar SOLO en `HASH IA\`.
