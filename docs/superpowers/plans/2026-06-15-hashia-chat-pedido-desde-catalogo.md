# Pedido desde el catálogo (Hash IA · Chat #2) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **WORKTREE GUARD (cada subagente):** trabaja SOLO en el worktree `C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112`. Toda ruta debe contener `.claude\worktrees\dazzling-driscoll-78a112`. Antes de commitear, correr `git rev-parse --show-toplevel && git branch --show-current` y confirmar que el toplevel termina en `dazzling-driscoll-78a112` y el branch es `claude/dazzling-driscoll-78a112`. `gastos/` y `gastos-app/` TAMBIÉN existen en el checkout principal (`main`) — NO tocar esos. Nunca `git add -A`.

**Goal:** Que dentro del Chat el usuario arme un pedido eligiendo productos del catálogo (variantes/extras/cantidad), con precio calculado en el servidor e IVA según la config del negocio, y lo envíe por WhatsApp.

**Architecture:** Backend: una config `companies.pedido_iva_incluido` + `describeSelection` (puro) + un endpoint `POST /api/app/pedido/from-catalog` que mapea selecciones del catálogo a items de pedido (usando `priceForSelection` + el `pedidos/repo.js` existente). App: un armador de pedido (`PedidoBuilder` + `ProductSelector` + `cart.js`) que reemplaza el flujo de IA en `ChatView`, más un toggle de IVA en el panel.

**Tech Stack:** Node/Express, jest + pg-mem, Capacitor/React/Vite, jest + React Testing Library, TDD. Spec: `docs/superpowers/specs/2026-06-15-hashia-chat-pedido-desde-catalogo-design.md`.

---

## Task 1: Config de IVA por empresa (pedido-config en pedidos/repo.js)

**Files:**
- Modify: `gastos/src/pedidos/repo.js`
- Test: `gastos/tests/pedidos/pedido-config.test.js`

- [ ] **Step 1: Write the failing test**

```js
// gastos/tests/pedidos/pedido-config.test.js
const { newDb } = require('pg-mem');
const repo = require('../../src/pedidos/repo');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await db.query("CREATE TABLE companies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nombre text)");
  return db;
}

test('getPedidoConfig default: iva_incluido true, pie null; setPedidoConfig lo cambia', async () => {
  const db = await freshDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const id = c.rows[0].id;

  const def = await repo.getPedidoConfig(db, id);
  expect(def).toEqual({ pie: null, iva_incluido: true });

  await repo.setPedidoConfig(db, id, { pie: 'Atiko SpA', iva_incluido: false });
  const upd = await repo.getPedidoConfig(db, id);
  expect(upd).toEqual({ pie: 'Atiko SpA', iva_incluido: false });

  // set parcial: solo iva, conserva pie
  await repo.setPedidoConfig(db, id, { iva_incluido: true });
  const upd2 = await repo.getPedidoConfig(db, id);
  expect(upd2).toEqual({ pie: 'Atiko SpA', iva_incluido: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/pedidos/pedido-config.test.js`
Expected: FAIL — `repo.getPedidoConfig is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `gastos/src/pedidos/repo.js`, add the column to `ensurePedidosTable` (after the existing `ALTER TABLE companies ADD COLUMN IF NOT EXISTS pedido_pie text;` line, add another ALTER):

```js
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS pedido_iva_incluido boolean NOT NULL DEFAULT true;
```

Then add these functions before `module.exports`:

```js
async function getPedidoConfig(db, companyId) {
  await ensurePedidosTable(db);
  const r = await db.query('SELECT pedido_pie, pedido_iva_incluido FROM companies WHERE id = $1', [companyId]);
  const row = r.rows[0] || {};
  return {
    pie: row.pedido_pie || null,
    iva_incluido: row.pedido_iva_incluido === undefined || row.pedido_iva_incluido === null ? true : !!row.pedido_iva_incluido,
  };
}

async function setPedidoConfig(db, companyId, cfg = {}) {
  await ensurePedidosTable(db);
  if (cfg.pie !== undefined) {
    await db.query('UPDATE companies SET pedido_pie = $2 WHERE id = $1', [companyId, cfg.pie ? String(cfg.pie).slice(0, 1000) : null]);
  }
  if (cfg.iva_incluido !== undefined) {
    await db.query('UPDATE companies SET pedido_iva_incluido = $2 WHERE id = $1', [companyId, !!cfg.iva_incluido]);
  }
  return getPedidoConfig(db, companyId);
}
```

Add `getPedidoConfig, setPedidoConfig,` to the `module.exports` object (keep `getCompanyPie`/`setCompanyPie`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/pedidos/pedido-config.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gastos/src/pedidos/repo.js gastos/tests/pedidos/pedido-config.test.js
git commit -m "feat(pedido): config pedido_iva_incluido + getPedidoConfig/setPedidoConfig"
```

---

## Task 2: describeSelection (puro) en catalog/repo.js

**Files:**
- Modify: `gastos/src/catalog/repo.js`
- Test: `gastos/tests/catalog/describe.test.js`

- [ ] **Step 1: Write the failing test**

```js
// gastos/tests/catalog/describe.test.js
const catalog = require('../../src/catalog/repo');

const torta = {
  nombre: 'Torta de chocolate',
  variantes: [
    { id: 'g1', nombre: 'Tamaño', opciones: [{ id: 'o1', nombre: '10p', delta: 0 }, { id: 'o2', nombre: '15 personas', delta: 8000 }] },
    { id: 'g2', nombre: 'Sabor', opciones: [{ id: 'o3', nombre: 'Chocolate', delta: 0 }, { id: 'o4', nombre: 'Red velvet', delta: 3000 }] },
  ],
  extras: [{ id: 'e1', nombre: 'Velas', precio: 1500 }, { id: 'e2', nombre: 'Dedicatoria', precio: 2000 }],
};

test('describeSelection: producto sin selección = solo nombre', () => {
  expect(catalog.describeSelection({ nombre: 'Café', variantes: [], extras: [] }, {})).toBe('Café');
});

test('describeSelection: con variantes elegidas y extras', () => {
  const sel = { opciones: { g1: 'o2', g2: 'o4' }, extras: ['e1', 'e2'] };
  expect(catalog.describeSelection(torta, sel)).toBe('Torta de chocolate (15 personas, Red velvet) + Velas, Dedicatoria');
});

test('describeSelection: solo una variante, sin extras', () => {
  expect(catalog.describeSelection(torta, { opciones: { g1: 'o2' } })).toBe('Torta de chocolate (15 personas)');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/catalog/describe.test.js`
Expected: FAIL — `catalog.describeSelection is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `gastos/src/catalog/repo.js`, add before `module.exports`:

```js
// Descripción legible de una línea de pedido a partir del producto + selección. PURA.
function describeSelection(product, selection = {}) {
  const nombre = String((product && product.nombre) || 'Producto').trim();
  const elegidas = (selection && selection.opciones) || {};
  const partes = [];
  for (const g of (Array.isArray(product && product.variantes) ? product.variantes : [])) {
    const op = (g.opciones || []).find((o) => o.id === elegidas[g.id]);
    if (op) partes.push(op.nombre);
  }
  const elegidosExtras = new Set(Array.isArray(selection && selection.extras) ? selection.extras : []);
  const extras = (Array.isArray(product && product.extras) ? product.extras : [])
    .filter((e) => elegidosExtras.has(e.id)).map((e) => e.nombre);
  let txt = nombre;
  if (partes.length) txt += ' (' + partes.join(', ') + ')';
  if (extras.length) txt += ' + ' + extras.join(', ');
  return txt.slice(0, 200);
}
```

Add `describeSelection,` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/catalog/describe.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/catalog/repo.js gastos/tests/catalog/describe.test.js
git commit -m "feat(catalog): describeSelection (descripción de línea, puro)"
```

---

## Task 3: Endpoint POST /api/app/pedido/from-catalog

**Files:**
- Modify: `gastos/src/app/router.js`
- Test: `gastos/tests/pedidos/from-catalog.test.js`

- [ ] **Step 1: Write the failing test**

```js
// gastos/tests/pedidos/from-catalog.test.js
process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { hashPassword } = require('../../src/auth/password');
const { createAppRouter } = require('../../src/app/router');
const catalog = require('../../src/catalog/repo');
const pedidos = require('../../src/pedidos/repo');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}
async function seed(db) {
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const companyId = c.rows[0].id;
  const hash = await hashPassword('clave');
  await db.query("INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'Juan','juan',$2)", [companyId, hash]);
  const torta = await catalog.createProduct(db, companyId, {
    nombre: 'Torta', precio_base: 18000,
    variantes: [{ id: 'g1', nombre: 'Tamaño', opciones: [{ id: 'o1', nombre: '10p', delta: 0 }, { id: 'o2', nombre: '15p', delta: 8000 }] }],
    extras: [{ id: 'e1', nombre: 'Velas', precio: 1500 }],
  });
  return { companyId, tortaId: torta.id };
}
function buildApp(db) {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use('/api/app', createAppRouter({ db }));
  return app;
}
async function token(app) {
  const r = await request(app).post('/api/app/login').send({ usuario: 'juan', password: 'clave' });
  return r.body.token;
}

test('from-catalog arma el pedido con precio del servidor; IVA incluido => impuesto 0', async () => {
  const db = await freshDb(); const { tortaId } = await seed(db);
  const app = buildApp(db); const t = await token(app);
  const r = await request(app).post('/api/app/pedido/from-catalog').set('Authorization', `Bearer ${t}`)
    .send({ channel: 'whatsapp', contact: { name: 'Ana', phone: '912345678' },
      lineas: [{ productId: tortaId, opciones: { g1: 'o2' }, extras: ['e1'], cantidad: 2 }],
      entrega: 'despacho', direccion: 'Calle 1' }).expect(201);
  expect(r.body.pedido.items).toHaveLength(1);
  expect(r.body.pedido.items[0].descripcion).toBe('Torta (15p) + Velas');
  expect(r.body.pedido.items[0].precio_unitario).toBe(27500); // 18000+8000+1500
  expect(r.body.pedido.items[0].cantidad).toBe(2);
  expect(Number(r.body.pedido.total)).toBe(55000); // sin IVA aparte
  expect(Number(r.body.pedido.impuesto)).toBe(0);
  expect(r.body.text).toContain('Torta (15p) + Velas');
  expect(r.body.waUrl).toContain('wa.me');
});

test('IVA agregado cuando iva_incluido=false', async () => {
  const db = await freshDb(); const { companyId, tortaId } = await seed(db);
  await pedidos.setPedidoConfig(db, companyId, { iva_incluido: false });
  const app = buildApp(db); const t = await token(app);
  const r = await request(app).post('/api/app/pedido/from-catalog').set('Authorization', `Bearer ${t}`)
    .send({ lineas: [{ productId: tortaId, opciones: { g1: 'o1' }, cantidad: 1 }] }).expect(201);
  expect(Number(r.body.pedido.impuesto)).toBe(Math.round(18000 * 0.19));
  expect(Number(r.body.pedido.total)).toBe(18000 + Math.round(18000 * 0.19));
});

test('producto inexistente se omite; 0 líneas válidas => 400', async () => {
  const db = await freshDb(); await seed(db);
  const app = buildApp(db); const t = await token(app);
  await request(app).post('/api/app/pedido/from-catalog').set('Authorization', `Bearer ${t}`)
    .send({ lineas: [{ productId: '00000000-0000-0000-0000-000000009999', cantidad: 1 }] }).expect(400);
});

test('exige token', async () => {
  const db = await freshDb(); await seed(db);
  const app = buildApp(db);
  await request(app).post('/api/app/pedido/from-catalog').send({ lineas: [] }).expect(401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/pedidos/from-catalog.test.js`
Expected: FAIL — endpoint returns 404 (not defined).

- [ ] **Step 3: Write minimal implementation**

In `gastos/src/app/router.js`, add a require near the other requires (after `const { suggestOrder } = require('../pedidos/suggest');`):

```js
const catalogRepo = require('../catalog/repo');
```

Then add this route AFTER `router.use(requireAuth, requireKind('employee'));` (e.g. right after the `registerCatalogRoutes(router, { db });` line):

```js
  // Crear pedido eligiendo del catálogo (reemplaza el "adivinar" del Chat).
  router.post('/pedido/from-catalog', async (req, res) => {
    const b = req.body || {};
    const lineasIn = Array.isArray(b.lineas) ? b.lineas : [];
    const items = [];
    for (const ln of lineasIn) {
      const prod = await catalogRepo.getProduct(db, req.auth.companyId, ln && ln.productId);
      if (!prod) continue;
      const sel = { opciones: (ln.opciones) || {}, extras: Array.isArray(ln.extras) ? ln.extras : [] };
      items.push({
        descripcion: catalogRepo.describeSelection(prod, sel),
        cantidad: Math.max(1, parseInt(ln.cantidad, 10) || 1),
        precio_unitario: catalogRepo.priceForSelection(prod, sel),
      });
    }
    if (!items.length) return res.status(400).json({ error: 'sin_lineas' });
    const cfg = await pedidosRepo.getPedidoConfig(db, req.auth.companyId);
    const contact = b.contact || {};
    const ped = await pedidosRepo.createPedido(db, req.auth.companyId, {
      channel: b.channel || 'whatsapp',
      contact_name: contact.name, contact_phone: contact.phone,
      items, impuesto_pct: cfg.iva_incluido ? 0 : 19,
      entrega: b.entrega, direccion: b.direccion, nota: b.nota,
    });
    const text = pedidosRepo.pedidoToText(ped, { pie: cfg.pie });
    return res.status(201).json({ pedido: ped, text, waUrl: pedidosRepo.waLink(text, contact.phone) });
  });
```

(NOTE: `pedidosRepo` is already required at the top of `app/router.js` as `const pedidosRepo = require('../pedidos/repo');`. Confirm it is; if the alias differs, use the existing one.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/pedidos/from-catalog.test.js`
Expected: PASS (4 tests). Then `cd gastos && npx jest` → full suite green.

- [ ] **Step 5: Commit**

```bash
git add gastos/src/app/router.js gastos/tests/pedidos/from-catalog.test.js
git commit -m "feat(pedido): POST /api/app/pedido/from-catalog (precio del servidor + IVA config)"
```

---

## Task 4: Endpoints pedido-config (app + panel)

**Files:**
- Modify: `gastos/src/app/router.js`, `gastos/src/panel/router.js`
- Test: `gastos/tests/pedidos/pedido-config-routes.test.js`

- [ ] **Step 1: Write the failing test**

```js
// gastos/tests/pedidos/pedido-config-routes.test.js
process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { hashPassword } = require('../../src/auth/password');
const { createAppRouter } = require('../../src/app/router');
const { createPanelRouter } = require('../../src/panel/router');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}

test('panel: GET/PATCH /pedido-config', async () => {
  const db = await freshDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const hash = await hashPassword('clave');
  await db.query("INSERT INTO users(company_id, email, password_hash, rol) VALUES($1,'d@x.cl',$2,'owner')", [c.rows[0].id, hash]);
  const app = express(); app.use(express.json()); app.use('/api/panel', createPanelRouter({ db }));
  const t = (await request(app).post('/api/panel/login').send({ email: 'd@x.cl', password: 'clave' })).body.token;
  const auth = (r) => r.set('Authorization', `Bearer ${t}`);
  const def = await auth(request(app).get('/api/panel/pedido-config')).expect(200);
  expect(def.body).toEqual({ pie: null, iva_incluido: true });
  await auth(request(app).patch('/api/panel/pedido-config').send({ iva_incluido: false })).expect(200);
  const upd = await auth(request(app).get('/api/panel/pedido-config')).expect(200);
  expect(upd.body.iva_incluido).toBe(false);
});

test('app: GET /pedido-config para la vista previa', async () => {
  const db = await freshDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const hash = await hashPassword('clave');
  await db.query("INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'J','juan',$2)", [c.rows[0].id, hash]);
  const app = express(); app.use(express.json()); app.use('/api/app', createAppRouter({ db }));
  const t = (await request(app).post('/api/app/login').send({ usuario: 'juan', password: 'clave' })).body.token;
  const r = await request(app).get('/api/app/pedido-config').set('Authorization', `Bearer ${t}`).expect(200);
  expect(r.body).toEqual({ pie: null, iva_incluido: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/pedidos/pedido-config-routes.test.js`
Expected: FAIL — routes 404.

- [ ] **Step 3: Write minimal implementation**

In `gastos/src/app/router.js`, add after the `from-catalog` route:

```js
  router.get('/pedido-config', async (req, res) => {
    return res.json(await pedidosRepo.getPedidoConfig(db, req.auth.companyId));
  });
  router.patch('/pedido-config', async (req, res) => {
    return res.json(await pedidosRepo.setPedidoConfig(db, req.auth.companyId, req.body || {}));
  });
```

In `gastos/src/panel/router.js`, add a require near the top if `pedidos/repo` is not imported yet:

```js
const pedidosRepo = require('../pedidos/repo');
```

Then after `registerCatalogRoutes(router, { db });` (the line added in #1's Task 6), add:

```js
  router.get('/pedido-config', async (req, res) => {
    return res.json(await pedidosRepo.getPedidoConfig(db, req.auth.companyId));
  });
  router.patch('/pedido-config', async (req, res) => {
    return res.json(await pedidosRepo.setPedidoConfig(db, req.auth.companyId, req.body || {}));
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/pedidos/pedido-config-routes.test.js`
Expected: PASS (2 tests). Then `cd gastos && npx jest` → full suite green.

- [ ] **Step 5: Commit**

```bash
git add gastos/src/app/router.js gastos/src/panel/router.js gastos/tests/pedidos/pedido-config-routes.test.js
git commit -m "feat(pedido): endpoints pedido-config (app + panel)"
```

---

## Task 5: App — cart.js (helpers puros)

**Files:**
- Create: `gastos-app/src/gastos/pedido/cart.js`
- Test: `gastos-app/tests/gastos/cart.test.js`

- [ ] **Step 1: Write the failing test**

```js
// gastos-app/tests/gastos/cart.test.js
import { linePrice, lineLabel, cartTotal } from '../../src/gastos/pedido/cart';

const torta = {
  nombre: 'Torta', precio_base: 18000,
  variantes: [{ id: 'g1', nombre: 'Tamaño', opciones: [{ id: 'o1', nombre: '10p', delta: 0 }, { id: 'o2', nombre: '15p', delta: 8000 }] }],
  extras: [{ id: 'e1', nombre: 'Velas', precio: 1500 }],
};

test('linePrice = base + delta opción + extras', () => {
  expect(linePrice(torta, { opciones: { g1: 'o2' }, extras: ['e1'] })).toBe(27500);
  expect(linePrice(torta, {})).toBe(18000);
});

test('lineLabel describe la selección', () => {
  expect(lineLabel(torta, { opciones: { g1: 'o2' }, extras: ['e1'] })).toBe('Torta (15p) + Velas');
});

test('cartTotal suma líneas; agrega IVA si iva_incluido=false', () => {
  const lineas = [{ product: torta, sel: { opciones: { g1: 'o2' }, extras: ['e1'] }, cantidad: 2 }]; // 55000
  expect(cartTotal(lineas, { iva_incluido: true })).toBe(55000);
  expect(cartTotal(lineas, { iva_incluido: false })).toBe(55000 + Math.round(55000 * 0.19));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos-app && npx jest tests/gastos/cart.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// gastos-app/src/gastos/pedido/cart.js
// Espejo (vista previa) de la lógica de precio/descr del backend. El servidor es autoritativo al generar.
function _int(v) { const n = Math.round(Number(v) || 0); return Number.isFinite(n) ? n : 0; }

export function linePrice(product, sel = {}) {
  let total = Math.max(0, _int(product && product.precio_base));
  const op = (sel && sel.opciones) || {};
  for (const g of (product && product.variantes ? product.variantes : [])) {
    const o = (g.opciones || []).find((x) => x.id === op[g.id]);
    if (o) total += _int(o.delta);
  }
  const ex = new Set(Array.isArray(sel && sel.extras) ? sel.extras : []);
  for (const e of (product && product.extras ? product.extras : [])) {
    if (ex.has(e.id)) total += Math.max(0, _int(e.precio));
  }
  return total;
}

export function lineLabel(product, sel = {}) {
  const nombre = String((product && product.nombre) || 'Producto').trim();
  const op = (sel && sel.opciones) || {};
  const partes = [];
  for (const g of (product && product.variantes ? product.variantes : [])) {
    const o = (g.opciones || []).find((x) => x.id === op[g.id]);
    if (o) partes.push(o.nombre);
  }
  const ex = new Set(Array.isArray(sel && sel.extras) ? sel.extras : []);
  const extras = (product && product.extras ? product.extras : []).filter((e) => ex.has(e.id)).map((e) => e.nombre);
  let txt = nombre;
  if (partes.length) txt += ' (' + partes.join(', ') + ')';
  if (extras.length) txt += ' + ' + extras.join(', ');
  return txt;
}

export function cartTotal(lineas, cfg = {}) {
  const sub = (lineas || []).reduce((s, l) => s + linePrice(l.product, l.sel) * Math.max(1, _int(l.cantidad) || 1), 0);
  return cfg.iva_incluido === false ? sub + Math.round(sub * 0.19) : sub;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos-app && npx jest tests/gastos/cart.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos-app/src/gastos/pedido/cart.js gastos-app/tests/gastos/cart.test.js
git commit -m "feat(pedido-app): cart.js helpers puros (precio/label/total)"
```

---

## Task 6: App — ProductSelector + PedidoBuilder + api + ChatView

**Files:**
- Modify: `gastos-app/src/gastos/api.js`
- Create: `gastos-app/src/gastos/pedido/ProductSelector.jsx`
- Create: `gastos-app/src/gastos/pedido/PedidoBuilder.jsx`
- Modify: `gastos-app/src/gastos/ChatView.jsx`
- Test: `gastos-app/tests/gastos/PedidoBuilder.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// gastos-app/tests/gastos/PedidoBuilder.test.jsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PedidoBuilder from '../../src/gastos/pedido/PedidoBuilder';
import { api } from '../../src/gastos/api';

jest.mock('../../src/gastos/api', () => ({
  api: { listProducts: jest.fn(), getPedidoConfig: jest.fn(), pedidoFromCatalog: jest.fn() },
}));

const torta = {
  id: 'p1', nombre: 'Torta', tipo: 'producto', precio_base: 18000, activo: true,
  variantes: [{ id: 'g1', nombre: 'Tamaño', opciones: [{ id: 'o1', nombre: '10p', delta: 0 }, { id: 'o2', nombre: '15p', delta: 8000 }] }],
  extras: [{ id: 'e1', nombre: 'Velas', precio: 1500 }],
};

test('elige producto, agrega al carrito y genera el pedido', async () => {
  api.listProducts.mockResolvedValue([torta]);
  api.getPedidoConfig.mockResolvedValue({ pie: null, iva_incluido: true });
  api.pedidoFromCatalog.mockResolvedValue({ text: 'PEDIDO', waUrl: 'https://wa.me/?text=PEDIDO' });

  render(<PedidoBuilder channel="whatsapp" contact="Ana" onClose={() => {}} />);
  await waitFor(() => expect(screen.getByText('Torta')).toBeInTheDocument());

  fireEvent.click(screen.getByText('Torta'));               // abre selector
  fireEvent.click(await screen.findByText('15p'));          // elige variante
  fireEvent.click(screen.getByText('Agregar al carrito'));  // al carrito

  fireEvent.click(await screen.findByText('Generar pedido'));
  await waitFor(() => expect(api.pedidoFromCatalog).toHaveBeenCalled());
  const arg = api.pedidoFromCatalog.mock.calls[0][0];
  expect(arg.lineas[0]).toMatchObject({ productId: 'p1', opciones: { g1: 'o2' } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos-app && npx jest tests/gastos/PedidoBuilder.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

In `gastos-app/src/gastos/api.js`, add inside the `api` object:

```js
  pedidoFromCatalog(payload) { return req('/api/app/pedido/from-catalog', { method: 'POST', body: payload }); },
  getPedidoConfig() { return req('/api/app/pedido-config'); },
  setPedidoConfig(cfg) { return req('/api/app/pedido-config', { method: 'PATCH', body: cfg }); },
```

Create `gastos-app/src/gastos/pedido/ProductSelector.jsx`:

```jsx
import React, { useMemo, useState } from 'react';
import { linePrice, lineLabel } from './cart';

const GOLD = '#C9A24B';
const clp = (n) => '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL');

export default function ProductSelector({ product, onAdd, onCancel }) {
  const initial = useMemo(() => {
    const op = {};
    for (const g of (product.variantes || [])) { if (g.opciones && g.opciones[0]) op[g.id] = g.opciones[0].id; }
    return op;
  }, [product]);
  const [opciones, setOpciones] = useState(initial);
  const [extras, setExtras] = useState([]);
  const [cantidad, setCantidad] = useState(1);
  const sel = { opciones, extras };
  const precio = linePrice(product, sel) * cantidad;

  function toggleExtra(id) { setExtras((xs) => xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]); }

  return (
    <div style={{ padding: 12 }}>
      <h3 style={{ color: GOLD, fontWeight: 900 }}>{product.nombre}</h3>
      {(product.variantes || []).map((g) => (
        <div key={g.id} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>{g.nombre}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(g.opciones || []).map((o) => (
              <button key={o.id} onClick={() => setOpciones((p) => ({ ...p, [g.id]: o.id }))}
                style={{ padding: '6px 10px', borderRadius: 8, border: 0, fontSize: 12,
                  background: opciones[g.id] === o.id ? GOLD : '#ffffff14', color: opciones[g.id] === o.id ? '#000' : '#fff' }}>
                {o.nombre}{o.delta ? ' +' + clp(o.delta) : ''}
              </button>
            ))}
          </div>
        </div>
      ))}
      {(product.extras || []).length ? <div style={{ fontSize: 11, opacity: 0.7, margin: '8px 0 4px' }}>Extras</div> : null}
      {(product.extras || []).map((e) => (
        <label key={e.id} style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 4 }}>
          <input type="checkbox" checked={extras.includes(e.id)} onChange={() => toggleExtra(e.id)} />
          {e.nombre} +{clp(e.precio)}
        </label>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 0' }}>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Cantidad</span>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={() => setCantidad((c) => Math.max(1, c - 1))} style={{ border: 0, background: '#ffffff14', color: '#fff', borderRadius: 6, width: 28, height: 28 }}>−</button>
          <b>{cantidad}</b>
          <button onClick={() => setCantidad((c) => c + 1)} style={{ border: 0, background: '#ffffff14', color: '#fff', borderRadius: 6, width: 28, height: 28 }}>+</button>
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '0.5px solid #ffffff22', paddingTop: 8 }}>
        <span style={{ fontSize: 12, opacity: 0.7 }}>{lineLabel(product, sel)}</span>
        <b style={{ color: GOLD }}>{clp(precio)}</b>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={onCancel} style={{ flex: 1, border: 0, background: '#ffffff14', color: '#fff', fontWeight: 800, borderRadius: 10, padding: 10 }}>Volver</button>
        <button onClick={() => onAdd({ productId: product.id, opciones, extras, cantidad })}
          style={{ flex: 2, border: 0, background: GOLD, color: '#000', fontWeight: 800, borderRadius: 10, padding: 10 }}>Agregar al carrito</button>
      </div>
    </div>
  );
}
```

Create `gastos-app/src/gastos/pedido/PedidoBuilder.jsx`:

```jsx
import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { cartTotal } from './cart';
import ProductSelector from './ProductSelector';

const GOLD = '#C9A24B';
const clp = (n) => '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL');
function abrir(url) { try { window.open(url, '_blank'); } catch (_e) { window.location.href = url; } }

export default function PedidoBuilder({ channel, contact, onClose }) {
  const [productos, setProductos] = useState([]);
  const [cfg, setCfg] = useState({ iva_incluido: true });
  const [sel, setSel] = useState(null);        // producto en edición
  const [lineas, setLineas] = useState([]);    // { product, productId, opciones, extras, cantidad }
  const [entrega, setEntrega] = useState('retiro');
  const [direccion, setDireccion] = useState('');
  const [pedido, setPedido] = useState(null);  // { text, waUrl }
  const [err, setErr] = useState('');

  useEffect(() => {
    api.listProducts().then((p) => setProductos(Array.isArray(p) ? p : [])).catch(() => setProductos([]));
    api.getPedidoConfig().then(setCfg).catch(() => {});
  }, []);

  function addLinea(l) {
    const product = productos.find((p) => p.id === l.productId);
    setLineas((xs) => [...xs, { ...l, product }]);
    setSel(null);
  }
  const total = cartTotal(lineas.map((l) => ({ product: l.product, sel: { opciones: l.opciones, extras: l.extras }, cantidad: l.cantidad })), cfg);

  async function generar() {
    setErr('');
    try {
      const r = await api.pedidoFromCatalog({
        channel, contact: { name: contact },
        lineas: lineas.map((l) => ({ productId: l.productId, opciones: l.opciones, extras: l.extras, cantidad: l.cantidad })),
        entrega, direccion: entrega === 'despacho' ? direccion : null,
      });
      setPedido({ text: r.text || '', waUrl: r.waUrl || '' });
    } catch (e) { setErr('No pude generar el pedido.'); }
  }

  if (pedido) {
    return (
      <div style={{ padding: 12 }}>
        <h3 style={{ color: GOLD, fontWeight: 900 }}>Pedido listo</h3>
        <textarea value={pedido.text} onChange={(e) => setPedido({ ...pedido, text: e.target.value, waUrl: 'https://wa.me/?text=' + encodeURIComponent(e.target.value) })}
          rows={10} style={{ width: '100%', borderRadius: 12, padding: 10 }} />
        <button onClick={() => abrir(pedido.waUrl)} style={{ width: '100%', border: 0, background: '#16A34A', color: '#fff', fontWeight: 900, borderRadius: 12, padding: 12, marginTop: 8 }}>Enviar por WhatsApp</button>
        <button onClick={onClose} style={{ width: '100%', border: 0, background: 'transparent', color: '#fff', opacity: 0.6, marginTop: 8 }}>Cerrar</button>
      </div>
    );
  }

  if (sel) return <ProductSelector product={sel} onAdd={addLinea} onCancel={() => setSel(null)} />;

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ color: GOLD, fontWeight: 900 }}>Arma el pedido</h3>
        <button onClick={onClose} style={{ border: 0, background: 'transparent', color: '#fff', opacity: 0.6 }}>✕</button>
      </div>
      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>Elige del catálogo</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {productos.map((p) => (
          <button key={p.id} onClick={() => setSel(p)} style={{ textAlign: 'left', border: 0, background: '#ffffff10', color: '#fff', borderRadius: 10, padding: 10, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 800 }}>{p.nombre}</span>
            <span style={{ color: GOLD, fontSize: 12 }}>›</span>
          </button>
        ))}
        {!productos.length && <div style={{ opacity: 0.6, fontSize: 13 }}>No hay productos. Cárgalos en "Productos".</div>}
      </div>

      {lineas.length ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>Carrito</div>
          {lineas.map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
              <span>{l.product && l.product.nombre} ×{l.cantidad}</span>
              <button onClick={() => setLineas((xs) => xs.filter((_, j) => j !== i))} style={{ border: 0, background: 'transparent', color: '#ff6b6b' }}>quitar</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
            <button onClick={() => setEntrega('retiro')} style={{ flex: 1, border: 0, borderRadius: 8, padding: 8, fontSize: 12, background: entrega === 'retiro' ? GOLD : '#ffffff14', color: entrega === 'retiro' ? '#000' : '#fff' }}>Retiro</button>
            <button onClick={() => setEntrega('despacho')} style={{ flex: 1, border: 0, borderRadius: 8, padding: 8, fontSize: 12, background: entrega === 'despacho' ? GOLD : '#ffffff14', color: entrega === 'despacho' ? '#000' : '#fff' }}>Despacho</button>
          </div>
          {entrega === 'despacho' ? <input placeholder="Dirección" value={direccion} onChange={(e) => setDireccion(e.target.value)} style={{ width: '100%', borderRadius: 8, padding: 8, marginBottom: 8 }} /> : null}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '0.5px solid #ffffff22', paddingTop: 8 }}>
            <span style={{ opacity: 0.7 }}>Total</span><b style={{ color: GOLD, fontSize: 18 }}>{clp(total)}</b>
          </div>
          {err ? <div style={{ color: '#ff6b6b', fontSize: 13 }}>{err}</div> : null}
          <button onClick={generar} style={{ width: '100%', border: 0, background: GOLD, color: '#000', fontWeight: 900, borderRadius: 12, padding: 12, marginTop: 8 }}>Generar pedido</button>
        </div>
      ) : null}
    </div>
  );
}
```

In `gastos-app/src/gastos/ChatView.jsx`, replace the AI flow in `Conversacion`:
- Import at top: `import PedidoBuilder from './pedido/PedidoBuilder';`
- Add state: `const [armando, setArmando] = useState(false);`
- Change the bottom "Crear pedido" button's `onClick` to `() => setArmando(true)` (remove the `crearPedido`/`suggestOrder` call and the old `pedido` textarea branch; the `busy`/`crearPedido` logic and the `import { api }`-based `pedidoDesdeConversacion` call are no longer used in this component).
- When `armando` is true, render `<PedidoBuilder channel={conv.channel} contact={conv.contact} onClose={() => setArmando(false)} />` instead of the messages list.

Concretely, the `Conversacion` return becomes:
```jsx
  if (armando) return <PedidoBuilder channel={conv.channel} contact={conv.contact} onClose={() => setArmando(false)} />;
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 pb-2 shrink-0 flex items-center gap-2 border-b">
        <button onClick={onBack} className="text-base font-black" style={{ color: GOLD }}>←</button>
        <div className="font-black truncate">{conv.contact || 'Sin nombre'}</div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 grid gap-2 content-start">
        {msgs === null ? <div className="opacity-60 text-sm">Cargando…</div>
          : msgs.length === 0 ? <div className="opacity-60 text-sm">Sin mensajes capturados aún.</div>
            : msgs.map((m, i) => <div key={i} className="rounded-xl bg-black/5 p-2 text-sm whitespace-pre-wrap">{m.text}</div>)}
      </div>
      <div className="p-3 shrink-0 border-t">
        <button onClick={() => setArmando(true)} className="w-full rounded-xl font-black py-3 text-black" style={{ background: GOLD }}>🧾 Crear pedido</button>
      </div>
    </div>
  );
```
Remove the now-unused `pedido`, `busy`, `err`, `crearPedido`, `waLinkLocal`, `abrir` from `Conversacion` if they are no longer referenced (keep whatever the messages list still uses). Leave `ChatView` (the list component) unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos-app && npx jest tests/gastos/PedidoBuilder.test.jsx`
Expected: PASS. Then `cd gastos-app && npx jest` → full app suite green. Then `cd gastos-app && npm run build` → build OK.

- [ ] **Step 5: Commit**

```bash
git add gastos-app/src/gastos/api.js gastos-app/src/gastos/pedido/ProductSelector.jsx gastos-app/src/gastos/pedido/PedidoBuilder.jsx gastos-app/src/gastos/ChatView.jsx gastos-app/tests/gastos/PedidoBuilder.test.jsx
git commit -m "feat(pedido-app): armador de pedido desde catálogo en el Chat"
```

---

## Task 7: Toggle IVA en el panel (Ajustes)

**Files:**
- Modify: `gastos/public/panel/index.html`
- Test: `gastos/tests/panel/pedido-config-static.test.js`

- [ ] **Step 1: Write the failing test**

```js
// gastos/tests/panel/pedido-config-static.test.js
const request = require('supertest');
const { app } = require('../../src/server');

test('Ajustes incluye el toggle de IVA del pedido', async () => {
  const res = await request(app).get('/panel/');
  expect(res.status).toBe(200);
  expect(res.text).toContain('id="ivaIncluido"');
  expect(res.text).toContain('incluyen IVA');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/panel/pedido-config-static.test.js`
Expected: FAIL — el html no contiene el toggle.

- [ ] **Step 3: Write minimal implementation**

READ `gastos/public/panel/index.html` to find the `settingsSection` (Ajustes) markup and the existing `apiFetch` usage. Inside `settingsSection`, add this control:

```html
<div class="card">
  <label style="display:flex; align-items:center; gap:8px;">
    <input type="checkbox" id="ivaIncluido" />
    <span>Mis precios ya incluyen IVA (el pedido muestra el total final, sin sumar 19%)</span>
  </label>
</div>
```

In the panel `<script>`, load + persist it via the existing `apiFetch` (matching how Ajustes loads/saves other company settings). Add to the function that loads Ajustes:
```js
(async () => { try { const r = await apiFetch('/pedido-config'); const c = await r.json(); document.getElementById('ivaIncluido').checked = c.iva_incluido !== false; } catch (e) {} })();
document.getElementById('ivaIncluido').onchange = async (e) => {
  try { await apiFetch('/pedido-config', { method: 'PATCH', body: JSON.stringify({ iva_incluido: e.target.checked }) }); } catch (_e) {}
};
```
(If Ajustes has a dedicated `loadSettings()` that runs when the tab opens, put the GET there; otherwise the IIFE above on first render is fine. Match the file's real `apiFetch` contract — it returns a `Response`, so call `.json()`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/panel/pedido-config-static.test.js`
Expected: PASS. Then `cd gastos && npx jest tests/panel/` → all panel tests green.

- [ ] **Step 5: Commit**

```bash
git add gastos/public/panel/index.html gastos/tests/panel/pedido-config-static.test.js
git commit -m "feat(pedido): toggle 'precios incluyen IVA' en Ajustes del panel"
```

---

## Task 8: Verificación final (suite + build)

**Files:** (sin cambios; verificación)

- [ ] **Step 1: Backend completo**

Run: `cd gastos && npx jest`
Expected: PASS — 192 anteriores + nuevos (≈ +14). 0 fallos.

- [ ] **Step 2: App completa**

Run: `cd gastos-app && npx jest`
Expected: PASS — 115 anteriores + cart + PedidoBuilder.

- [ ] **Step 3: Build de la app**

Run: `cd gastos-app && npm run build`
Expected: build OK sin errores.

---

## Notas de despliegue (NO en este plan; con el usuario después)
- Backend: `node deploy-gastos-wt.js` (sube worktree, no toca `.env`). Migración = `pedido_iva_incluido` (ALTER idempotente en `ensurePedidosTable`).
- App: recompilar APK + subir con `upload-apk-wt.js`.

## Self-review (hecho)
- **Cobertura del spec:** config IVA `pedido_iva_incluido` + get/set ✅(T1) + endpoints ✅(T4) + toggle Ajustes ✅(T7); `describeSelection` ✅(T2); `from-catalog` con precio del servidor + IVA según config ✅(T3); app cart/selector/builder + ChatView reapuntado + api ✅(T5,T6); tests pg-mem + RTL ✅. `suggest.js` intacto (no se toca). Tenant scoping vía `getProduct` (null cross-tenant) ✅(T3).
- **Sin placeholders:** todo el código está completo.
- **Consistencia de tipos:** `describeSelection(product, {opciones,extras})` y `priceForSelection(product, {opciones,extras})` usan la misma forma de `selection` en backend (T2/T3) y su espejo en `cart.js` (`linePrice`/`lineLabel`, T5); el payload `from-catalog` `{lineas:[{productId,opciones,extras,cantidad}]}` coincide entre el endpoint (T3), `api.pedidoFromCatalog` y `PedidoBuilder` (T6); `getPedidoConfig`→`{pie,iva_incluido}` consistente entre T1, T4, T6, T7.
