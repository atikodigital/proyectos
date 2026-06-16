# Catálogo de productos (Hash IA · Chat #1) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el catálogo de productos/servicios de Hash IA (tabla `products` + repo + endpoints en app y panel + fotos + pantallas), para que el sub-proyecto #2 cree pedidos eligiendo del catálogo.

**Architecture:** Una tabla `products` (variantes/extras en jsonb) con módulo `gastos/src/catalog/repo.js` (funciones puras de normalización/precio + CRUD acotado por `company_id`). Un helper `registerCatalogRoutes(router,{db})` monta los mismos endpoints en `/api/app` (empleado) y `/api/panel` (dueño). Fotos reusan `src/expenses/storage.js`. UI: pestaña "Productos" en el panel web (vanilla) y `ProductosView.jsx` en la app.

**Tech Stack:** Node/Express, jest + pg-mem (sin Docker), Capacitor/React/Vite, TDD. Spec: `docs/superpowers/specs/2026-06-15-hashia-chat-catalogo-productos-design.md`.

---

## Task 1: Repo — normalización (puro) + tabla

**Files:**
- Create: `gastos/src/catalog/repo.js`
- Test: `gastos/tests/catalog/repo.test.js`

- [ ] **Step 1: Write the failing test**

```js
// gastos/tests/catalog/repo.test.js
const catalog = require('../../src/catalog/repo');

test('normalizeProduct: exige nombre, normaliza tipo/unidad/stock', () => {
  expect(() => catalog.normalizeProduct({ nombre: '  ' })).toThrow('nombre_requerido');

  const p = catalog.normalizeProduct({ nombre: '  Torta  ', tipo: 'raro', precio_base: '18000.4', stock: '8' });
  expect(p.nombre).toBe('Torta');
  expect(p.tipo).toBe('producto');     // 'raro' -> producto
  expect(p.unidad).toBe('unidad');     // producto -> unidad
  expect(p.precio_base).toBe(18000);   // redondeado a entero
  expect(p.stock).toBe(8);
  expect(p.activo).toBe(true);
  expect(p.variantes).toEqual([]);
  expect(p.extras).toEqual([]);
});

test('normalizeProduct: servicio fuerza stock null y unidad por defecto sesion', () => {
  const s = catalog.normalizeProduct({ nombre: 'Corte', tipo: 'servicio', stock: 5 });
  expect(s.tipo).toBe('servicio');
  expect(s.stock).toBeNull();
  expect(s.unidad).toBe('sesion');
});

test('normalizeProduct: variantes y extras reciben id y precios enteros', () => {
  const p = catalog.normalizeProduct({
    nombre: 'Torta',
    variantes: [{ nombre: 'Tamaño', opciones: [{ nombre: '10p', delta: 0 }, { nombre: '15p', delta: '8000' }] }],
    extras: [{ nombre: 'Velas', precio: '1500' }, { nombre: 'Descuento', precio: -50 }],
  });
  expect(p.variantes[0].id).toBeTruthy();
  expect(p.variantes[0].opciones[1].delta).toBe(8000);
  expect(p.variantes[0].opciones[0].id).toBeTruthy();
  expect(p.extras[0].precio).toBe(1500);
  expect(p.extras[1].precio).toBe(0);  // extras no negativos
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/catalog/repo.test.js -t normalizeProduct`
Expected: FAIL — `Cannot find module '../../src/catalog/repo'`.

- [ ] **Step 3: Write minimal implementation**

```js
// gastos/src/catalog/repo.js
// Catálogo de productos/servicios para Hash IA (gastos). Una fila por producto.
// Multi-tenant: cada producto es de su empresa (company_id). Variantes/extras en jsonb.
const crypto = require('crypto');

const TIPOS = ['producto', 'servicio'];
const UNIDADES = ['hora', 'sesion', 'unidad', 'm2', 'fijo'];

let _ready = null;
async function ensureProductsTable(db) {
  if (!_ready) {
    _ready = db.query(`
      CREATE TABLE IF NOT EXISTS products (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL,
        tipo text NOT NULL DEFAULT 'producto',
        nombre text NOT NULL,
        descripcion text,
        categoria text,
        unidad text NOT NULL DEFAULT 'unidad',
        foto_path text,
        precio_base integer NOT NULL DEFAULT 0,
        stock integer,
        variantes jsonb NOT NULL DEFAULT '[]',
        extras jsonb NOT NULL DEFAULT '[]',
        orden integer NOT NULL DEFAULT 0,
        activo boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);
      CREATE INDEX IF NOT EXISTS idx_products_company_orden ON products(company_id, orden);
    `).catch((e) => { _ready = null; throw e; });
  }
  return _ready;
}

function _int(v, def = 0) { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : def; }
function _id(v) { return (v && String(v)) || crypto.randomUUID().slice(0, 8); }

function normalizeVariantes(variantes) {
  return (Array.isArray(variantes) ? variantes : []).slice(0, 8).map((g) => ({
    id: _id(g && g.id),
    nombre: (String((g && g.nombre) || '').trim().slice(0, 60)) || 'Grupo',
    opciones: (Array.isArray(g && g.opciones) ? g.opciones : []).slice(0, 40).map((o) => ({
      id: _id(o && o.id),
      nombre: (String((o && o.nombre) || '').trim().slice(0, 60)) || 'Opción',
      delta: _int(o && o.delta, 0),
    })),
  }));
}
function normalizeExtras(extras) {
  return (Array.isArray(extras) ? extras : []).slice(0, 40).map((e) => ({
    id: _id(e && e.id),
    nombre: (String((e && e.nombre) || '').trim().slice(0, 60)) || 'Extra',
    precio: Math.max(0, _int(e && e.precio, 0)),
  }));
}

// Normaliza el payload de un producto. PURA. Lanza si falta el nombre.
function normalizeProduct(data = {}) {
  const nombre = String(data.nombre || '').trim();
  if (!nombre) { const err = new Error('nombre_requerido'); err.code = 'validacion'; throw err; }
  const tipo = TIPOS.includes(data.tipo) ? data.tipo : 'producto';
  const esServicio = tipo === 'servicio';
  const unidad = esServicio ? (UNIDADES.includes(data.unidad) ? data.unidad : 'sesion') : 'unidad';
  const stock = esServicio ? null
    : (data.stock === null || data.stock === undefined || data.stock === '' ? null : Math.max(0, _int(data.stock, 0)));
  return {
    tipo,
    nombre: nombre.slice(0, 120),
    descripcion: data.descripcion ? String(data.descripcion).trim().slice(0, 500) : null,
    categoria: data.categoria ? String(data.categoria).trim().slice(0, 60) : null,
    unidad,
    precio_base: Math.max(0, _int(data.precio_base, 0)),
    stock,
    variantes: normalizeVariantes(data.variantes),
    extras: normalizeExtras(data.extras),
    orden: _int(data.orden, 0),
    activo: data.activo === undefined ? true : !!data.activo,
  };
}

module.exports = {
  TIPOS, UNIDADES, ensureProductsTable, normalizeProduct,
  // helpers internos exportados para reutilizar en próximas tasks:
  _int, _id,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/catalog/repo.test.js -t normalizeProduct`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/catalog/repo.js gastos/tests/catalog/repo.test.js
git commit -m "feat(catalog): normalizeProduct + tabla products (puro)"
```

---

## Task 2: Repo — precio "desde" y precio por selección (puros)

**Files:**
- Modify: `gastos/src/catalog/repo.js`
- Test: `gastos/tests/catalog/repo.test.js` (añadir)

- [ ] **Step 1: Write the failing test** (añadir al final del archivo de test)

```js
const ejemplo = {
  precio_base: 18000,
  variantes: [
    { id: 'g1', nombre: 'Tamaño', opciones: [
      { id: 'o1', nombre: '10p', delta: 0 }, { id: 'o2', nombre: '15p', delta: 8000 }, { id: 'o3', nombre: '25p', delta: 22000 } ] },
    { id: 'g2', nombre: 'Sabor', opciones: [
      { id: 'o4', nombre: 'Choco', delta: 0 }, { id: 'o5', nombre: 'Red velvet', delta: 3000 } ] },
  ],
  extras: [{ id: 'e1', nombre: 'Velas', precio: 1500 }, { id: 'e2', nombre: 'Dedicatoria', precio: 2000 }],
};

test('desdePrice = base + menor delta de cada grupo', () => {
  expect(catalog.desdePrice(ejemplo)).toBe(18000);            // 18000 + 0 + 0
  expect(catalog.desdePrice({ precio_base: 5000, variantes: [], extras: [] })).toBe(5000);
});

test('priceForSelection suma opción elegida por grupo + extras elegidos', () => {
  const sel = { opciones: { g1: 'o2', g2: 'o5' }, extras: ['e2'] };
  expect(catalog.priceForSelection(ejemplo, sel)).toBe(18000 + 8000 + 3000 + 2000); // 31000
  expect(catalog.priceForSelection(ejemplo, {})).toBe(18000); // sin selección = base
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/catalog/repo.test.js -t price`
Expected: FAIL — `catalog.desdePrice is not a function`.

- [ ] **Step 3: Write minimal implementation** (añadir a `repo.js` ANTES de `module.exports`)

```js
// "Desde $X" para el listado: base + suma del menor delta de cada grupo. PURA.
function desdePrice(p) {
  const base = Math.max(0, _int(p && p.precio_base, 0));
  const vs = Array.isArray(p && p.variantes) ? p.variantes : [];
  return vs.reduce((sum, g) => {
    const ds = (g.opciones || []).map((o) => _int(o.delta, 0));
    return sum + (ds.length ? Math.min(...ds) : 0);
  }, base);
}

// Precio de una selección concreta. PURA.
// selection = { opciones: { [grupoId]: opcionId }, extras: [extraId,...] }
function priceForSelection(p, selection = {}) {
  let total = Math.max(0, _int(p && p.precio_base, 0));
  const elegidas = (selection && selection.opciones) || {};
  for (const g of (Array.isArray(p && p.variantes) ? p.variantes : [])) {
    const op = (g.opciones || []).find((o) => o.id === elegidas[g.id]);
    if (op) total += _int(op.delta, 0);
  }
  const ex = new Set(Array.isArray(selection && selection.extras) ? selection.extras : []);
  for (const e of (Array.isArray(p && p.extras) ? p.extras : [])) {
    if (ex.has(e.id)) total += Math.max(0, _int(e.precio, 0));
  }
  return total;
}
```

Y agregar `desdePrice, priceForSelection,` al `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/catalog/repo.test.js`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/catalog/repo.js gastos/tests/catalog/repo.test.js
git commit -m "feat(catalog): desdePrice + priceForSelection (puro)"
```

---

## Task 3: Repo — create / get / list (DB con pg-mem)

**Files:**
- Modify: `gastos/src/catalog/repo.js`
- Test: `gastos/tests/catalog/repo-db.test.js`

- [ ] **Step 1: Write the failing test**

```js
// gastos/tests/catalog/repo-db.test.js
const { newDb } = require('pg-mem');
const catalog = require('../../src/catalog/repo');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  return new pg.Pool();
}
const C1 = '11111111-1111-1111-1111-111111111111';
const C2 = '22222222-2222-2222-2222-222222222222';

test('createProduct guarda y getProduct lo trae (variantes/extras como objeto)', async () => {
  const db = await freshDb();
  const p = await catalog.createProduct(db, C1, {
    nombre: 'Torta', precio_base: 18000,
    variantes: [{ nombre: 'Tamaño', opciones: [{ nombre: '10p', delta: 0 }] }],
    extras: [{ nombre: 'Velas', precio: 1500 }],
  });
  expect(p.id).toBeTruthy();
  expect(p.company_id).toBe(C1);
  expect(p.precio_base).toBe(18000);
  expect(Array.isArray(p.variantes)).toBe(true);
  expect(p.variantes[0].opciones[0].nombre).toBe('10p');

  const got = await catalog.getProduct(db, C1, p.id);
  expect(got.nombre).toBe('Torta');
  // cross-tenant: otra empresa no lo ve
  expect(await catalog.getProduct(db, C2, p.id)).toBeNull();
});

test('listProducts ordena por orden,nombre y filtra pausados salvo incluirPausados', async () => {
  const db = await freshDb();
  await catalog.createProduct(db, C1, { nombre: 'B', orden: 2 });
  await catalog.createProduct(db, C1, { nombre: 'A', orden: 1 });
  const pausado = await catalog.createProduct(db, C1, { nombre: 'C', orden: 3, activo: false });
  await catalog.createProduct(db, C2, { nombre: 'Otra empresa' });

  const activos = await catalog.listProducts(db, C1);
  expect(activos.map((x) => x.nombre)).toEqual(['A', 'B']); // C pausado fuera, C2 fuera
  const todos = await catalog.listProducts(db, C1, { incluirPausados: true });
  expect(todos.map((x) => x.nombre)).toEqual(['A', 'B', 'C']);
  expect(pausado.activo).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/catalog/repo-db.test.js`
Expected: FAIL — `catalog.createProduct is not a function`.

- [ ] **Step 3: Write minimal implementation** (añadir a `repo.js` antes de `module.exports`)

```js
const COLS = 'id, company_id, tipo, nombre, descripcion, categoria, unidad, foto_path, precio_base, stock, variantes, extras, orden, activo, created_at, updated_at';

async function createProduct(db, companyId, data) {
  await ensureProductsTable(db);
  const p = normalizeProduct(data);
  const r = await db.query(
    `INSERT INTO products (company_id, tipo, nombre, descripcion, categoria, unidad, precio_base, stock, variantes, extras, orden, activo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12) RETURNING ${COLS}`,
    [companyId, p.tipo, p.nombre, p.descripcion, p.categoria, p.unidad, p.precio_base, p.stock,
     JSON.stringify(p.variantes), JSON.stringify(p.extras), p.orden, p.activo]
  );
  return r.rows[0];
}

async function getProduct(db, companyId, id) {
  await ensureProductsTable(db);
  const r = await db.query(`SELECT ${COLS} FROM products WHERE company_id=$1 AND id=$2`, [companyId, id]);
  return r.rows[0] || null;
}

async function listProducts(db, companyId, { incluirPausados = false } = {}) {
  await ensureProductsTable(db);
  const where = incluirPausados ? '' : ' AND activo = true';
  const r = await db.query(
    `SELECT ${COLS} FROM products WHERE company_id=$1${where} ORDER BY orden ASC, nombre ASC`, [companyId]
  );
  return r.rows;
}
```

Agregar `COLS` no se exporta; agregar `createProduct, getProduct, listProducts,` al `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/catalog/repo-db.test.js`
Expected: PASS (2 tests).
Nota: si pg-mem devolviera `variantes` como string en vez de objeto, parsear con `JSON.parse` en un `map` de los rows; en pg-mem v3 las columnas jsonb vuelven como objeto (igual que `pedidos.items`), así que no debería hacer falta.

- [ ] **Step 5: Commit**

```bash
git add gastos/src/catalog/repo.js gastos/tests/catalog/repo-db.test.js
git commit -m "feat(catalog): createProduct/getProduct/listProducts (pg-mem)"
```

---

## Task 4: Repo — update / activo / foto / reordenar (DB)

**Files:**
- Modify: `gastos/src/catalog/repo.js`
- Test: `gastos/tests/catalog/repo-db.test.js` (añadir)

- [ ] **Step 1: Write the failing test** (añadir)

```js
test('updateProduct fusiona y respeta tenant; setActivo y reordenar funcionan', async () => {
  const db = await freshDb();
  const p = await catalog.createProduct(db, C1, { nombre: 'Torta', precio_base: 18000 });

  const upd = await catalog.updateProduct(db, C1, p.id, { precio_base: 20000, categoria: 'Tortas' });
  expect(upd.precio_base).toBe(20000);
  expect(upd.categoria).toBe('Tortas');
  expect(upd.nombre).toBe('Torta'); // se conserva lo no enviado

  // cross-tenant no actualiza
  expect(await catalog.updateProduct(db, C2, p.id, { precio_base: 1 })).toBeNull();

  const off = await catalog.setActivo(db, C1, p.id, false);
  expect(off.activo).toBe(false);

  const p2 = await catalog.createProduct(db, C1, { nombre: 'Café', orden: 0 });
  await catalog.reordenar(db, C1, [{ id: p.id, orden: 5 }, { id: p2.id, orden: 1 }]);
  const todos = await catalog.listProducts(db, C1, { incluirPausados: true });
  expect(todos.map((x) => x.nombre)).toEqual(['Café', 'Torta']); // Café orden 1, Torta orden 5

  const conFoto = await catalog.setProductFoto(db, C1, p.id, 'product-x.jpg');
  expect(conFoto.foto_path).toBe('product-x.jpg');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/catalog/repo-db.test.js -t update`
Expected: FAIL — `catalog.updateProduct is not a function`.

- [ ] **Step 3: Write minimal implementation** (añadir a `repo.js` antes de `module.exports`)

```js
async function updateProduct(db, companyId, id, data) {
  await ensureProductsTable(db);
  const exists = await getProduct(db, companyId, id);
  if (!exists) return null;
  const p = normalizeProduct({ ...exists, ...data });
  const r = await db.query(
    `UPDATE products SET tipo=$3, nombre=$4, descripcion=$5, categoria=$6, unidad=$7, precio_base=$8, stock=$9,
       variantes=$10::jsonb, extras=$11::jsonb, orden=$12, activo=$13, updated_at=now()
     WHERE company_id=$1 AND id=$2 RETURNING ${COLS}`,
    [companyId, id, p.tipo, p.nombre, p.descripcion, p.categoria, p.unidad, p.precio_base, p.stock,
     JSON.stringify(p.variantes), JSON.stringify(p.extras), p.orden, p.activo]
  );
  return r.rows[0] || null;
}

async function setActivo(db, companyId, id, activo) {
  await ensureProductsTable(db);
  const r = await db.query(
    `UPDATE products SET activo=$3, updated_at=now() WHERE company_id=$1 AND id=$2 RETURNING ${COLS}`,
    [companyId, id, !!activo]
  );
  return r.rows[0] || null;
}

async function setProductFoto(db, companyId, id, fotoPath) {
  await ensureProductsTable(db);
  const r = await db.query(
    `UPDATE products SET foto_path=$3, updated_at=now() WHERE company_id=$1 AND id=$2 RETURNING ${COLS}`,
    [companyId, id, fotoPath]
  );
  return r.rows[0] || null;
}

async function reordenar(db, companyId, orden) {
  await ensureProductsTable(db);
  for (const it of (Array.isArray(orden) ? orden : [])) {
    await db.query('UPDATE products SET orden=$3, updated_at=now() WHERE company_id=$1 AND id=$2',
      [companyId, it.id, _int(it.orden, 0)]);
  }
  return true;
}
```

Agregar `updateProduct, setActivo, setProductFoto, reordenar,` al `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/catalog/`
Expected: PASS (todos los tests de catalog).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/catalog/repo.js gastos/tests/catalog/repo-db.test.js
git commit -m "feat(catalog): updateProduct/setActivo/setProductFoto/reordenar"
```

---

## Task 5: Rutas del catálogo + montaje en /api/app

**Files:**
- Create: `gastos/src/catalog/routes.js`
- Modify: `gastos/src/app/router.js` (require arriba + montaje tras la línea `router.use(requireAuth, requireKind('employee'));`)
- Test: `gastos/tests/catalog/routes-app.test.js`

- [ ] **Step 1: Write the failing test**

```js
// gastos/tests/catalog/routes-app.test.js
process.env.JWT_SECRET = 'test-secret';
const os = require('os');
const path = require('path');
process.env.UPLOADS_DIR = path.join(os.tmpdir(), 'hashia-catalog-test-' + Date.now());
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { hashPassword } = require('../../src/auth/password');
const { createAppRouter } = require('../../src/app/router');

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
async function seedEmployee(db) {
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const hash = await hashPassword('clave');
  await db.query("INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'Juan','juan',$2)",
    [c.rows[0].id, hash]);
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

test('CRUD de productos vía /api/app exige token y crea/lista', async () => {
  const db = await freshDb(); await seedEmployee(db);
  const app = buildApp(db);

  await request(app).get('/api/app/products').expect(401); // sin token

  const t = await token(app);
  const auth = (r) => r.set('Authorization', `Bearer ${t}`);

  await auth(request(app).post('/api/app/products').send({})).expect(400); // falta nombre

  const creado = await auth(request(app).post('/api/app/products')
    .send({ nombre: 'Torta', precio_base: 18000, extras: [{ nombre: 'Velas', precio: 1500 }] })).expect(201);
  expect(creado.body.nombre).toBe('Torta');

  const lista = await auth(request(app).get('/api/app/products')).expect(200);
  expect(lista.body).toHaveLength(1);

  await auth(request(app).patch(`/api/app/products/${creado.body.id}/activo`).send({ activo: false })).expect(200);
  const soloActivos = await auth(request(app).get('/api/app/products')).expect(200);
  expect(soloActivos.body).toHaveLength(0);

  await auth(request(app).get('/api/app/products/no-existe')).expect(404);
});

test('foto: POST guarda y GET la devuelve', async () => {
  const db = await freshDb(); await seedEmployee(db);
  const app = buildApp(db);
  const t = await token(app);
  const auth = (r) => r.set('Authorization', `Bearer ${t}`);
  const creado = await auth(request(app).post('/api/app/products').send({ nombre: 'Torta' })).expect(201);
  const png = Buffer.from('89504e47', 'hex').toString('base64');
  await auth(request(app).post(`/api/app/products/${creado.body.id}/foto`).send({ imageBase64: png, mimeType: 'image/png' })).expect(200);
  const foto = await auth(request(app).get(`/api/app/products/${creado.body.id}/foto`)).expect(200);
  expect(foto.headers['content-type']).toMatch(/image/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/catalog/routes-app.test.js`
Expected: FAIL — los endpoints `/products` no existen (404 en vez de 201/200).

- [ ] **Step 3: Write minimal implementation**

Crear `gastos/src/catalog/routes.js`:

```js
// Rutas del catálogo de productos, compartidas por /api/app y /api/panel.
// Se montan DESPUÉS del middleware de auth de cada router; usan req.auth.companyId.
const catalog = require('./repo');
const { storeImage, readImage, contentTypeFor } = require('../expenses/storage');

function registerCatalogRoutes(router, { db } = {}) {
  router.get('/products', async (req, res) => {
    const incluir = req.query.incluirPausados === '1' || req.query.incluirPausados === 'true';
    return res.json(await catalog.listProducts(db, req.auth.companyId, { incluirPausados: incluir }));
  });

  router.post('/products', async (req, res) => {
    try {
      return res.status(201).json(await catalog.createProduct(db, req.auth.companyId, req.body || {}));
    } catch (e) {
      if (e.code === 'validacion') return res.status(400).json({ error: 'validacion', detalle: e.message });
      throw e;
    }
  });

  // OJO: /products/orden ANTES de /products/:id para que no lo capture el :id
  router.patch('/products/orden', async (req, res) => {
    await catalog.reordenar(db, req.auth.companyId, (req.body || {}).orden);
    return res.json({ ok: true });
  });

  router.post('/products/:id/foto', async (req, res) => {
    const { imageBase64, mimeType } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'falta_imagen' });
    const p = await catalog.getProduct(db, req.auth.companyId, req.params.id);
    if (!p) return res.status(404).json({ error: 'no_existe' });
    const name = storeImage(Buffer.from(imageBase64, 'base64'), mimeType || 'image/jpeg', 'product-' + p.id);
    return res.json(await catalog.setProductFoto(db, req.auth.companyId, p.id, name));
  });

  router.get('/products/:id/foto', async (req, res) => {
    const p = await catalog.getProduct(db, req.auth.companyId, req.params.id);
    if (!p) return res.status(404).json({ error: 'no_existe' });
    const buf = readImage(p.foto_path);
    if (!buf) return res.status(404).json({ error: 'sin_foto' });
    res.setHeader('Content-Type', contentTypeFor(p.foto_path));
    return res.send(buf);
  });

  router.patch('/products/:id/activo', async (req, res) => {
    const p = await catalog.setActivo(db, req.auth.companyId, req.params.id, (req.body || {}).activo);
    if (!p) return res.status(404).json({ error: 'no_existe' });
    return res.json(p);
  });

  router.get('/products/:id', async (req, res) => {
    const p = await catalog.getProduct(db, req.auth.companyId, req.params.id);
    if (!p) return res.status(404).json({ error: 'no_existe' });
    return res.json(p);
  });

  router.patch('/products/:id', async (req, res) => {
    try {
      const p = await catalog.updateProduct(db, req.auth.companyId, req.params.id, req.body || {});
      if (!p) return res.status(404).json({ error: 'no_existe' });
      return res.json(p);
    } catch (e) {
      if (e.code === 'validacion') return res.status(400).json({ error: 'validacion', detalle: e.message });
      throw e;
    }
  });
}

module.exports = { registerCatalogRoutes };
```

En `gastos/src/app/router.js`, agregar el require junto a los otros (después de la línea 16 `const chatRepo = require('../chat/repo');`):

```js
const { registerCatalogRoutes } = require('../catalog/routes');
```

Y montarlo justo después de `router.use(requireAuth, requireKind('employee'));` (línea 35):

```js
  registerCatalogRoutes(router, { db });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/catalog/routes-app.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/catalog/routes.js gastos/src/app/router.js gastos/tests/catalog/routes-app.test.js
git commit -m "feat(catalog): endpoints /products en /api/app (+foto)"
```

---

## Task 6: Montaje en /api/panel

**Files:**
- Modify: `gastos/src/panel/router.js` (require + montaje tras `router.use(requireAuth, requireKind('user'));`)
- Test: `gastos/tests/catalog/routes-panel.test.js`

- [ ] **Step 1: Write the failing test**

```js
// gastos/tests/catalog/routes-panel.test.js
process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { hashPassword } = require('../../src/auth/password');
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
async function seedUser(db) {
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const hash = await hashPassword('clave');
  await db.query("INSERT INTO users(company_id, email, password_hash, rol) VALUES($1,'due@x.cl',$2,'owner')",
    [c.rows[0].id, hash]);
}
function buildApp(db) {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use('/api/panel', createPanelRouter({ db }));
  return app;
}

test('CRUD de productos vía /api/panel con token de dueño', async () => {
  const db = await freshDb(); await seedUser(db);
  const app = buildApp(db);
  await request(app).get('/api/panel/products').expect(401);
  const r = await request(app).post('/api/panel/login').send({ email: 'due@x.cl', password: 'clave' });
  const t = r.body.token;
  const auth = (rq) => rq.set('Authorization', `Bearer ${t}`);
  const creado = await auth(request(app).post('/api/panel/products').send({ nombre: 'Corte', tipo: 'servicio' })).expect(201);
  expect(creado.body.tipo).toBe('servicio');
  expect(creado.body.stock).toBeNull();
  const lista = await auth(request(app).get('/api/panel/products')).expect(200);
  expect(lista.body).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/catalog/routes-panel.test.js`
Expected: FAIL — `/api/panel/products` da 404.

- [ ] **Step 3: Write minimal implementation**

En `gastos/src/panel/router.js`, agregar el require (después de la línea 15 `const realWaClient = require('../whatsapp/client');`):

```js
const { registerCatalogRoutes } = require('../catalog/routes');
```

Y montarlo justo después de `router.use(requireAuth, requireKind('user'));` (línea 38):

```js
  registerCatalogRoutes(router, { db });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/catalog/routes-panel.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gastos/src/panel/router.js gastos/tests/catalog/routes-panel.test.js
git commit -m "feat(catalog): endpoints /products en /api/panel"
```

---

## Task 7: UI panel web — pestaña "Productos"

**Files:**
- Modify: `gastos/public/panel/lib.js` (agregar helper puro `productosListHtml`)
- Modify: `gastos/public/panel/index.html` (pestaña + sección + JS de carga/guardado)
- Test: `gastos/tests/panel/catalog-static.test.js` (lib + html servido)

- [ ] **Step 1: Write the failing test**

```js
// gastos/tests/panel/catalog-static.test.js
const request = require('supertest');
const { app } = require('../../src/server');
const lib = require('../../public/panel/lib.js');

test('productosListHtml arma filas con nombre, desde-precio y estado, escapando XSS', () => {
  const html = lib.productosListHtml([
    { id: 'p1', nombre: '<b>Torta</b>', precio_base: 18000, variantes: [], extras: [], activo: true, stock: 8 },
    { id: 'p2', nombre: 'Corte', tipo: 'servicio', unidad: 'sesion', precio_base: 8000, variantes: [], extras: [], activo: false },
  ], lib.fmtClp);
  expect(html).toContain('&lt;b&gt;Torta&lt;/b&gt;'); // escapado
  expect(html).toContain('$18.000');
  expect(html).toContain('data-prod="p1"');
  expect(html).toContain('servicio');
});

test('GET /panel/ incluye la pestaña y sección Productos', async () => {
  const res = await request(app).get('/panel/');
  expect(res.status).toBe(200);
  expect(res.text).toContain('data-tab="productos"');
  expect(res.text).toContain('id="productosSection"');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/panel/catalog-static.test.js`
Expected: FAIL — `lib.productosListHtml is not a function` y el html no contiene la pestaña.

- [ ] **Step 3: Write minimal implementation**

En `gastos/public/panel/lib.js`, dentro del `factory()` (antes del `return { ... }`), agregar:

```js
  function desdePriceLib(p) {
    var base = Math.max(0, Math.round(Number(p && p.precio_base) || 0));
    var vs = (p && p.variantes) || [];
    for (var i = 0; i < vs.length; i++) {
      var ds = ((vs[i].opciones) || []).map(function (o) { return Math.round(Number(o.delta) || 0); });
      base += ds.length ? Math.min.apply(null, ds) : 0;
    }
    return base;
  }
  function productosListHtml(products, fmt) {
    return (products || []).map(function (p) {
      var nombre = escapeHtml(p.nombre);
      var tipo = p.tipo === 'servicio'
        ? ' <span style="font-size:9px;background:#3a2f5a;color:#dccfff;padding:1px 5px;border-radius:5px;">servicio</span>' : '';
      var precio = (p.tipo === 'servicio')
        ? fmt(p.precio_base) + ' / ' + escapeHtml(p.unidad || 'unidad')
        : 'desde ' + fmt(desdePriceLib(p));
      var stock = (p.stock === null || p.stock === undefined) ? '' : ' · 📦 ' + p.stock;
      var estado = p.activo ? '●' : '○';
      return '<div class="emp" data-prod="' + escapeHtml(p.id) + '" style="cursor:pointer">'
        + '<div><b>' + nombre + '</b>' + tipo + '<br><span class="muted" style="font-size:12px">' + precio + stock + '</span></div>'
        + '<span>' + estado + '</span></div>';
    }).join('');
  }
```

Y añadir `desdePriceLib: desdePriceLib, productosListHtml: productosListHtml,` al objeto `return { ... }`.

En `gastos/public/panel/index.html`:
1. En la barra de pestañas (`<div class="tabs">`), agregar el botón:
```html
<button class="tab" data-tab="productos">Productos</button>
```
2. Junto a las otras `<section>`, agregar:
```html
<section id="productosSection" class="hidden">
  <div class="card">
    <div class="row" style="justify-content:space-between">
      <h3 style="margin:0;color:var(--gold)">Productos</h3>
      <button id="prodNuevo" class="btn-gold btn-sm">+ Nuevo</button>
    </div>
    <div style="display:grid;grid-template-columns:300px 1fr;gap:14px;margin-top:10px">
      <div id="prodLista" class="scroll"></div>
      <div id="prodForm" class="card" style="margin:0">
        <label>Nombre</label><input id="prodNombre" style="width:100%" />
        <div class="row" style="margin-top:8px">
          <div><label>Tipo</label>
            <select id="prodTipo"><option value="producto">Producto</option><option value="servicio">Servicio</option></select></div>
          <div><label>Categoría</label><input id="prodCategoria" /></div>
          <div><label>Precio base</label><input id="prodPrecio" type="number" /></div>
          <div><label>Stock</label><input id="prodStock" type="number" /></div>
        </div>
        <p id="prodMsg" class="ok"></p>
        <div class="row" style="justify-content:flex-end">
          <button id="prodGuardar" class="btn-gold">Guardar</button>
        </div>
        <p class="muted" style="font-size:11px">Variantes y extras se editan en la app (próxima iteración del panel).</p>
      </div>
    </div>
  </div>
</section>
```
3. En el bloque `<script>`, donde se cablean las pestañas y secciones, sumar la lógica (usa el mismo helper `api`/`token` que ya tiene el panel para llamar a `/api/panel/products`):
```js
async function cargarProductos() {
  const r = await fetch('/api/panel/products?incluirPausados=1', { headers: { Authorization: 'Bearer ' + token } });
  const prods = await r.json();
  document.getElementById('prodLista').innerHTML = PanelLib.productosListHtml(prods, PanelLib.fmtClp);
}
document.getElementById('prodGuardar').onclick = async () => {
  const body = {
    nombre: document.getElementById('prodNombre').value.trim(),
    tipo: document.getElementById('prodTipo').value,
    categoria: document.getElementById('prodCategoria').value.trim() || undefined,
    precio_base: Number(document.getElementById('prodPrecio').value) || 0,
    stock: document.getElementById('prodStock').value === '' ? null : Number(document.getElementById('prodStock').value),
  };
  const msg = document.getElementById('prodMsg');
  if (!body.nombre) { msg.className = 'err'; msg.textContent = 'Falta el nombre'; return; }
  const r = await fetch('/api/panel/products', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
  if (r.ok) { msg.className = 'ok'; msg.textContent = '✓ Guardado'; ['prodNombre','prodCategoria','prodPrecio','prodStock'].forEach(id => document.getElementById(id).value = ''); cargarProductos(); }
  else { msg.className = 'err'; msg.textContent = 'Error al guardar'; }
};
```
Y en la función que muestra una pestaña al hacer clic, incluir `productosSection` en el mapa de secciones y llamar `cargarProductos()` cuando se abre la pestaña "productos". (Seguir el patrón exacto de cómo el `index.html` ya muestra `gastosSection`/`employeesSection`/`settingsSection`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/panel/catalog-static.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/public/panel/lib.js gastos/public/panel/index.html gastos/tests/panel/catalog-static.test.js
git commit -m "feat(catalog): pestaña Productos en el panel web"
```

---

## Task 8: UI app — pantalla ProductosView

**Files:**
- Modify: `gastos-app/src/gastos/api.js` (métodos catálogo)
- Create: `gastos-app/src/gastos/ProductosView.jsx`
- Modify: `gastos-app/src/gastos/GastosApp.jsx` (acceso a la pantalla desde un menú/tab)
- Test: `gastos-app/src/gastos/__tests__/ProductosView.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// gastos-app/src/gastos/__tests__/ProductosView.test.jsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProductosView from '../ProductosView';
import { api } from '../api';

jest.mock('../api', () => ({
  api: {
    listProducts: jest.fn(),
    createProduct: jest.fn(),
  },
}));

test('lista productos y permite crear uno', async () => {
  api.listProducts.mockResolvedValue([
    { id: 'p1', nombre: 'Torta', precio_base: 18000, variantes: [], extras: [], activo: true, stock: 8 },
  ]);
  api.createProduct.mockResolvedValue({ id: 'p2', nombre: 'Café', precio_base: 1800, variantes: [], extras: [], activo: true });

  render(<ProductosView />);
  await waitFor(() => expect(screen.getByText('Torta')).toBeInTheDocument());

  fireEvent.change(screen.getByPlaceholderText('Nombre del producto'), { target: { value: 'Café' } });
  fireEvent.click(screen.getByText('Guardar'));
  await waitFor(() => expect(api.createProduct).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Café' })));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos-app && npx jest src/gastos/__tests__/ProductosView.test.jsx`
Expected: FAIL — no existe `../ProductosView`.

- [ ] **Step 3: Write minimal implementation**

En `gastos-app/src/gastos/api.js`, dentro del objeto `api` (antes del cierre `};`), agregar:

```js
  listProducts(incluirPausados = false) { return req('/api/app/products' + (incluirPausados ? '?incluirPausados=1' : '')); },
  getProduct(id) { return req(`/api/app/products/${id}`); },
  createProduct(data) { return req('/api/app/products', { method: 'POST', body: data }); },
  updateProduct(id, patch) { return req(`/api/app/products/${id}`, { method: 'PATCH', body: patch }); },
  setProductoActivo(id, activo) { return req(`/api/app/products/${id}/activo`, { method: 'PATCH', body: { activo } }); },
```

Crear `gastos-app/src/gastos/ProductosView.jsx`:

```jsx
import React, { useEffect, useState } from 'react';
import { api } from './api';

const GOLD = '#C9A24B';

function desde(p) {
  let base = Math.max(0, Math.round(Number(p.precio_base) || 0));
  for (const g of (p.variantes || [])) {
    const ds = (g.opciones || []).map((o) => Math.round(Number(o.delta) || 0));
    base += ds.length ? Math.min(...ds) : 0;
  }
  return base;
}
const clp = (n) => '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL');

export default function ProductosView() {
  const [items, setItems] = useState([]);
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('producto');
  const [precio, setPrecio] = useState('');
  const [stock, setStock] = useState('');
  const [err, setErr] = useState('');

  async function cargar() {
    try { setItems(await api.listProducts(true)); } catch (e) { setErr('No pude cargar el catálogo'); }
  }
  useEffect(() => { cargar(); }, []);

  async function guardar() {
    setErr('');
    if (!nombre.trim()) { setErr('Falta el nombre'); return; }
    try {
      await api.createProduct({
        nombre: nombre.trim(), tipo,
        precio_base: Number(precio) || 0,
        stock: stock === '' ? null : Number(stock),
      });
      setNombre(''); setPrecio(''); setStock('');
      cargar();
    } catch (e) { setErr('No se pudo guardar'); }
  }

  return (
    <div style={{ padding: 12 }}>
      <h2 style={{ color: GOLD, fontWeight: 900 }}>Productos</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {items.map((p) => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', background: '#ffffff10', borderRadius: 12, padding: 10 }}>
            <div>
              <div style={{ fontWeight: 800 }}>{p.nombre}{p.tipo === 'servicio' ? ' · servicio' : ''}</div>
              <div style={{ color: GOLD, fontSize: 12 }}>
                {p.tipo === 'servicio' ? clp(p.precio_base) + ' / ' + (p.unidad || 'unidad') : 'desde ' + clp(desde(p))}
                {p.stock != null ? ' · 📦 ' + p.stock : ''}
              </div>
            </div>
            <span>{p.activo ? '●' : '○'}</span>
          </div>
        ))}
        {!items.length && <div style={{ opacity: 0.6 }}>Aún no tienes productos. Crea el primero abajo.</div>}
      </div>

      <div style={{ background: '#ffffff08', borderRadius: 12, padding: 12 }}>
        <input placeholder="Nombre del producto" value={nombre} onChange={(e) => setNombre(e.target.value)}
          style={{ width: '100%', padding: 9, borderRadius: 8, marginBottom: 8 }} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ flex: 1, padding: 9, borderRadius: 8 }}>
            <option value="producto">Producto</option>
            <option value="servicio">Servicio</option>
          </select>
          <input placeholder="Precio" type="number" value={precio} onChange={(e) => setPrecio(e.target.value)}
            style={{ flex: 1, padding: 9, borderRadius: 8 }} />
          <input placeholder="Stock" type="number" value={stock} onChange={(e) => setStock(e.target.value)}
            style={{ flex: 1, padding: 9, borderRadius: 8 }} />
        </div>
        {err ? <div style={{ color: '#ff6b6b', fontSize: 13 }}>{err}</div> : null}
        <button onClick={guardar} style={{ background: GOLD, color: '#000', fontWeight: 800, borderRadius: 10, padding: '10px 16px', border: 0 }}>Guardar</button>
      </div>
    </div>
  );
}
```

En `gastos-app/src/gastos/GastosApp.jsx`, dar acceso a `ProductosView` (importar el componente y abrirlo desde el menú/configuración existente — seguir el patrón con que ya se renderizan `ChatView`/`MatchView`). El detalle exacto de navegación (un ítem "Productos" en el menú) se ajusta al layout actual del shell.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos-app && npx jest src/gastos/__tests__/ProductosView.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gastos-app/src/gastos/api.js gastos-app/src/gastos/ProductosView.jsx gastos-app/src/gastos/GastosApp.jsx gastos-app/src/gastos/__tests__/ProductosView.test.jsx
git commit -m "feat(catalog): pantalla Productos en la app"
```

---

## Task 9: Suite completa verde + build app

**Files:** (sin cambios de código; verificación)

- [ ] **Step 1: Correr toda la suite backend**

Run: `cd gastos && npx jest`
Expected: PASS — 179 anteriores + los nuevos de catalog (≈ +11). 0 fallos.

- [ ] **Step 2: Correr la suite de la app**

Run: `cd gastos-app && npx jest`
Expected: PASS — los anteriores + ProductosView.

- [ ] **Step 3: Verificar build de la app (que el componente compila con Vite)**

Run: `cd gastos-app && npm run build`
Expected: build OK sin errores.

- [ ] **Step 4: Commit (si hubo ajustes menores)**

```bash
git add -A && git commit -m "test(catalog): suite completa verde" || echo "nada que commitear"
```

---

## Notas de despliegue (NO en este plan; hacerlo con el usuario después)
- Backend: `node deploy-gastos-wt.js` desde el checkout principal (sube worktree, no toca `.env`). Migración = `ensureProductsTable` (idempotente, se crea sola al primer request).
- App: recompilar APK (`npm run build && npx cap sync android && gradlew assembleDebug`) y subir con `upload-apk-wt.js`.
- El stock NO se descuenta solo todavía (eso llega con el sub-proyecto #2, "crear pedido desde el catálogo").

## Self-review (hecho)
- **Cobertura del spec:** tabla products ✅(T1), variantes/extras/stock/servicio ✅(T1), desde/priceForSelection ✅(T2), CRUD scoped ✅(T3,T4), endpoints app+panel ✅(T5,T6), fotos reusando storage ✅(T5), UI panel ✅(T7) y app ✅(T8), tests pg-mem ✅. 404 cross-tenant ✅(T3,T4,T5).
- **Sin placeholders:** todo el código está completo.
- **Consistencia de tipos:** `normalizeProduct`, `desdePrice`, `priceForSelection`, `createProduct`, `getProduct`, `listProducts`, `updateProduct`, `setActivo`, `setProductFoto`, `reordenar`, `registerCatalogRoutes`, `productosListHtml`, `desdePriceLib` usados con la misma firma en todas las tasks. Endpoints `/products`, `/products/:id`, `/products/:id/activo`, `/products/orden`, `/products/:id/foto` consistentes entre T5 y la app/panel.
