# PDF del pedido (Hash IA · Chat #4) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **WORKTREE GUARD (cada subagente):** trabaja SOLO en `C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112`. Toda ruta debe contener `.claude\worktrees\dazzling-driscoll-78a112`. Antes de commitear: `git rev-parse --show-toplevel && git branch --show-current` → toplevel termina en `dazzling-driscoll-78a112`, branch `claude/dazzling-driscoll-78a112`. `gastos/` y `gastos-app/` también existen en `main` — NO tocar eso. Hay trabajo paralelo "varas" en la misma rama → usa `git add <archivos específicos>`, nunca `git add -A`.

**Goal:** Generar un PDF de la cotización y poder descargarlo/abrirlo desde la app.

**Architecture:** Un módulo `pdf.js` (pdfkit) arma el PDF desde los datos del pedido (auto-contenido, sin tocar la DB). Un endpoint `GET /api/app/pedido/:id/pdf` carga el pedido (`getPedido`) + pie y devuelve `application/pdf`. La app baja el blob y lo abre.

**Tech Stack:** Node/Express, pdfkit, jest + pg-mem; Capacitor/React/Vite, jest + RTL. TDD. Spec: `docs/superpowers/specs/2026-06-16-pdf-pedido-design.md`.

---

## Task 1: pdfkit + buildPedidoPdf

**Files:**
- Modify: `gastos/package.json` (dep pdfkit)
- Create: `gastos/src/pedidos/pdf.js`
- Test: `gastos/tests/pedidos/pdf.test.js`

- [ ] **Step 1: Write the failing test** — create `gastos/tests/pedidos/pdf.test.js`:

```js
const { buildPedidoPdf } = require('../../src/pedidos/pdf');

test('buildPedidoPdf devuelve un Buffer PDF (%PDF, > 500 bytes)', async () => {
  const ped = {
    id: 'abc12345-0000-0000-0000-000000000000',
    items: [{ descripcion: 'Torta (15p) + Velas', cantidad: 2, precio_unitario: 18000 }],
    subtotal: 36000, impuesto: 0, impuesto_pct: 0, envio_costo: 2500, comuna: 'Providencia',
    total: 38500, entrega: 'despacho', direccion: 'Calle 1', contact_name: 'Ana', contact_phone: '912345678',
  };
  const buf = await buildPedidoPdf(ped, { pie: 'Atiko SpA · contacto@atiko.cl' });
  expect(Buffer.isBuffer(buf)).toBe(true);
  expect(buf.slice(0, 4).toString()).toBe('%PDF');
  expect(buf.length).toBeGreaterThan(500);
});

test('buildPedidoPdf sin pie ni items no rompe', async () => {
  const buf = await buildPedidoPdf({ id: 'x', items: [], subtotal: 0, total: 0, entrega: 'retiro' }, {});
  expect(buf.slice(0, 4).toString()).toBe('%PDF');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos" && npx jest tests/pedidos/pdf.test.js`
Expected: FAIL — `Cannot find module '../../src/pedidos/pdf'` (y/o `Cannot find module 'pdfkit'`).

- [ ] **Step 3: Install pdfkit + write implementation**

Install (en el worktree gastos/):
```bash
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos" && npm install pdfkit --save
```
Create `gastos/src/pedidos/pdf.js`:
```js
// Genera el PDF de una cotización/pedido con pdfkit. Auto-contenido (recibe el pedido ya cargado).
const PDFDocument = require('pdfkit');

function _clp(n) { return '$' + Number(n || 0).toLocaleString('es-CL'); }
function _cot(ped) { return 'COT-' + String((ped && ped.id) || '').replace(/-/g, '').slice(0, 6).toUpperCase(); }

// Devuelve Promise<Buffer> con el PDF.
function buildPedidoPdf(pedido, opts = {}) {
  return new Promise((resolve, reject) => {
    try {
      const ped = pedido || {};
      const pie = String((opts && opts.pie) || '').trim();
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(16).fillColor('#000').text(pie || 'Cotización');
      doc.moveDown(0.4);
      doc.fontSize(11).text('Cotización N° ' + _cot(ped));
      const fecha = ped.created_at ? new Date(ped.created_at) : new Date();
      doc.text('Fecha: ' + fecha.toLocaleDateString('es-CL'));
      doc.moveDown();

      const items = Array.isArray(ped.items) ? ped.items : [];
      items.forEach((it) => {
        const cant = it.cantidad || 1;
        const pu = it.precio_unitario || 0;
        doc.fontSize(11).text((it.descripcion || 'Producto') + '   ' + cant + ' × ' + _clp(pu) + ' = ' + _clp(cant * pu));
      });
      doc.moveDown();

      doc.fontSize(11).text('Subtotal: ' + _clp(ped.subtotal), { align: 'right' });
      if (Number(ped.impuesto) > 0) doc.text('IVA (' + Number(ped.impuesto_pct) + '%): ' + _clp(ped.impuesto), { align: 'right' });
      if (Number(ped.envio_costo) > 0) doc.text('Despacho' + (ped.comuna ? ' (' + ped.comuna + ')' : '') + ': ' + _clp(ped.envio_costo), { align: 'right' });
      doc.fontSize(13).text('Total: ' + _clp(ped.total), { align: 'right' });
      doc.moveDown();

      doc.fontSize(11);
      if (ped.entrega === 'retiro') doc.text('Entrega: Retiro en tienda');
      else if (ped.entrega === 'despacho') doc.text('Entrega: Despacho' + (ped.comuna ? ' a ' + ped.comuna : ' a domicilio'));
      if (ped.direccion) doc.text('Dirección: ' + ped.direccion);
      const cN = (ped.contact_name || '').trim();
      const cT = (ped.contact_phone || '').trim();
      if (cN || cT) doc.text('Cliente: ' + [cN, cT].filter(Boolean).join(' · '));
      doc.moveDown();

      doc.fontSize(10).fillColor('#888').text('¿Confirmamos? Responde y avanzamos.');
      doc.end();
    } catch (e) { reject(e); }
  });
}

module.exports = { buildPedidoPdf };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos" && npx jest tests/pedidos/pdf.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112" && git rev-parse --show-toplevel && git branch --show-current && git add gastos/package.json gastos/package-lock.json gastos/src/pedidos/pdf.js gastos/tests/pedidos/pdf.test.js && git commit -m "feat(pdf): buildPedidoPdf con pdfkit"
```
(Si no hay `package-lock.json`, omitirlo del `git add`.)

---

## Task 2: getPedido + endpoint GET /api/app/pedido/:id/pdf

**Files:**
- Modify: `gastos/src/pedidos/repo.js`, `gastos/src/app/router.js`
- Test: `gastos/tests/pedidos/pedido-pdf.test.js`

- [ ] **Step 1: Write the failing test** — create `gastos/tests/pedidos/pedido-pdf.test.js`:

```js
process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { hashPassword } = require('../../src/auth/password');
const { createAppRouter } = require('../../src/app/router');
const pedidos = require('../../src/pedidos/repo');

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
  const companyId = c.rows[0].id;
  const hash = await hashPassword('clave');
  await db.query("INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'J','juan',$2)", [companyId, hash]);
  const ped = await pedidos.createPedido(db, companyId, { items: [{ descripcion: 'Torta', cantidad: 1, precio_unitario: 18000 }], impuesto_pct: 0, entrega: 'retiro' });
  return { companyId, pedidoId: ped.id };
}
function buildApp(db) { const app = express(); app.use(express.json()); app.use('/api/app', createAppRouter({ db })); return app; }
async function token(app) { return (await request(app).post('/api/app/login').send({ usuario: 'juan', password: 'clave' })).body.token; }

test('GET /pedido/:id/pdf → 200 application/pdf; 404 inexistente; 401 sin token', async () => {
  const db = await freshDb(); const { pedidoId } = await seed(db);
  const app = buildApp(db); const t = await token(app);
  const r = await request(app).get('/api/app/pedido/' + pedidoId + '/pdf').set('Authorization', `Bearer ${t}`).expect(200);
  expect(r.headers['content-type']).toContain('application/pdf');
  await request(app).get('/api/app/pedido/00000000-0000-0000-0000-000000009999/pdf').set('Authorization', `Bearer ${t}`).expect(404);
  await request(app).get('/api/app/pedido/' + pedidoId + '/pdf').expect(401);
});

test('getPedido es tenant-scoped (otra empresa → null)', async () => {
  const db = await freshDb(); const { companyId, pedidoId } = await seed(db);
  expect(await pedidos.getPedido(db, companyId, pedidoId)).toBeTruthy();
  expect(await pedidos.getPedido(db, '99999999-9999-9999-9999-999999999999', pedidoId)).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos" && npx jest tests/pedidos/pedido-pdf.test.js`
Expected: FAIL — `getPedido` no existe / endpoint 404 en el caso 200.

- [ ] **Step 3: Write minimal implementation**

(a) `gastos/src/pedidos/repo.js`: agregar antes de `module.exports`:
```js
async function getPedido(db, companyId, id) {
  await ensurePedidosTable(db);
  const r = await db.query('SELECT * FROM pedidos WHERE company_id = $1 AND id = $2', [companyId, id]);
  return r.rows[0] || null;
}
```
y agregar `getPedido,` al `module.exports`.

(b) `gastos/src/app/router.js`: READ el archivo (trabajo paralelo lo cambió). Agregar el require junto a los otros (cerca de `const pedidosRepo = require('../pedidos/repo');`):
```js
const { buildPedidoPdf } = require('../pedidos/pdf');
```
y agregar esta ruta después de `/pedido/from-catalog` (o junto a `/pedido-config`):
```js
  router.get('/pedido/:id/pdf', async (req, res) => {
    try {
      const ped = await pedidosRepo.getPedido(db, req.auth.companyId, req.params.id);
      if (!ped) return res.status(404).json({ error: 'no_existe' });
      const pie = await pedidosRepo.getCompanyPie(db, req.auth.companyId);
      const buf = await buildPedidoPdf(ped, { pie });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="cotizacion.pdf"');
      return res.send(buf);
    } catch (e) {
      if (e.message && e.message.includes('uuid')) return res.status(404).json({ error: 'no_existe' });
      console.error('[pedido pdf]', e.message); return res.status(500).json({ error: 'error_pdf' });
    }
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos" && npx jest tests/pedidos/pedido-pdf.test.js` then `npx jest`
Expected: PASS — todo verde.

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112" && git rev-parse --show-toplevel && git branch --show-current && git add gastos/src/pedidos/repo.js gastos/src/app/router.js gastos/tests/pedidos/pedido-pdf.test.js && git commit -m "feat(pdf): getPedido + endpoint GET /api/app/pedido/:id/pdf"
```

---

## Task 3: App — botón PDF en PedidoBuilder

**Files:**
- Modify: `gastos-app/src/gastos/api.js`, `gastos-app/src/gastos/pedido/PedidoBuilder.jsx`
- Test: `gastos-app/tests/gastos/PedidoBuilder.test.jsx` (añadir)

- [ ] **Step 1: Write the failing test** — en `gastos-app/tests/gastos/PedidoBuilder.test.jsx`: agregar `pedidoFromCatalog` ya está mockeado; agregar `pedidoPdfAbrir: jest.fn()` al objeto del mock de api. APPEND:
```js
test('tras generar, el botón 📄 PDF llama api.pedidoPdfAbrir con el id', async () => {
  api.listProducts.mockResolvedValue([torta]);
  api.getPedidoConfig.mockResolvedValue({ iva_incluido: true });
  api.pedidoFromCatalog.mockResolvedValue({ pedido: { id: 'p9' }, text: 'PEDIDO', waUrl: 'https://wa.me/?text=PEDIDO' });

  render(<PedidoBuilder channel="whatsapp" contact="Ana" onClose={() => {}} />);
  await waitFor(() => expect(screen.getByText('Torta')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Torta'));
  fireEvent.click(screen.getByText('Agregar al carrito'));
  fireEvent.click(await screen.findByText('Generar pedido'));
  await waitFor(() => expect(screen.getByText('Pedido listo')).toBeInTheDocument());

  fireEvent.click(screen.getByText('📄 PDF'));
  expect(api.pedidoPdfAbrir).toHaveBeenCalledWith('p9');
});
```
(Si `api.comunas` u otros mocks son necesarios para que el componente monte, agrégalos como en los demás tests del archivo.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos-app" && npx jest tests/gastos/PedidoBuilder.test.jsx -t PDF`
Expected: FAIL — no existe el botón "📄 PDF" ni `api.pedidoPdfAbrir`.

- [ ] **Step 3: Write minimal implementation**

(a) `gastos-app/src/gastos/api.js` — READ first (trabajo paralelo lo cambió). Agregar dentro del objeto `api` (junto a `fotoUrl`/los métodos de pedido):
```js
  async pedidoPdfBlob(id) {
    const t = getToken();
    const res = await fetch(`${API_BASE}/api/app/pedido/${id}/pdf`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
    if (!res.ok) return null;
    return res.blob();
  },
  async pedidoPdfAbrir(id) {
    const blob = await this.pedidoPdfBlob(id);
    if (!blob) return false;
    const url = URL.createObjectURL(blob);
    try { window.open(url, '_blank'); } catch (_e) { window.location.href = url; }
    return true;
  },
```
(`getToken` ya está importado al inicio de api.js — el de `fotoUrl`. `API_BASE` también existe.)

(b) `gastos-app/src/gastos/pedido/PedidoBuilder.jsx`:
- En `generar()`, guardar el id del pedido: cambiar `setPedido({ text: r.text || '', waUrl: ... })` por:
```js
      setPedido({ id: r.pedido && r.pedido.id, text: r.text || '', waUrl: r.waUrl || ('https://wa.me/?text=' + encodeURIComponent(r.text || '')) });
```
- En la pantalla "Pedido listo" (el bloque `if (pedido) { return (...) }`), cambiar el `<h3>` a exactamente `Pedido listo` (ya lo es) y agregar el botón PDF entre el textarea/Enviar y Cerrar:
```jsx
        <button onClick={() => abrir(pedido.waUrl)} style={{ width: '100%', border: 0, background: '#16A34A', color: '#fff', fontWeight: 900, borderRadius: 12, padding: 12, marginTop: 8 }}>Enviar por WhatsApp</button>
        {pedido.id ? (
          <button onClick={() => api.pedidoPdfAbrir(pedido.id)} style={{ width: '100%', border: 0, background: '#ffffff14', color: '#fff', fontWeight: 900, borderRadius: 12, padding: 12, marginTop: 8 }}>📄 PDF</button>
        ) : null}
        <button onClick={onClose} style={{ width: '100%', border: 0, background: 'transparent', color: '#fff', opacity: 0.6, marginTop: 8 }}>Cerrar</button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos-app" && npx jest tests/gastos/PedidoBuilder.test.jsx` then `cd gastos-app && npx jest`
Expected: PASS — suite app verde. Then `npm run build` → OK.

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112" && git rev-parse --show-toplevel && git branch --show-current && git add gastos-app/src/gastos/api.js gastos-app/src/gastos/pedido/PedidoBuilder.jsx gastos-app/tests/gastos/PedidoBuilder.test.jsx && git commit -m "feat(pdf-app): botón 📄 PDF en Pedido listo del PedidoBuilder"
```

---

## Task 4: Verificación final (suites + build)

- [ ] **Step 1: Backend** — `cd gastos && npx jest` → PASS (257 + nuevos pdf).
- [ ] **Step 2: App** — `cd gastos-app && npx jest` → PASS.
- [ ] **Step 3: Build** — `cd gastos-app && npm run build` → OK.
(Todos con el prefijo del worktree.)

---

## Notas de despliegue (con el usuario después)
- Backend: `node deploy-gastos-wt.js` (incluye `npm install` en el VPS → instala pdfkit). App: rebuild APK (→ v3.4) + `upload-apk-wt.js`.
- ⚠️ El deploy backend vuelve a subir todo el `gastos/` del worktree (incl. varas). Confirmar con el usuario.

## Self-review (hecho)
- **Cobertura del spec:** pdfkit dep ✅(T1); buildPedidoPdf layout (pie/COT/fecha/items/subtotal/IVA/envío/total/entrega/comuna/cliente) ✅(T1); getPedido scoped ✅(T2); endpoint application/pdf + 404 + 401 + uuid guard ✅(T2); app pedidoPdfBlob/Abrir + botón PDF + guarda id ✅(T3). Tests ✅.
- **Sin placeholders:** código completo.
- **Consistencia:** `buildPedidoPdf(pedido, {pie})` (T1) consumido por el endpoint (T2); `getPedido(db, companyId, id)` (T2); `api.pedidoPdfAbrir(id)` (T3) usa `pedidoPdfBlob(id)`; `setPedido({id,...})` (T3) → el botón usa `pedido.id`; el `from-catalog` ya devuelve `{pedido:{id,...}}`.
