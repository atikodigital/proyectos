# Catálogo desde foto (Hash IA · Chat #5a) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **WORKTREE GUARD (cada subagente):** trabaja SOLO en `C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112`. Toda ruta debe contener `.claude\worktrees\dazzling-driscoll-78a112`. Antes de commitear: `git rev-parse --show-toplevel && git branch --show-current` → toplevel termina en `dazzling-driscoll-78a112`, branch `claude/dazzling-driscoll-78a112`. `gastos/` y `gastos-app/` también existen en `main` — NO tocar. Hay trabajo paralelo "varas" → `git add <archivos específicos>`, nunca `git add -A`. READ los archivos actuales antes de editar (el paralelo cambió app/router.js, api.js).

**Goal:** Poblar el catálogo fotografiando un menú/lista: visión Gemini extrae productos → preview editable → crear en bulk.

**Architecture:** `catalog/extraer.js` llama a Gemini visión (igual patrón que `ocr/gemini.js`, http inyectable) y devuelve `{productos:[{nombre,precio}]}`. `crearProductosBulk` crea N con `createProduct`. Endpoints `/catalog/extraer` (no crea) y `/products/bulk` (crea). La app `ProductosView` agrega botón "Desde foto" → captura → preview editable → bulk.

**Tech Stack:** Node/Express, axios, Gemini visión OpenAI-compat, jest + pg-mem; Capacitor/React, jest + RTL. TDD. Spec: `docs/superpowers/specs/2026-06-16-catalogo-desde-foto-design.md`.

---

## Task 1: extraer.js (Gemini visión → productos)

**Files:**
- Create: `gastos/src/catalog/extraer.js`
- Test: `gastos/tests/catalog/extraer.test.js`

- [ ] **Step 1: Write the failing test** — create `gastos/tests/catalog/extraer.test.js`:

```js
const { extraerProductos, normalizeProductos } = require('../../src/catalog/extraer');

test('normalizeProductos: precios enteros ≥0, descarta sin nombre, cap', () => {
  const r = normalizeProductos({ productos: [
    { nombre: '  Torta  ', precio: '18000' }, { nombre: '', precio: 5 }, { nombre: 'Café', precio: -10 },
  ] });
  expect(r).toEqual([{ nombre: 'Torta', precio: 18000 }, { nombre: 'Café', precio: 0 }]);
});

test('extraerProductos usa el http inyectado y parsea (con fences)', async () => {
  const http = { post: async () => ({ data: { choices: [{ message: { content: '```json\n{"productos":[{"nombre":"Torta","precio":18000},{"nombre":"Empanada","precio":1500}]}\n```' } }] } }) };
  const r = await extraerProductos('BASE64', 'image/jpeg', { http });
  expect(r).toEqual({ productos: [{ nombre: 'Torta', precio: 18000 }, { nombre: 'Empanada', precio: 1500 }] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos" && npx jest tests/catalog/extraer.test.js`
Expected: FAIL — `Cannot find module '../../src/catalog/extraer'`.

- [ ] **Step 3: Write minimal implementation** — create `gastos/src/catalog/extraer.js`:

```js
// Extrae productos {nombre, precio} de una foto de menú/lista con Gemini visión (OpenAI-compat).
const axios = require('axios');

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

function normalizeProductos(data) {
  const arr = Array.isArray(data && data.productos) ? data.productos : [];
  return arr.slice(0, 100).map((p) => ({
    nombre: String((p && p.nombre) || '').trim().slice(0, 120),
    precio: Math.max(0, Math.round(Number(p && p.precio) || 0)),
  })).filter((p) => p.nombre);
}

function buildPrompt() {
  return [
    'Eres un asistente que lee un MENÚ o LISTA DE PRECIOS de un negocio chileno.',
    'Extrae los productos con su precio en pesos CLP.',
    'Devuelve SOLO un JSON con esta forma exacta: { "productos": [{ "nombre": "<texto>", "precio": <entero CLP> }] }.',
    'Ignora títulos de sección, teléfonos, direcciones y todo lo que no sea un producto con precio.',
    'Si un precio no se ve, usa 0. No inventes productos.',
  ].join(' ');
}

async function extraerProductos(imageBase64, mimeType = 'image/jpeg', opts = {}) {
  const http = opts.http || axios;
  const model = process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash';
  const key = process.env.GEMINI_API_KEY;
  const body = {
    model,
    messages: [{ role: 'user', content: [
      { type: 'text', text: buildPrompt() },
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
    ] }],
    temperature: 0.1,
  };
  const res = await http.post(BASE, body, { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 30000 });
  const content = (res && res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message && res.data.choices[0].message.content) || '';
  return { productos: normalizeProductos(parseJsonLoose(content)) };
}

module.exports = { extraerProductos, normalizeProductos, parseJsonLoose };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos" && npx jest tests/catalog/extraer.test.js`
Expected: PASS (2).

- [ ] **Step 5: GUARD then commit**

```bash
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112" && git rev-parse --show-toplevel && git branch --show-current && git add gastos/src/catalog/extraer.js gastos/tests/catalog/extraer.test.js && git commit -m "feat(catalog): extraerProductos (Gemini visión → menú a productos)"
```

---

## Task 2: crearProductosBulk en catalog/repo.js

**Files:**
- Modify: `gastos/src/catalog/repo.js`
- Test: `gastos/tests/catalog/repo-db.test.js` (añadir)

- [ ] **Step 1: Write the failing test** — APPEND a `gastos/tests/catalog/repo-db.test.js` (ya tiene `freshDb`, `C1`, `catalog`):

```js
test('crearProductosBulk crea N productos scoped; ignora sin nombre', async () => {
  const db = await freshDb();
  const r = await catalog.crearProductosBulk(db, C1, [
    { nombre: 'Torta', precio: 18000 }, { nombre: '', precio: 5 }, { nombre: 'Café', precio: 1800 },
  ]);
  expect(r.creados).toBe(2);
  const lista = await catalog.listProducts(db, C1, { incluirPausados: true });
  expect(lista.map((p) => p.nombre).sort()).toEqual(['Café', 'Torta']);
  expect(lista.find((p) => p.nombre === 'Torta').precio_base).toBe(18000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos" && npx jest tests/catalog/repo-db.test.js -t crearProductosBulk`
Expected: FAIL — `catalog.crearProductosBulk is not a function`.

- [ ] **Step 3: Write minimal implementation** — en `gastos/src/catalog/repo.js`, agregar antes de `module.exports` (usa el `createProduct` existente):

```js
async function crearProductosBulk(db, companyId, productos) {
  const lista = (Array.isArray(productos) ? productos : []).slice(0, 100);
  const creados = [];
  for (const p of lista) {
    const nombre = String((p && p.nombre) || '').trim();
    if (!nombre) continue;
    creados.push(await createProduct(db, companyId, { nombre, precio_base: Math.max(0, Math.round(Number(p.precio) || 0)), tipo: 'producto' }));
  }
  return { creados: creados.length, productos: creados };
}
```
Agregar `crearProductosBulk,` al `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos" && npx jest tests/catalog/`
Expected: PASS.

- [ ] **Step 5: GUARD then commit**

```bash
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112" && git rev-parse --show-toplevel && git branch --show-current && git add gastos/src/catalog/repo.js gastos/tests/catalog/repo-db.test.js && git commit -m "feat(catalog): crearProductosBulk"
```

---

## Task 3: Endpoints /catalog/extraer + /products/bulk

**Files:**
- Modify: `gastos/src/app/router.js`
- Test: `gastos/tests/catalog/foto-routes.test.js`

- [ ] **Step 1: Write the failing test** — create `gastos/tests/catalog/foto-routes.test.js`:

```js
process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { hashPassword } = require('../../src/auth/password');
const { createAppRouter } = require('../../src/app/router');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}
async function seed(db) {
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const hash = await hashPassword('clave');
  await db.query("INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'J','juan',$2)", [c.rows[0].id, hash]);
}
function buildApp(db, deps) {
  const app = express(); app.use(express.json({ limit: '15mb' }));
  app.use('/api/app', createAppRouter({ db, ...deps }));
  return app;
}
async function token(app) { return (await request(app).post('/api/app/login').send({ usuario: 'juan', password: 'clave' })).body.token; }

test('/catalog/extraer usa el extractor inyectado (no crea) + /products/bulk crea', async () => {
  const db = await freshDb(); await seed(db);
  const extraerProductos = jest.fn(async () => ({ productos: [{ nombre: 'A', precio: 1000 }, { nombre: 'B', precio: 2000 }] }));
  const app = buildApp(db, { extraerProductos });
  const t = await token(app); const auth = (r) => r.set('Authorization', `Bearer ${t}`);

  await auth(request(app).post('/api/app/catalog/extraer').send({})).expect(400);
  const ex = await auth(request(app).post('/api/app/catalog/extraer').send({ imageBase64: 'xx' })).expect(200);
  expect(ex.body.productos).toHaveLength(2);
  expect(extraerProductos).toHaveBeenCalled();
  // extraer NO crea: la lista sigue vacía
  expect((await auth(request(app).get('/api/app/products')).expect(200)).body).toHaveLength(0);

  await auth(request(app).post('/api/app/products/bulk').send({ productos: [] })).expect(400);
  const bulk = await auth(request(app).post('/api/app/products/bulk').send({ productos: [{ nombre: 'A', precio: 1000 }] })).expect(201);
  expect(bulk.body.creados).toBe(1);
  expect((await auth(request(app).get('/api/app/products')).expect(200)).body).toHaveLength(1);
});

test('catalog/extraer y products/bulk exigen token', async () => {
  const db = await freshDb(); await seed(db);
  const app = buildApp(db, {});
  await request(app).post('/api/app/catalog/extraer').send({ imageBase64: 'x' }).expect(401);
  await request(app).post('/api/app/products/bulk').send({ productos: [{ nombre: 'A' }] }).expect(401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos" && npx jest tests/catalog/foto-routes.test.js`
Expected: FAIL — rutas 404.

- [ ] **Step 3: Write minimal implementation** — READ `gastos/src/app/router.js` (el paralelo lo cambió). Apply:

(a) Require near the others (after `const { registerCatalogRoutes } = require('../catalog/routes');`):
```js
const { extraerProductos: realExtraerProductos } = require('../catalog/extraer');
```
(b) En la firma `function createAppRouter({ db, extractExpense, createLiveToken, sendText, extractCartola } = {}) {`, agregar `extraerProductos`:
```js
function createAppRouter({ db, extractExpense, createLiveToken, sendText, extractCartola, extraerProductos } = {}) {
```
y junto a los otros defaults (después de `const _sendText = ...`):
```js
  const _extraerProductos = extraerProductos || realExtraerProductos;
```
(c) Después de `registerCatalogRoutes(router, { db });`, agregar las dos rutas:
```js
  router.post('/catalog/extraer', async (req, res) => {
    const { imageBase64, mimeType } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'falta_imagen' });
    try {
      const r = await _extraerProductos(imageBase64, mimeType || 'image/jpeg');
      return res.json({ productos: (r && r.productos) || [] });
    } catch (e) { console.error('[catalog extraer]', e.message); return res.status(502).json({ error: 'ocr_falla' }); }
  });
  router.post('/products/bulk', async (req, res) => {
    const productos = (req.body && Array.isArray(req.body.productos)) ? req.body.productos : [];
    if (!productos.length) return res.status(400).json({ error: 'sin_productos' });
    return res.status(201).json(await catalogRepo.crearProductosBulk(db, req.auth.companyId, productos));
  });
```
(`catalogRepo` ya está requerido en router.js.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos" && npx jest tests/catalog/foto-routes.test.js` then `npx jest`
Expected: PASS — todo verde.

- [ ] **Step 5: GUARD then commit**

```bash
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112" && git rev-parse --show-toplevel && git branch --show-current && git add gastos/src/app/router.js gastos/tests/catalog/foto-routes.test.js && git commit -m "feat(catalog): endpoints /catalog/extraer (no crea) + /products/bulk"
```

---

## Task 4: App — ProductosView "Desde foto" + preview

**Files:**
- Modify: `gastos-app/src/gastos/api.js`, `gastos-app/src/gastos/ProductosView.jsx`
- Test: `gastos-app/tests/gastos/ProductosView.test.jsx` (añadir)

- [ ] **Step 1: Write the failing test** — en `gastos-app/tests/gastos/ProductosView.test.jsx`. READ el archivo. (1) Mockear `EvidenceIntake` para poder disparar la captura: al inicio del archivo (antes de importar ProductosView), agregar:
```js
jest.mock('../../src/components/EvidenceIntake.jsx', () => ({
  __esModule: true,
  default: ({ onChange }) => <button onClick={() => onChange([{ imageBase64: 'IMG', imageMimeType: 'image/jpeg' }])}>fake-capture</button>,
}));
```
(2) Agregar `catalogExtraer: jest.fn()` y `crearProductosBulk: jest.fn()` al objeto del mock de api. (3) APPEND:
```js
test('Desde foto → preview → Crear llama crearProductosBulk con los marcados', async () => {
  api.listProducts.mockResolvedValue([]);
  api.catalogExtraer.mockResolvedValue({ productos: [{ nombre: 'Torta', precio: 18000 }, { nombre: 'Café', precio: 1800 }] });
  api.crearProductosBulk.mockResolvedValue({ creados: 2 });

  render(<ProductosView />);
  fireEvent.click(screen.getByText('📷 Desde foto'));
  fireEvent.click(await screen.findByText('fake-capture'));       // dispara onChange con la imagen
  await waitFor(() => expect(api.catalogExtraer).toHaveBeenCalledWith('IMG', 'image/jpeg'));
  await waitFor(() => expect(screen.getByDisplayValue('Torta')).toBeInTheDocument());

  fireEvent.click(screen.getByText(/Crear 2 productos/i));
  await waitFor(() => expect(api.crearProductosBulk).toHaveBeenCalled());
  const arg = api.crearProductosBulk.mock.calls[0][0];
  expect(arg).toEqual([{ nombre: 'Torta', precio: 18000 }, { nombre: 'Café', precio: 1800 }]);
});
```
(Si el archivo importa React/render/screen/fireEvent/waitFor ya, reúsalos; si falta `waitFor`, agrégalo al import de `@testing-library/react`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos-app" && npx jest tests/gastos/ProductosView.test.jsx`
Expected: FAIL — no existe el botón "📷 Desde foto" / el preview.

- [ ] **Step 3: Write minimal implementation**

(a) `gastos-app/src/gastos/api.js` — READ first. Agregar dentro del objeto `api`:
```js
  catalogExtraer(imageBase64, mimeType = 'image/jpeg') { return req('/api/app/catalog/extraer', { method: 'POST', body: { imageBase64, mimeType } }); },
  crearProductosBulk(productos) { return req('/api/app/products/bulk', { method: 'POST', body: { productos } }); },
```

(b) `gastos-app/src/gastos/ProductosView.jsx` — REEMPLAZAR el contenido completo por (mantiene lo actual + foto/preview):
```jsx
import React, { useEffect, useState } from 'react';
import { api } from './api';
import EvidenceIntake from '../components/EvidenceIntake.jsx';

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
  const [captura, setCaptura] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  async function cargar() {
    try { setItems(await api.listProducts(true)); } catch (e) { setErr('No pude cargar el catálogo'); }
  }
  useEffect(() => { cargar(); }, []);

  async function guardar() {
    setErr('');
    if (!nombre.trim()) { setErr('Falta el nombre'); return; }
    try {
      await api.createProduct({ nombre: nombre.trim(), tipo, precio_base: Number(precio) || 0, stock: stock === '' ? null : Number(stock) });
      setNombre(''); setPrecio(''); setStock('');
      cargar();
    } catch (e) { setErr('No se pudo guardar'); }
  }

  async function onFoto(evs) {
    const ev = (evs || [])[0];
    if (!ev || !ev.imageBase64) return;
    setCaptura(false); setBusy(true); setErr('');
    try {
      const r = await api.catalogExtraer(ev.imageBase64, ev.imageMimeType || 'image/jpeg');
      setPreview(((r && r.productos) || []).map((p) => ({ nombre: p.nombre, precio: p.precio, incluir: true })));
    } catch (e) { setErr('No pude leer la foto, intenta de nuevo.'); }
    finally { setBusy(false); }
  }

  async function crearPreview() {
    const sel = preview.filter((p) => p.incluir).map((p) => ({ nombre: p.nombre, precio: Number(p.precio) || 0 }));
    if (!sel.length) return;
    setBusy(true);
    try { await api.crearProductosBulk(sel); setPreview(null); cargar(); }
    catch (e) { setErr('No pude crear los productos'); }
    finally { setBusy(false); }
  }

  if (preview) {
    const marcados = preview.filter((p) => p.incluir).length;
    return (
      <div style={{ padding: 12 }}>
        <h2 style={{ color: GOLD, fontWeight: 900 }}>Revisa lo que leí</h2>
        <p style={{ fontSize: 12, opacity: 0.7 }}>Corrige nombres/precios y desmarca lo que no quieras.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '10px 0' }}>
          {preview.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={p.incluir} onChange={(e) => setPreview((xs) => xs.map((x, j) => j === i ? { ...x, incluir: e.target.checked } : x))} />
              <input value={p.nombre} onChange={(e) => setPreview((xs) => xs.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))} style={{ flex: 2, padding: 8, borderRadius: 8 }} />
              <input type="number" value={p.precio} onChange={(e) => setPreview((xs) => xs.map((x, j) => j === i ? { ...x, precio: e.target.value } : x))} style={{ width: 90, padding: 8, borderRadius: 8 }} />
            </div>
          ))}
          {!preview.length && <div style={{ opacity: 0.6 }}>No encontré productos en la foto.</div>}
        </div>
        {err ? <div style={{ color: '#ff6b6b', fontSize: 13 }}>{err}</div> : null}
        <button disabled={busy || !marcados} onClick={crearPreview} style={{ width: '100%', background: GOLD, color: '#000', fontWeight: 900, borderRadius: 10, padding: 12, border: 0, opacity: (busy || !marcados) ? 0.5 : 1 }}>Crear {marcados} productos</button>
        <button onClick={() => setPreview(null)} style={{ width: '100%', background: 'transparent', color: '#000', marginTop: 8, border: 0, opacity: 0.6 }}>Cancelar</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ color: GOLD, fontWeight: 900 }}>Productos</h2>
        <button onClick={() => setCaptura(true)} style={{ background: '#ffffff14', color: '#000', fontWeight: 800, borderRadius: 10, padding: '8px 12px', border: 0 }}>📷 Desde foto</button>
      </div>
      {captura ? (
        <div style={{ margin: '10px 0' }}>
          <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Saca o elige una foto de tu menú / lista de precios:</p>
          <EvidenceIntake maxEvidence={1} value={[]} onChange={onFoto} showNativeCapture />
        </div>
      ) : null}
      {busy ? <div style={{ opacity: 0.7, fontSize: 13, margin: '8px 0' }}>Leyendo…</div> : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0 16px' }}>
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
        {!items.length && <div style={{ opacity: 0.6 }}>Aún no tienes productos. Crea el primero abajo o usa 📷 Desde foto.</div>}
      </div>

      <div style={{ background: '#ffffff08', borderRadius: 12, padding: 12 }}>
        <input placeholder="Nombre del producto" value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ width: '100%', padding: 9, borderRadius: 8, marginBottom: 8 }} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ flex: 1, padding: 9, borderRadius: 8 }}>
            <option value="producto">Producto</option>
            <option value="servicio">Servicio</option>
          </select>
          <input placeholder="Precio" type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} style={{ flex: 1, padding: 9, borderRadius: 8 }} />
          <input placeholder="Stock" type="number" value={stock} onChange={(e) => setStock(e.target.value)} style={{ flex: 1, padding: 9, borderRadius: 8 }} />
        </div>
        {err ? <div style={{ color: '#ff6b6b', fontSize: 13 }}>{err}</div> : null}
        <button onClick={guardar} style={{ background: GOLD, color: '#000', fontWeight: 800, borderRadius: 10, padding: '10px 16px', border: 0 }}>Guardar</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos-app" && npx jest tests/gastos/ProductosView.test.jsx` then `cd gastos-app && npx jest`
Expected: PASS — suite app verde. Then `npm run build` → OK.

- [ ] **Step 5: GUARD then commit**

```bash
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112" && git rev-parse --show-toplevel && git branch --show-current && git add gastos-app/src/gastos/api.js gastos-app/src/gastos/ProductosView.jsx gastos-app/tests/gastos/ProductosView.test.jsx && git commit -m "feat(catalog-app): 📷 Desde foto + preview + crear en bulk en ProductosView"
```

---

## Task 5: Verificación final (suites + build)

- [ ] **Step 1: Backend** — `cd gastos && npx jest` → PASS (280 + nuevos catalog).
- [ ] **Step 2: App** — `cd gastos-app && npx jest` → PASS.
- [ ] **Step 3: Build** — `cd gastos-app && npm run build` → OK.
(Todos con el prefijo del worktree.)

---

## Notas de despliegue (con el usuario después)
- Backend: `node deploy-gastos-wt.js` (sin nuevas deps; GEMINI_API_KEY ya está en el .env del VPS). App: rebuild APK (→ v3.5) + `upload-apk-wt.js`. ⚠️ El deploy backend vuelve a subir todo el `gastos/` (incl. varas).

## Self-review (hecho)
- **Cobertura del spec:** extraerProductos (Gemini visión, http inyectable, normaliza nombre+precio) ✅(T1); crearProductosBulk scoped ✅(T2); endpoints /catalog/extraer (no crea, inyectable, 400/502) + /products/bulk (201/400) ✅(T3); app botón Desde foto + captura (EvidenceIntake) + preview editable con checkboxes + crear bulk + api ✅(T4). Tests pg-mem + RTL ✅. Tenant scope (companyId) ✅.
- **Sin placeholders:** código completo.
- **Consistencia:** `extraerProductos(imageBase64, mimeType, {http})` (T1) inyectado en createAppRouter (T3); `crearProductosBulk(db, companyId, productos)` (T2) usado por /products/bulk (T3); `api.catalogExtraer/crearProductosBulk` (T4) pegan a los endpoints (T3); el preview manda `[{nombre, precio}]`, mismo shape que extraerProductos devuelve y crearProductosBulk espera.
