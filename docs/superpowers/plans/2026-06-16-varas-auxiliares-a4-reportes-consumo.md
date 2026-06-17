# VARAS Auxiliares — Fase A4: Reportes de consumo + evolución — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Responder "¿cuánta harina consumimos? (en kilos)", "¿cuánto gastamos en harina?" y "dame la evolución": una consulta de consumo por auxiliar (cantidad por unidad + monto + serie mensual), endpoints en app y panel, una vista de consumo/evolución en el panel, y un **helper de frase** (`frasearConsumo`) listo para que el agente conversacional de VARAS lo use como tool.

**Architecture:** El consumo sale de `expense_lineas` (cantidad, unidad, total, auxiliar_id) uniendo a `expenses` para la fecha (y excluyendo `estado='anulado'`). `auxiliares/reportes.js` provee `consumoAuxiliar` (por id) y `consumoPorNombre` (busca el auxiliar por nombre/sinónimo y consulta) — esto último es la base de la pregunta en lenguaje natural. `frasearConsumo` arma una frase legible. Endpoints app (por id y por nombre, con frase) + panel (por id). El panel: al tocar un auxiliar muestra su consumo + evolución. Multi-tenant por `company_id`. Reusa `periodoRange` (`expenses/query.js`) y `findMatch` (A2).

**Tech Stack:** Node/Express + pg-mem/Jest/supertest; panel lib.js + index.html. Sin deps nuevas.

**Repo:** `C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA` (canónico, rama `master`). Tests backend: `cd "...\HASH IA\gastos" && npx jest`. Commit `git -c user.name="José Antonio Olguín" -c user.email="atikodigital@gmail.com"`. Confirmar `rev-parse --show-toplevel` ends in `HASH IA`.

**Depende de A1/A2/A3:** `expense_lineas` (con auxiliar_id+cantidad+unidad), `auxiliares/repo` (listAuxiliares/findMatch/getById), `expenses/query.periodoRange`.

---

## File Structure

**Crear:**
- `gastos/src/auxiliares/reportes.js` — `consumoAuxiliar(db, companyId, auxiliarId, filtros)`, `consumoPorNombre(db, companyId, nombre, filtros)`, `frasearConsumo(consumo, nombre)`.
- Tests: `gastos/tests/auxiliares/reportes.test.js`, `gastos/tests/auxiliares/frasear.test.js`, `gastos/tests/auxiliares/api-consumo.test.js`, `gastos/tests/panel/consumo-lib.test.js`.

**Modificar:**
- `gastos/src/app/router.js` — `GET /auxiliares/:id/consumo`, `GET /auxiliares/consumo?nombre=`.
- `gastos/src/panel/router.js` — `GET /auxiliares/:id/consumo`.
- `gastos/public/panel/lib.js` — `consumoHtml(consumo, nombre)`.
- `gastos/public/panel/index.html` — al tocar una fila de Auxiliares, mostrar consumo/evolución.

**Contrato del consumo:**
```
{ auxiliar: { id, nombre } | null,
  cantidadPorUnidad: { kg: 50, ... },
  monto: 59500,                       // Σ total de las líneas
  serie: [ { ym: '2026-06', cantidad: 50, monto: 59500 } ] }   // por mes (suma de cantidades, sin importar unidad mezclada)
```

---

## Task 1: Consulta de consumo (`reportes.js`)

**Files:**
- Create: `gastos/src/auxiliares/reportes.js`
- Test: `gastos/tests/auxiliares/reportes.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/auxiliares/reportes.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createExpense } = require('../../src/expenses/repo');
const lineas = require('../../src/expenses/lineas-repo');
const aux = require('../../src/auxiliares/repo');
const { consumoAuxiliar, consumoPorNombre } = require('../../src/auxiliares/reportes');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await db.query("INSERT INTO companies (id, nombre) VALUES ($1,'T')", [COMPANY]);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';

async function seed(db) {
  const harina = await aux.createAuxiliar(db, COMPANY, { nombre: 'Harina', unidad_principal: 'kg', sinonimos: ['harina de trigo'] });
  const e1 = await createExpense(db, { company_id: COMPANY, tipo: 'gasto', total: 23800, fecha: '2026-06-10' });
  await lineas.createLineas(db, e1.id, [{ descripcion: 'Harina 25kg', cantidad: 25, unidad: 'kg', total: 11900, auxiliar_id: harina.id }, { descripcion: 'Harina 25kg', cantidad: 25, unidad: 'kg', total: 11900, auxiliar_id: harina.id }]);
  const e2 = await createExpense(db, { company_id: COMPANY, tipo: 'gasto', total: 11900, fecha: '2026-05-12' });
  await lineas.createLineas(db, e2.id, [{ descripcion: 'Harina 20kg', cantidad: 20, unidad: 'kg', total: 11900, auxiliar_id: harina.id }]);
  return harina;
}

test('consumoAuxiliar suma cantidad por unidad, monto y serie mensual', async () => {
  const db = await makeDb();
  const harina = await seed(db);
  const r = await consumoAuxiliar(db, COMPANY, harina.id, {});
  expect(r.cantidadPorUnidad.kg).toBe(70);     // 25+25+20
  expect(r.monto).toBe(35700);                  // 11900*3
  const junio = r.serie.find((s) => s.ym === '2026-06');
  expect(junio.cantidad).toBe(50);
  expect(junio.monto).toBe(23800);
});

test('consumoAuxiliar con período filtra', async () => {
  const db = await makeDb();
  const harina = await seed(db);
  const r = await consumoAuxiliar(db, COMPANY, harina.id, { periodo: '2026-06' });
  expect(r.cantidadPorUnidad.kg).toBe(50);
  expect(r.monto).toBe(23800);
});

test('consumoPorNombre encuentra por nombre/sinónimo', async () => {
  const db = await makeDb();
  await seed(db);
  const r = await consumoPorNombre(db, COMPANY, 'harina de trigo', {});
  expect(r.auxiliar.nombre).toBe('Harina');
  expect(r.cantidadPorUnidad.kg).toBe(70);
});

test('consumoPorNombre sin match → auxiliar null y ceros', async () => {
  const db = await makeDb();
  await seed(db);
  const r = await consumoPorNombre(db, COMPANY, 'plutonio', {});
  expect(r.auxiliar).toBeNull();
  expect(r.monto).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/auxiliares/reportes.test.js`
Expected: FAIL — Cannot find module.

- [ ] **Step 3: Write minimal implementation**

```javascript
// gastos/src/auxiliares/reportes.js
// Consumo por auxiliar: cantidad por unidad + monto + serie mensual.
const { ensureLineasTable } = require('../expenses/lineas-repo');
const auxRepo = require('./repo');
const { periodoRange } = require('../expenses/query');

function _rango(filtros = {}) {
  const p = periodoRange(filtros.periodo);
  return { from: p ? p.from : filtros.from, to: p ? p.to : filtros.to };
}

async function consumoAuxiliar(db, companyId, auxiliarId, filtros = {}) {
  await ensureLineasTable(db);
  const { from, to } = _rango(filtros);
  const where = ["e.company_id = $1", "e.estado <> 'anulado'", "el.auxiliar_id = $2"];
  const vals = [companyId, auxiliarId];
  if (from) { vals.push(from); where.push(`e.fecha >= $${vals.length}`); }
  if (to) { vals.push(to); where.push(`e.fecha <= $${vals.length}`); }
  const r = await db.query(
    `SELECT el.unidad, el.cantidad, el.total, e.fecha
     FROM expense_lineas el JOIN expenses e ON e.id = el.expense_id
     WHERE ${where.join(' AND ')}`, vals
  );
  const cantidadPorUnidad = {}; let monto = 0; const serieMap = {};
  for (const row of r.rows) {
    const u = row.unidad || 'un';
    const cant = Number(row.cantidad) || 0;
    const tot = Math.round(Number(row.total) || 0);
    cantidadPorUnidad[u] = (cantidadPorUnidad[u] || 0) + cant;
    monto += tot;
    const ym = row.fecha ? String(row.fecha).slice(0, 7) : 'sin-fecha';
    if (!serieMap[ym]) serieMap[ym] = { ym, cantidad: 0, monto: 0 };
    serieMap[ym].cantidad += cant;
    serieMap[ym].monto += tot;
  }
  const serie = Object.values(serieMap).sort((a, b) => a.ym.localeCompare(b.ym));
  return { cantidadPorUnidad, monto, serie };
}

async function consumoPorNombre(db, companyId, nombre, filtros = {}) {
  const aux = await auxRepo.findMatch(db, companyId, nombre);
  if (!aux) return { auxiliar: null, cantidadPorUnidad: {}, monto: 0, serie: [] };
  const c = await consumoAuxiliar(db, companyId, aux.id, filtros);
  return { auxiliar: { id: aux.id, nombre: aux.nombre }, ...c };
}

module.exports = { consumoAuxiliar, consumoPorNombre };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/auxiliares/reportes.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/auxiliares/reportes.js gastos/tests/auxiliares/reportes.test.js
git commit -m "feat(varas-aux): consulta de consumo por auxiliar (cantidad/unidad + monto + serie)"
```

---

## Task 2: `frasearConsumo` (helper de frase, puro)

**Files:**
- Modify: `gastos/src/auxiliares/reportes.js`
- Test: `gastos/tests/auxiliares/frasear.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/auxiliares/frasear.test.js
const { frasearConsumo } = require('../../src/auxiliares/reportes');

test('arma una frase legible con cantidad por unidad y monto', () => {
  const f = frasearConsumo({ auxiliar: { nombre: 'Harina' }, cantidadPorUnidad: { kg: 70 }, monto: 35700, serie: [] }, 'Harina');
  expect(f).toMatch(/70\s*kg/i);
  expect(f).toMatch(/Harina/);
  expect(f).toMatch(/\$35\.?700/);
});

test('sin auxiliar → frase de no encontrado', () => {
  const f = frasearConsumo({ auxiliar: null, cantidadPorUnidad: {}, monto: 0, serie: [] }, 'plutonio');
  expect(f.toLowerCase()).toContain('no');
  expect(f).toMatch(/plutonio/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/auxiliares/frasear.test.js`
Expected: FAIL — `frasearConsumo is not a function`.

- [ ] **Step 3: Write minimal implementation** (append a `reportes.js`, actualizar export)

```javascript
function _clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }

function frasearConsumo(consumo, nombrePedido) {
  const c = consumo || {};
  const nombre = (c.auxiliar && c.auxiliar.nombre) || nombrePedido || 'eso';
  if (!c.auxiliar) return `No encontré el insumo "${nombrePedido || nombre}" en tus registros.`;
  const partes = Object.entries(c.cantidadPorUnidad || {}).map(([u, q]) => `${(Math.round((Number(q) || 0) * 100) / 100)} ${u}`);
  const cant = partes.length ? partes.join(' + ') : 'sin cantidad registrada';
  return `${nombre}: consumiste ${cant} por ${_clp(c.monto)}.`;
}
```
Actualizar `module.exports` para incluir `frasearConsumo`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/auxiliares/frasear.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/auxiliares/reportes.js gastos/tests/auxiliares/frasear.test.js
git commit -m "feat(varas-aux): frasearConsumo (frase legible para tool de VARAS)"
```

---

## Task 3: Endpoints de consumo (app + panel)

**Files:**
- Modify: `gastos/src/app/router.js`, `gastos/src/panel/router.js`
- Test: `gastos/tests/auxiliares/api-consumo.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/auxiliares/api-consumo.test.js
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
  await db.query("INSERT INTO employees (id, company_id, nombre) VALUES ($1,$2,'E')", [EMP, COMPANY]);
  const harina = await aux.createAuxiliar(db, COMPANY, { nombre: 'Harina', unidad_principal: 'kg' });
  const e1 = await createExpense(db, { company_id: COMPANY, tipo: 'gasto', total: 11900, fecha: '2026-06-10' });
  await lineas.createLineas(db, e1.id, [{ descripcion: 'Harina 25kg', cantidad: 25, unidad: 'kg', total: 11900, auxiliar_id: harina.id }]);
  const app = express(); app.use(express.json()); app.use('/api/app', createAppRouter({ db }));
  const token = signToken({ kind: 'employee', companyId: COMPANY, employeeId: EMP, rol: 'empleado' });
  return { app, token, auxId: harina.id };
}

test('GET /auxiliares/:id/consumo', async () => {
  const { app, token, auxId } = await setup();
  const r = await request(app).get(`/api/app/auxiliares/${auxId}/consumo?periodo=2026-06`).set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(200);
  expect(r.body.cantidadPorUnidad.kg).toBe(25);
});

test('GET /auxiliares/consumo?nombre= devuelve consumo + frase', async () => {
  const { app, token } = await setup();
  const r = await request(app).get('/api/app/auxiliares/consumo?nombre=harina').set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(200);
  expect(r.body.auxiliar.nombre).toBe('Harina');
  expect(r.body.frase).toMatch(/Harina/);
});

test('sin token -> 401', async () => {
  const { app, auxId } = await setup();
  expect((await request(app).get(`/api/app/auxiliares/${auxId}/consumo`)).status).toBe(401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/auxiliares/api-consumo.test.js`
Expected: FAIL — 404.

- [ ] **Step 3: Write minimal implementation**

En `gastos/src/app/router.js`: importar arriba `const auxReportes = require('../auxiliares/reportes');`. En la región protegida, **ANTES** de `GET /auxiliares/:id/consumo` colocar la ruta literal `/auxiliares/consumo` (para que `:id` no la capture):
```javascript
  router.get('/auxiliares/consumo', async (req, res) => {
    const c = await auxReportes.consumoPorNombre(db, req.auth.companyId, req.query.nombre || '', req.query);
    res.json({ ...c, frase: auxReportes.frasearConsumo(c, req.query.nombre || '') });
  });
  router.get('/auxiliares/:id/consumo', async (req, res) => {
    res.json(await auxReportes.consumoAuxiliar(db, req.auth.companyId, req.params.id, req.query));
  });
```
En `gastos/src/panel/router.js`: importar `const auxReportes = require('../auxiliares/reportes');` y en la región protegida agregar:
```javascript
  router.get('/auxiliares/:id/consumo', async (req, res) => {
    res.json(await auxReportes.consumoAuxiliar(db, req.auth.companyId, req.params.id, req.query));
  });
```
(OJO: en el panel ya existen `/auxiliares/:id` (PATCH) y `/auxiliares/:id/merge` etc.; `/auxiliares/:id/consumo` es GET y no colisiona.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/auxiliares/api-consumo.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/app/router.js gastos/src/panel/router.js gastos/tests/auxiliares/api-consumo.test.js
git commit -m "feat(varas-aux): endpoints de consumo por auxiliar (app por id/nombre + panel)"
```

---

## Task 4: Panel — vista de consumo/evolución al tocar un auxiliar

**Files:**
- Modify: `gastos/public/panel/lib.js`, `gastos/public/panel/index.html`
- Test: `gastos/tests/panel/consumo-lib.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/panel/consumo-lib.test.js
const lib = require('../../public/panel/lib');

test('consumoHtml muestra cantidad por unidad, monto y evolución', () => {
  const html = lib.consumoHtml({
    cantidadPorUnidad: { kg: 70 }, monto: 35700,
    serie: [{ ym: '2026-05', cantidad: 20, monto: 11900 }, { ym: '2026-06', cantidad: 50, monto: 23800 }],
  }, 'Harina');
  expect(html).toContain('Harina');
  expect(html).toContain('70');
  expect(html).toContain('2026-06');
  expect(html).toContain(lib.fmtClp(35700));
});

test('consumoHtml sin datos', () => {
  expect(lib.consumoHtml({ cantidadPorUnidad: {}, monto: 0, serie: [] }, 'X').toLowerCase()).toContain('sin consumo');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/panel/consumo-lib.test.js`
Expected: FAIL — `consumoHtml is not a function`.

- [ ] **Step 3: Write minimal implementation**

(a) En `gastos/public/panel/lib.js`, agregar y exponer:
```javascript
  function consumoHtml(c, nombre) {
    c = c || {};
    var unidades = Object.keys(c.cantidadPorUnidad || {});
    if (!unidades.length && !(c.serie || []).length) return '<p class="muted" style="padding:8px">Sin consumo registrado para ' + escapeHtml(nombre || '') + '.</p>';
    var cant = unidades.map(function (u) { return '<b>' + escapeHtml(String(c.cantidadPorUnidad[u])) + ' ' + escapeHtml(u) + '</b>'; }).join(' + ') || '—';
    var filas = (c.serie || []).map(function (s) {
      return '<tr><td>' + escapeHtml(s.ym) + '</td><td class="num">' + escapeHtml(String(s.cantidad)) + '</td><td class="num">' + fmtClp(s.monto) + '</td></tr>';
    }).join('');
    return '<div class="flujo-tot">' + escapeHtml(nombre || 'Insumo') + ': ' + cant + ' · total <b>' + fmtClp(c.monto) + '</b></div>'
      + '<table class="tbl"><thead><tr><th>Mes</th><th class="num">Cantidad</th><th class="num">Monto</th></tr></thead><tbody>'
      + (filas || '<tr><td colspan="3">Sin evolución.</td></tr>') + '</tbody></table>';
  }
```
(b) En `gastos/public/panel/index.html`, en la pestaña Auxiliares: hacer que al tocar una fila (`tr[data-aux]`) se llame `apiFetch('/auxiliares/' + id + '/consumo')` → `PanelLib.consumoHtml(data, nombre)` en un contenedor (ej. `#auxConsumo` arriba o un modal). Delegar el click sobre la tabla (excluyendo el botón `.aux-del`). Seguir el patrón `res = await apiFetch(...); data = await res.json();` y `PanelLib.*`. Guardar el nombre desde la fila (agregar `data-nombre` en `auxiliaresTableHtml` o tomarlo de la 1ª celda).

> Para que el click tenga el nombre: en `auxiliaresTableHtml` (lib.js) agrega `data-nombre="<nombre>"` al `<tr>` (escapeHtml). Ajusta el test de A3 si valida el `<tr>` exacto (no lo hace; solo busca textos).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/panel/`
Expected: PASS (todos los de panel + el nuevo).

- [ ] **Step 5: Commit**

```bash
git add gastos/public/panel/lib.js gastos/public/panel/index.html gastos/tests/panel/consumo-lib.test.js
git commit -m "feat(varas-aux): panel vista de consumo/evolución por auxiliar"
```

---

## Task 5: Cierre A4 — suites + build

- [ ] **Step 1: Backend completo**

Run: `cd gastos && npx jest`
Expected: PASS — todo verde.

- [ ] **Step 2: App + build**

Run: `cd gastos-app && npx jest && npm run build`
Expected: PASS + build OK. (A4 no toca la app salvo que quieras; si no hubo cambios de app, igual corre para confirmar.)

- [ ] **Step 3: Commit final (si quedó algo)**

```bash
git add -A && git commit -m "test(varas-aux): suites A4 verdes" || echo "nada que commitear"
```

---

## Notas de cierre A4

- Con A4, el feature de auxiliares queda COMPLETO a nivel de datos/UI: capturar (A1), mapear (A2), curar (A3), reportar (A4). La pregunta por voz ("¿cuántos kilos de harina?") usa `GET /api/app/auxiliares/consumo?nombre=...` que ya devuelve la **frase** lista — cuando exista **VARAS conversacional (F4 del roadmap)**, se conecta como tool (`consumo_auxiliar(nombre, periodo)` → frase).
- **Deploy A1+A2+A3+A4:** `node deploy-gastos-wt.js` desde `HASH IA\` (backend+panel) + rebuild APK (ConfirmScreen de A3). Migración aditiva.
- ⚠️ Trabajar SOLO en `HASH IA\`.
