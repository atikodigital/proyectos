# Admin: productos, canales, burbuja y ficha de cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el admin de Atiko (`/admin`) pueda asignar/quitar productos (Hash IA, CRM, Chat, Pedidos), canales (WhatsApp/Messenger/Instagram/Email/Telegram/Web/Voz) y la burbuja flotante (activa + apps) por cliente, y ver una ficha read-only con toda su información.

**Architecture:** Se siguen los patrones existentes: migración perezosa de columnas en `companies` (como `ensurePlan`), funciones de repo, endpoints en el router admin bajo `requireKind('admin')`, y la UI estática `public/admin/index.html` con `fetch`. Los arrays se guardan en `jsonb` (consistente con `delivery_zonas`/`conciliaciones`).

**Tech Stack:** Node.js/Express, Postgres (jsonb), pg-mem + supertest (tests), HTML/JS vanilla.

**Spec:** `docs/superpowers/specs/2026-06-18-admin-productos-canales-ficha-cliente-design.md`

---

### Task 1: Migración + catálogos + `setProductos` (repo)

**Files:**
- Modify: `gastos/src/admin/repo.js`
- Test: `gastos/tests/admin/productos.test.js` (crear)

- [ ] **Step 1: Escribir el test que falla**

Crear `gastos/tests/admin/productos.test.js`:

```js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const repo = require('../../src/admin/repo');

async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  const c = await db.query("INSERT INTO companies(nombre) VALUES('Acme') RETURNING id");
  return { db, cid: c.rows[0].id };
}

test('setProductos filtra claves desconocidas y normaliza burbuja_apps', async () => {
  const { db, cid } = await setup();
  const r = await repo.setProductos(db, cid, {
    productos: ['hashia', 'crm', 'INVENTADO'],
    canales: ['whatsapp', 'fax'],
    burbuja_activa: 1,
    burbuja_apps: [' WhatsApp ', 'Rappi', 'whatsapp'],
  });
  expect(r.productos.sort()).toEqual(['crm', 'hashia']);
  expect(r.canales).toEqual(['whatsapp']);
  expect(r.burbuja_activa).toBe(true);
  expect(r.burbuja_apps.sort()).toEqual(['rappi', 'whatsapp']);
});

test('setProductos parcial no borra lo no enviado', async () => {
  const { db, cid } = await setup();
  await repo.setProductos(db, cid, { productos: ['hashia'] });
  const r = await repo.setProductos(db, cid, { burbuja_activa: true });
  expect(r.productos).toEqual(['hashia']);
  expect(r.burbuja_activa).toBe(true);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd gastos && npx jest tests/admin/productos.test.js -t setProductos`
Expected: FAIL (`repo.setProductos is not a function`).

- [ ] **Step 3: Implementar en `gastos/src/admin/repo.js`**

Agregar cerca del tope (después de los `require`):

```js
const PRODUCTOS = ['hashia', 'crm', 'chat', 'pedidos'];
const CANALES = ['whatsapp', 'messenger', 'instagram', 'email', 'telegram', 'web', 'voz'];
const _prodReady = new WeakSet();

async function ensureProductos(db) {
  if (_prodReady.has(db)) return;
  await db.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS productos jsonb DEFAULT '[]';");
  await db.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS canales jsonb DEFAULT '[]';");
  await db.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS burbuja_activa boolean DEFAULT false;");
  await db.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS burbuja_apps jsonb DEFAULT '[]';");
  _prodReady.add(db);
}

function _filtrar(arr, permitidos) {
  const out = [];
  for (const v of (Array.isArray(arr) ? arr : [])) {
    const k = String(v || '').trim().toLowerCase();
    if (permitidos.includes(k) && !out.includes(k)) out.push(k);
  }
  return out;
}
function _appsLibres(arr) {
  const out = [];
  for (const v of (Array.isArray(arr) ? arr : [])) {
    const k = String(v || '').trim().toLowerCase();
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

async function getProductos(db, companyId) {
  await ensureProductos(db);
  const r = await db.query('SELECT id, productos, canales, burbuja_activa, burbuja_apps FROM companies WHERE id=$1', [companyId]);
  return r.rows[0] || null;
}

async function setProductos(db, companyId, patch = {}) {
  await ensureProductos(db);
  const sets = []; const vals = [companyId];
  if (patch.productos !== undefined) { vals.push(JSON.stringify(_filtrar(patch.productos, PRODUCTOS))); sets.push(`productos=$${vals.length}::jsonb`); }
  if (patch.canales !== undefined) { vals.push(JSON.stringify(_filtrar(patch.canales, CANALES))); sets.push(`canales=$${vals.length}::jsonb`); }
  if (patch.burbuja_activa !== undefined) { vals.push(!!patch.burbuja_activa); sets.push(`burbuja_activa=$${vals.length}`); }
  if (patch.burbuja_apps !== undefined) { vals.push(JSON.stringify(_appsLibres(patch.burbuja_apps))); sets.push(`burbuja_apps=$${vals.length}::jsonb`); }
  if (!sets.length) return getProductos(db, companyId);
  const r = await db.query(`UPDATE companies SET ${sets.join(', ')} WHERE id=$1 RETURNING id, productos, canales, burbuja_activa, burbuja_apps`, vals);
  return r.rows[0] || null;
}
```

Agregar al `module.exports`: `ensureProductos, getProductos, setProductos, PRODUCTOS, CANALES`.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd gastos && npx jest tests/admin/productos.test.js -t setProductos`
Expected: PASS (ambos tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/admin/repo.js gastos/tests/admin/productos.test.js
git commit -m "feat(admin): migracion productos/canales/burbuja + setProductos"
```

---

### Task 2: `crearCliente` y `listClientesConStats` incluyen productos

**Files:**
- Modify: `gastos/src/admin/repo.js`
- Test: `gastos/tests/admin/productos.test.js`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `gastos/tests/admin/productos.test.js`:

```js
test('crearCliente persiste productos y listClientesConStats los devuelve', async () => {
  const { db } = await setup();
  await repo.crearCliente(db, { nombreEmpresa: 'Pizza X', productos: ['hashia', 'pedidos'], canales: ['whatsapp'], burbuja_activa: true, burbuja_apps: ['rappi'] });
  const now = new Date();
  const lista = await repo.listClientesConStats(db, now.getFullYear(), now.getMonth() + 1);
  const fila = lista.find((c) => c.nombre === 'Pizza X');
  expect(fila.productos.sort()).toEqual(['hashia', 'pedidos']);
  expect(fila.canales).toEqual(['whatsapp']);
  expect(fila.burbuja_activa).toBe(true);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd gastos && npx jest tests/admin/productos.test.js -t "crearCliente persiste"`
Expected: FAIL (`fila.productos` undefined).

- [ ] **Step 3: Implementar**

En `crearCliente` (en `gastos/src/admin/repo.js`), después de `if (d.plan) await setCompanyPlan(...)`, agregar:

```js
  if (d.productos !== undefined || d.canales !== undefined || d.burbuja_activa !== undefined || d.burbuja_apps !== undefined) {
    await setProductos(db, empresa.id, { productos: d.productos, canales: d.canales, burbuja_activa: d.burbuja_activa, burbuja_apps: d.burbuja_apps });
  }
```

En `listClientesConStats`, agregar `await ensureProductos(db);` tras `await ensurePlan(db);`, cambiar el SELECT a:

```js
  const cs = await db.query('SELECT id, nombre, rut, plan, productos, canales, burbuja_activa, owner_nombre, created_at FROM companies ORDER BY created_at ASC');
```

y en el `out.push({...})` agregar:

```js
      productos: c.productos || [], canales: c.canales || [], burbuja_activa: !!c.burbuja_activa,
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd gastos && npx jest tests/admin/productos.test.js`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/admin/repo.js gastos/tests/admin/productos.test.js
git commit -m "feat(admin): crearCliente y listClientes incluyen productos/canales/burbuja"
```

---

### Task 3: `listPedidos` en pedidos/repo

**Files:**
- Modify: `gastos/src/pedidos/repo.js`
- Test: `gastos/tests/pedidos/list.test.js` (crear)

- [ ] **Step 1: Escribir el test que falla**

Crear `gastos/tests/pedidos/list.test.js`:

```js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const repo = require('../../src/pedidos/repo');

async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  const c = await db.query("INSERT INTO companies(nombre) VALUES('P') RETURNING id");
  return { db, cid: c.rows[0].id };
}

test('listPedidos devuelve los pedidos de la empresa, más nuevos primero', async () => {
  const { db, cid } = await setup();
  await repo.createPedido(db, cid, { contact_name: 'Ana', items: [{ descripcion: 'Pizza', cantidad: 1, precio_unitario: 12000 }] });
  await repo.createPedido(db, cid, { contact_name: 'Beto', items: [{ descripcion: 'Pizza', cantidad: 2, precio_unitario: 12000 }] });
  const out = await repo.listPedidos(db, cid, 10);
  expect(out).toHaveLength(2);
  expect(out[0].contact_name).toBeTruthy();
});
```

> Nota: verificar la firma real de `createPedido(db, companyId, data)` en `gastos/src/pedidos/repo.js` antes de correr; ajustar el objeto si difiere.

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd gastos && npx jest tests/pedidos/list.test.js`
Expected: FAIL (`repo.listPedidos is not a function`).

- [ ] **Step 3: Implementar en `gastos/src/pedidos/repo.js`**

Agregar antes de `module.exports`:

```js
async function listPedidos(db, companyId, limit = 10) {
  await ensurePedidosTable(db);
  const r = await db.query('SELECT * FROM pedidos WHERE company_id=$1 ORDER BY created_at DESC LIMIT $2', [companyId, limit]);
  return r.rows;
}
```

Y agregar `listPedidos` al `module.exports`.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd gastos && npx jest tests/pedidos/list.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gastos/src/pedidos/repo.js gastos/tests/pedidos/list.test.js
git commit -m "feat(pedidos): listPedidos por empresa"
```

---

### Task 4: `getFichaCliente` (repo)

**Files:**
- Modify: `gastos/src/admin/repo.js`
- Test: `gastos/tests/admin/ficha.test.js` (crear)

- [ ] **Step 1: Escribir el test que falla**

Crear `gastos/tests/admin/ficha.test.js`:

```js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const repo = require('../../src/admin/repo');
const { createEmployee } = require('../../src/companies/repo');
const { createExpense } = require('../../src/expenses/repo');

async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  const c = await db.query("INSERT INTO companies(nombre,rut) VALUES('Pizza X','77.123.456-9') RETURNING id");
  return { db, cid: c.rows[0].id };
}

test('getFichaCliente consolida empresa, empleados, movimientos y resumen', async () => {
  const { db, cid } = await setup();
  await repo.setProductos(db, cid, { productos: ['hashia'] });
  await createEmployee(db, { company_id: cid, nombre: 'Juan', phone: '+56911', usuario: 'juan', rol: 'empleado', activo: true });
  await createExpense(db, { company_id: cid, tipo: 'gasto', proveedor: 'Molinera', total: 11900, estado: 'confirmado' });
  const f = await repo.getFichaCliente(db, cid, 2026, 6);
  expect(f.empresa.nombre).toBe('Pizza X');
  expect(f.empresa.productos).toEqual(['hashia']);
  expect(f.empleados.find((e) => e.nombre === 'Juan')).toBeTruthy();
  expect(f.empleados[0]).not.toHaveProperty('password_hash');
  expect(Array.isArray(f.movimientos)).toBe(true);
  expect(f.resumen).toHaveProperty('saldo');
  expect(f.pedidos).toBeNull(); // sin producto 'pedidos'
});

test('getFichaCliente devuelve null si la empresa no existe', async () => {
  const { db } = await setup();
  const f = await repo.getFichaCliente(db, '00000000-0000-0000-0000-000000000000', 2026, 6);
  expect(f).toBeNull();
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd gastos && npx jest tests/admin/ficha.test.js`
Expected: FAIL (`repo.getFichaCliente is not a function`).

- [ ] **Step 3: Implementar en `gastos/src/admin/repo.js`**

Agregar imports al tope:

```js
const { createCompany, createEmployee, listEmployees } = require('../companies/repo');
const { listExpenses } = require('../expenses/query');
const { cashflowSummary } = require('../expenses/summary');
const matchRepo = require('../match/repo');
const pedidosRepo = require('../pedidos/repo');
```

(El `require` actual de `createCompany, createEmployee` se reemplaza por la línea de arriba; mantener `hashPassword`.)

Agregar la función:

```js
async function getFichaCliente(db, companyId, year, month) {
  await ensureProductos(db);
  const cr = await db.query(
    'SELECT id, nombre, rut, giro, owner_nombre, owner_whatsapp, wa_phone_number_id, onboarded_at, created_at, plan, productos, canales, burbuja_activa, burbuja_apps FROM companies WHERE id=$1',
    [companyId]
  );
  const empresa = cr.rows[0];
  if (!empresa) return null;
  empresa.productos = empresa.productos || [];
  empresa.canales = empresa.canales || [];
  empresa.burbuja_apps = empresa.burbuja_apps || [];
  const empleados = await listEmployees(db, companyId);
  const movsAll = await listExpenses(db, companyId, {});
  const movimientos = movsAll.slice(0, 20).map((e) => ({
    id: e.id, tipo: e.tipo, proveedor: e.proveedor, total: Number(e.total) || 0,
    fecha: e.fecha, estado: e.estado, estado_pago: e.estado_pago,
  }));
  const resumen = await cashflowSummary(db, companyId, { year, month });
  const u = await matchRepo.getUltima(db, companyId, 'bancaria');
  const conciliacion = u ? { cuadrado: u.cuadrado, sca: Number(u.sca), sba: Number(u.sba) } : null;
  const pedidos = empresa.productos.includes('pedidos') ? await pedidosRepo.listPedidos(db, companyId, 10) : null;
  return { empresa, empleados, movimientos, resumen, conciliacion, pedidos };
}
```

Agregar `getFichaCliente` al `module.exports`.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd gastos && npx jest tests/admin/ficha.test.js`
Expected: PASS.

- [ ] **Step 5: Correr toda la suite de admin/pedidos para no romper nada**

Run: `cd gastos && npx jest tests/admin tests/pedidos`
Expected: PASS (incluye los tests previos de `router.test.js`).

- [ ] **Step 6: Commit**

```bash
git add gastos/src/admin/repo.js gastos/tests/admin/ficha.test.js
git commit -m "feat(admin): getFichaCliente consolida info del cliente (read-only)"
```

---

### Task 5: Endpoints del router admin

**Files:**
- Modify: `gastos/src/admin/router.js`
- Test: `gastos/tests/admin/productos-api.test.js` (crear)

- [ ] **Step 1: Escribir el test que falla**

Crear `gastos/tests/admin/productos-api.test.js`:

```js
process.env.GASTOS_ADMIN_USER = 'atiko';
process.env.GASTOS_ADMIN_PASSWORD = 'secreta';

const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createAdminRouter } = require('../../src/admin/router');

async function makeApp() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  const app = express(); app.use(express.json());
  app.use('/api/admin', createAdminRouter({ db }));
  const t = (await request(app).post('/api/admin/login').send({ usuario: 'atiko', password: 'secreta' })).body.token;
  return { app, t };
}

test('PATCH /clientes/:id/productos requiere admin y aplica cambios', async () => {
  const { app, t } = await makeApp();
  const c = await request(app).post('/api/admin/clientes').set('Authorization', `Bearer ${t}`).send({ nombreEmpresa: 'Pizza X' });
  const id = c.body.empresa.id;
  await request(app).patch(`/api/admin/clientes/${id}/productos`).send({ productos: ['hashia', 'crm'] }).expect(401);
  const r = await request(app).patch(`/api/admin/clientes/${id}/productos`).set('Authorization', `Bearer ${t}`)
    .send({ productos: ['hashia', 'crm'], canales: ['whatsapp'], burbuja_activa: true, burbuja_apps: ['rappi'] });
  expect(r.status).toBe(200);
  expect(r.body.productos.sort()).toEqual(['crm', 'hashia']);
});

test('GET /clientes/:id devuelve la ficha; 404 si no existe', async () => {
  const { app, t } = await makeApp();
  const c = await request(app).post('/api/admin/clientes').set('Authorization', `Bearer ${t}`).send({ nombreEmpresa: 'Pizza X' });
  const ok = await request(app).get(`/api/admin/clientes/${c.body.empresa.id}`).set('Authorization', `Bearer ${t}`);
  expect(ok.status).toBe(200);
  expect(ok.body.empresa.nombre).toBe('Pizza X');
  const no = await request(app).get('/api/admin/clientes/00000000-0000-0000-0000-000000000000').set('Authorization', `Bearer ${t}`);
  expect(no.status).toBe(404);
});
```

> Nota: confirmar que `POST /clientes` devuelve `{ empresa: { id } }` (ver `crearCliente`); si la forma difiere, ajustar `c.body.empresa.id`.

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd gastos && npx jest tests/admin/productos-api.test.js`
Expected: FAIL (404/no_existe en el PATCH porque la ruta no existe aún).

- [ ] **Step 3: Implementar en `gastos/src/admin/router.js`**

Dentro de `createAdminRouter`, después de `router.patch('/clientes/:id/plan', ...)`, agregar:

```js
  router.patch('/clientes/:id/productos', async (req, res) => {
    const r = await adminRepo.setProductos(db, req.params.id, req.body || {});
    if (!r) return res.status(404).json({ error: 'no_existe' });
    return res.json(r);
  });

  router.get('/clientes/:id', async (req, res) => {
    const d = new Date();
    const f = await adminRepo.getFichaCliente(db, req.params.id, d.getFullYear(), d.getMonth() + 1);
    if (!f) return res.status(404).json({ error: 'no_existe' });
    return res.json(f);
  });
```

(El router ya pasa el body completo a `adminRepo.crearCliente(db, b)`, por lo que `POST /clientes` ya acepta `productos/canales/burbuja_*` sin cambios.)

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd gastos && npx jest tests/admin/productos-api.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gastos/src/admin/router.js gastos/tests/admin/productos-api.test.js
git commit -m "feat(admin): endpoints PATCH /clientes/:id/productos y GET /clientes/:id (ficha)"
```

---

### Task 6: UI del Admin (productos, canales, burbuja, ficha)

**Files:**
- Modify: `gastos/public/admin/index.html`
- Test: `gastos/tests/admin/ui-marcadores.test.js` (crear) — smoke test de que el HTML trae el wiring nuevo.

- [ ] **Step 1: Escribir el test que falla**

Crear `gastos/tests/admin/ui-marcadores.test.js`:

```js
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../../public/admin/index.html'), 'utf8');

test('el admin tiene UI de productos, canales, burbuja y ficha', () => {
  expect(html).toContain('data-prod="hashia"');
  expect(html).toContain('data-prod="pedidos"');
  expect(html).toContain('data-canal="whatsapp"');
  expect(html).toContain('id="burbuja_activa"');
  expect(html).toContain('id="fichaModal"');
  expect(html).toContain('/productos');      // PATCH a /api/admin/clientes/:id/productos
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd gastos && npx jest tests/admin/ui-marcadores.test.js`
Expected: FAIL (los marcadores no existen aún).

- [ ] **Step 3: Implementar la UI en `gastos/public/admin/index.html`**

Aplicar estos cambios (siguiendo el estilo dark+dorado y el patrón `fetch` existente):

1. **Formulario "Nuevo cliente":** agregar, dentro de `.row`, un bloque de checkboxes de productos, canales y burbuja:

```html
<div style="flex-basis:100%">
  <label>Productos</label>
  <div id="nc_productos" class="row" style="gap:14px">
    <label><input type="checkbox" data-prod="hashia"> Hash IA</label>
    <label><input type="checkbox" data-prod="crm"> CRM</label>
    <label><input type="checkbox" data-prod="chat"> Chat</label>
    <label><input type="checkbox" data-prod="pedidos"> Pedidos</label>
  </div>
  <label style="margin-top:8px">Canales (Chat/CRM)</label>
  <div id="nc_canales" class="row" style="gap:14px">
    <label><input type="checkbox" data-canal="whatsapp"> WhatsApp</label>
    <label><input type="checkbox" data-canal="messenger"> Messenger</label>
    <label><input type="checkbox" data-canal="instagram"> Instagram</label>
    <label><input type="checkbox" data-canal="email"> Email</label>
    <label><input type="checkbox" data-canal="telegram"> Telegram</label>
    <label><input type="checkbox" data-canal="web"> Web</label>
    <label><input type="checkbox" data-canal="voz"> Voz</label>
  </div>
  <label style="margin-top:8px"><input type="checkbox" id="burbuja_activa"> Burbuja flotante (Hash IA)</label>
  <input id="burbuja_apps" placeholder="Apps de la burbuja: whatsapp, rappi, banco…" style="width:100%" />
</div>
```

2. **`nc_btn` onclick:** recolectar y enviar los nuevos campos. Reemplazar el body del POST por:

```js
const sel = (q) => Array.from(document.querySelectorAll(q)).filter(c => c.checked).map(c => c.dataset.prod || c.dataset.canal);
await api('/clientes', { method: 'POST', body: JSON.stringify({
  nombreEmpresa: empresa, rut: $('nc_rut').value.trim() || undefined, plan: $('nc_plan').value,
  usuario: $('nc_usuario').value.trim() || undefined, password: $('nc_password').value || undefined,
  productos: sel('#nc_productos input'), canales: sel('#nc_canales input'),
  burbuja_activa: $('burbuja_activa').checked,
  burbuja_apps: $('burbuja_apps').value.split(',').map(s => s.trim()).filter(Boolean),
}) });
```

3. **Lista de clientes:** agregar una columna "Productos" en el `<thead>` (`<th>Productos</th>`) y, en el render de cada fila, una celda con pills + botón "Ver ficha":

```js
'<td>' + (c.productos || []).map(p => '<span class="pill">' + esc(p) + '</span>').join(' ') +
  (c.burbuja_activa ? ' <span class="pill" title="Burbuja">🫧</span>' : '') + '</td>' +
'<td><button class="btn-ghost btn-sm" data-ficha="' + esc(c.id) + '">👁️ Ver ficha</button>' +
  '<button class="btn-ghost btn-sm" data-login="' + esc(c.id) + '" data-nombre="' + esc(c.nombre) + '">🔑 Login</button></td>'
```

(actualizar el `colspan` de la fila "Cargando…"/"sin clientes" a `8`).

4. **Wiring del botón ficha + modal:** agregar tras el bind de `data-login`:

```js
body.querySelectorAll('button[data-ficha]').forEach(btn => { btn.onclick = () => abrirFicha(btn.dataset.ficha); });
```

5. **Modal de ficha** (agregar junto al `#loginModal`):

```html
<div id="fichaModal" class="modal hidden">
  <div class="box" style="max-width:680px">
    <h3 style="margin:0 0 8px; color:var(--gold)">👁️ Ficha del cliente</h3>
    <div id="fichaBody" class="muted">Cargando…</div>
    <div class="row" style="justify-content:flex-end; margin-top:12px">
      <button id="ficha_cerrar" class="btn-ghost">Cerrar</button>
    </div>
  </div>
</div>
```

6. **Función `abrirFicha`** (en el `<script>`):

```js
function fmt(n){ return '$' + Number(n||0).toLocaleString('es-CL'); }
async function abrirFicha(id) {
  $('fichaModal').classList.remove('hidden');
  $('fichaBody').innerHTML = 'Cargando…';
  try {
    const f = await api('/clientes/' + id);
    const e = f.empresa;
    const emp = f.empleados.map(x => esc(x.nombre) + ' · ' + esc(x.phone || 's/tel') + ' · ' + esc(x.rol)).join('<br>') || '—';
    const movs = f.movimientos.map(m => esc(m.fecha || '') + ' · ' + esc(m.proveedor || '') + ' · ' + fmt(m.total) + ' · ' + esc(m.estado_pago || '')).join('<br>') || '—';
    const ped = f.pedidos ? (f.pedidos.length + ' pedidos') : 'sin módulo';
    const con = f.conciliacion ? (f.conciliacion.cuadrado ? 'cuadrada' : 'descuadrada') : 'sin conciliación';
    $('fichaBody').innerHTML =
      '<div class="card"><h3>Empresa</h3>' + esc(e.nombre) + ' · ' + esc(e.rut || '—') + ' · ' + esc(e.giro || '—') +
      '<br>WhatsApp dueño: ' + esc(e.owner_whatsapp || '—') +
      '<br>Plan: ' + esc(e.plan) + ' · Productos: ' + (e.productos || []).join(', ') +
      '<br>Canales: ' + (e.canales || []).join(', ') +
      '<br>Burbuja: ' + (e.burbuja_activa ? 'activa · ' + (e.burbuja_apps || []).join(', ') : 'inactiva') + '</div>' +
      '<div class="card"><h3>Empleados</h3>' + emp + '</div>' +
      '<div class="card"><h3>Resumen del mes</h3>Ingresos ' + fmt(f.resumen.ingresos) + ' · Gastos ' + fmt(f.resumen.gastos) + ' · Saldo ' + fmt(f.resumen.saldo) + ' · Conciliación ' + con + '</div>' +
      '<div class="card"><h3>Movimientos recientes</h3>' + movs + '</div>' +
      '<div class="card"><h3>Pedidos</h3>' + esc(ped) + '</div>';
  } catch (err) { $('fichaBody').innerHTML = 'Error: ' + esc(err.message); }
}
$('ficha_cerrar').onclick = () => $('fichaModal').classList.add('hidden');
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd gastos && npx jest tests/admin/ui-marcadores.test.js`
Expected: PASS.

- [ ] **Step 5: Verificación manual**

Run: `cd gastos && node src/server.js` (con `GASTOS_ADMIN_PASSWORD` seteada y Postgres disponible), abrir `http://localhost:3100/admin/`, entrar como `atiko`, crear un cliente marcando productos/canales/burbuja, y pulsar "Ver ficha".
Expected: el cliente aparece con sus pills; la ficha muestra empresa, empleados, resumen, movimientos y pedidos.

- [ ] **Step 6: Commit**

```bash
git add gastos/public/admin/index.html gastos/tests/admin/ui-marcadores.test.js
git commit -m "feat(admin): UI de productos/canales/burbuja + ficha de cliente"
```

---

### Task 7: Verificación final

- [ ] **Step 1: Correr toda la suite del backend**

Run: `cd gastos && npx jest`
Expected: PASS (sin regresiones).

- [ ] **Step 2: Commit final si hubo ajustes**

```bash
git add -A && git commit -m "test(admin): suite verde productos/ficha"
```

---

## Self-Review (cobertura del spec)

- **§4 Modelo de datos** → Task 1 (ensureProductos, jsonb).
- **§5.1 repo** → setProductos (T1), crearCliente/listClientes (T2), getFichaCliente (T4), listPedidos (T3).
- **§5.2 router** → PATCH /productos, GET /:id, POST extendido (T5).
- **§6 UI** → Task 6.
- **§7 Pruebas TDD** → tests en T1–T6.
- **§8 Seguridad** → endpoints bajo `requireKind('admin')` (T5, ya aplicado por `router.use`); ficha sin `password_hash` (test en T4).

Tipos/firmas consistentes: `setProductos`, `getProductos`, `getFichaCliente`, `listPedidos`, `PRODUCTOS`, `CANALES` usados igual en todas las tareas.
