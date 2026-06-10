# Plan 5 — Panel web del dueño Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-06-09-atiko-gastos-design.md` (§4.1)
**Depende de:** Plan 3 (API `/api/panel`: login, expenses, expenses.xlsx, employees CRUD, company).

**Goal:** Dashboard web del dueño, branded Atiko (negro/dorado), que consume `/api/panel`: login JWT, tabla de gastos con filtros por columna, descarga de Excel respetando filtros, gestión de empleados y ajustes de empresa.

**Architecture:** Página estática (HTML + JS vanilla, sin build) **servida por el propio backend de gastos** en `gastos.atikodigital.cl/panel` (mismo origen que la API → sin CORS). La lógica pura (armado de query string, formato CLP, render de filas/totales) se extrae a `public/panel/lib.js` (UMD: usable en el navegador vía `<script>` y require-able en jest) y se prueba con TDD. El `index.html` cablea login + fetch + filtros + descarga + empleados + ajustes (verificado por tests de ruta que confirman que el backend lo sirve y que contiene los marcadores esperados). Mismo patrón que el CRM Atiko (HTML branded gateado por token), pero servido por el backend para evitar CORS.

**Tech Stack:** HTML5 + CSS + JS vanilla (sin framework, sin build). Backend Express (Plan 1) sirve los estáticos. Tests: jest (suite del backend `gastos/`) + supertest.

---

## Convenciones

- Archivos del panel en **`gastos/public/panel/`** (`index.html`, `lib.js`, opcional `styles.css` inline en el html).
- Token del panel en `localStorage` bajo `atiko_gastos_panel_jwt` (separado del de la app).
- Base de la API: **relativa** (`/api/panel/...`) — mismo origen, sin CORS.
- Branding: negro `#0E0E0E`, dorado `#C9A24B` (consistente con la app y el CRM).
- Categorías del filtro: las 13 fijas (hardcodeadas en el `<select>`, mismas keys que `SII_ACCOUNTS` del backend).

---

## Estructura de archivos (Plan 5)

```
gastos/
  public/panel/
    lib.js          # UMD: fmtClp, buildQuery, escapeHtml, expensesTableHtml, totalsFromRows
    index.html      # panel branded: login + gastos(filtros+tabla+excel) + empleados + ajustes
  src/server.js     # (MODIFICAR) app.use('/panel', express.static(...))
  tests/panel/
    lib.test.js     # tests de lib.js (node jest)
    static.test.js  # supertest: /panel sirve el html + lib.js con los marcadores esperados
```

---

## Task 1: Lib del panel (helpers puros) + tests

**Files:**
- Create: `gastos/public/panel/lib.js`
- Test: `gastos/tests/panel/lib.test.js`

`lib.js` es UMD: expone `PanelLib` en `window` (navegador) y `module.exports` (jest). Sin DOM (las
funciones devuelven strings), así corre en el jest node del backend.

- [ ] **Step 1: Escribir el test que falla** `gastos/tests/panel/lib.test.js`:
```js
const PanelLib = require('../../public/panel/lib.js');

test('fmtClp formatea pesos chilenos', () => {
  expect(PanelLib.fmtClp(25000)).toBe('$25.000');
  expect(PanelLib.fmtClp(0)).toBe('$0');
  expect(PanelLib.fmtClp('1011500')).toBe('$1.011.500');
});

test('buildQuery arma solo los filtros no vacíos', () => {
  expect(PanelLib.buildQuery({ from: '2026-06-01', to: '', estado: 'confirmado', proveedor: '' }))
    .toBe('?from=2026-06-01&estado=confirmado');
  expect(PanelLib.buildQuery({})).toBe('');
  // codifica valores
  expect(PanelLib.buildQuery({ proveedor: 'a b' })).toBe('?proveedor=a%20b');
});

test('escapeHtml neutraliza tags', () => {
  expect(PanelLib.escapeHtml('<b>x</b>&"\'')).toBe('&lt;b&gt;x&lt;/b&gt;&amp;&quot;&#39;');
});

test('totalsFromRows suma neto/iva/total', () => {
  const rows = [{ neto: 100, iva: 19, total: 119 }, { neto: '200', iva: '38', total: '238' }];
  expect(PanelLib.totalsFromRows(rows)).toEqual({ neto: 300, iva: 57, total: 357 });
});

test('expensesTableHtml arma header + una fila por gasto y escapa', () => {
  const html = PanelLib.expensesTableHtml([
    { fecha: '2026-06-05', employee_id: 'e1', proveedor: '<Copec>', rut_emisor: '76086428-5', folio: '123',
      tipo_documento: 'boleta', categoria: 'Combustible y transporte', cuenta_sii_codigo: '4.3.150.1',
      neto: 21008, iva: 3992, total: 25000, estado: 'confirmado' },
  ]);
  expect(html).toContain('<table');
  expect(html).toContain('Proveedor');
  expect(html).toContain('&lt;Copec&gt;');         // escapado
  expect(html).toContain('$25.000');
  expect(html).toContain('4.3.150.1');
});
```

- [ ] **Step 2: Correr y verificar que falla.** `cd gastos && npx jest tests/panel/lib.test.js`

- [ ] **Step 3: Implementar** `gastos/public/panel/lib.js`:
```js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PanelLib = api;
})(typeof window !== 'undefined' ? window : null, function () {
  function fmtClp(n) {
    return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildQuery(filtros) {
    const f = filtros || {};
    const parts = [];
    for (const k of Object.keys(f)) {
      const v = f[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
      }
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function totalsFromRows(rows) {
    const acc = { neto: 0, iva: 0, total: 0 };
    for (const r of rows || []) {
      acc.neto += Number(r.neto) || 0;
      acc.iva += Number(r.iva) || 0;
      acc.total += Number(r.total) || 0;
    }
    return acc;
  }

  const COLS = [
    ['Fecha', 'fecha'], ['Empleado', 'employee_id'], ['Proveedor', 'proveedor'],
    ['RUT', 'rut_emisor'], ['Folio', 'folio'], ['Tipo', 'tipo_documento'],
    ['Categoría', 'categoria'], ['Cuenta SII', 'cuenta_sii_codigo'],
  ];
  const MONEY = [['Neto', 'neto'], ['IVA', 'iva'], ['Total', 'total']];

  function expensesTableHtml(rows) {
    const list = rows || [];
    const thead = '<thead><tr>'
      + COLS.map(([h]) => `<th>${h}</th>`).join('')
      + MONEY.map(([h]) => `<th class="num">${h}</th>`).join('')
      + '<th>Estado</th></tr></thead>';
    const body = list.map((r) => {
      const cells = COLS.map(([, k]) => `<td>${escapeHtml(r[k])}</td>`).join('')
        + MONEY.map(([, k]) => `<td class="num">${fmtClp(r[k])}</td>`).join('')
        + `<td>${escapeHtml(r.estado)}</td>`;
      return `<tr>${cells}</tr>`;
    }).join('');
    const t = totalsFromRows(list);
    const foot = `<tfoot><tr><td colspan="8" class="num"><b>Totales</b></td>`
      + `<td class="num"><b>${fmtClp(t.neto)}</b></td>`
      + `<td class="num"><b>${fmtClp(t.iva)}</b></td>`
      + `<td class="num"><b>${fmtClp(t.total)}</b></td><td></td></tr></tfoot>`;
    return `<table class="exp">${thead}<tbody>${body}</tbody>${foot}</table>`;
  }

  return { fmtClp, escapeHtml, buildQuery, totalsFromRows, expensesTableHtml };
});
```

- [ ] **Step 4: Correr y verificar que pasa.** `cd gastos && npx jest tests/panel/lib.test.js`

- [ ] **Step 5: Commit**
```bash
git add gastos/public/panel/lib.js gastos/tests/panel/lib.test.js
git commit -m "feat(gastos): lib del panel (fmtClp/buildQuery/tabla/totales) + tests"
```

---

## Task 2: Servir el panel + index.html (login, gastos, empleados, ajustes)

**Files:**
- Modify: `gastos/src/server.js` (servir estáticos del panel)
- Create: `gastos/public/panel/index.html`
- Test: `gastos/tests/panel/static.test.js`

- [ ] **Step 1: Escribir el test que falla** `gastos/tests/panel/static.test.js`:
```js
const request = require('supertest');
const { app } = require('../../src/server');

test('GET /panel/ sirve el html del panel branded', async () => {
  const res = await request(app).get('/panel/');
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/html/);
  expect(res.text).toContain('Atiko Gastos');
  // marcadores de las secciones del panel
  expect(res.text).toContain('id="loginView"');
  expect(res.text).toContain('id="appView"');
  expect(res.text).toContain('id="expensesTable"');
  expect(res.text).toContain('Descargar Excel');
  expect(res.text).toContain('id="employeesSection"');
  expect(res.text).toContain('id="settingsSection"');
});

test('GET /panel/lib.js sirve la lib', async () => {
  const res = await request(app).get('/panel/lib.js');
  expect(res.status).toBe(200);
  expect(res.text).toContain('PanelLib');
});
```

- [ ] **Step 2: Correr y verificar que falla.** `cd gastos && npx jest tests/panel/static.test.js`

- [ ] **Step 3: Montar estáticos en `gastos/src/server.js`.** Cerca del tope, asegurar `const path = require('path');` (agregarlo si no está). Después de la ruta `/health` (y antes del `if (require.main === module)`), agregar:
```js
app.use('/panel', express.static(path.join(__dirname, '..', 'public', 'panel')));
```

- [ ] **Step 4: Crear `gastos/public/panel/index.html`** (panel branded completo). Contenido EXACTO:
```html
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Atiko Gastos — Panel</title>
<style>
  :root { --gold:#C9A24B; --bg:#0E0E0E; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:#fff; font-family:system-ui,Segoe UI,sans-serif; }
  a { color:var(--gold); }
  .wrap { max-width:1100px; margin:0 auto; padding:16px; }
  header.top { display:flex; justify-content:space-between; align-items:center; padding:14px 16px; border-bottom:1px solid #ffffff1a; }
  .brand { color:var(--gold); font-weight:900; font-size:18px; }
  button { cursor:pointer; border:0; border-radius:10px; padding:10px 14px; font-weight:800; }
  .btn-gold { background:var(--gold); color:#000; }
  .btn-ghost { background:#ffffff14; color:#fff; }
  input, select { background:#ffffff10; color:#fff; border:1px solid #ffffff26; border-radius:10px; padding:9px 11px; }
  label { font-size:12px; opacity:.8; display:block; margin-bottom:3px; }
  .row { display:flex; gap:10px; flex-wrap:wrap; align-items:end; }
  .card { background:#ffffff08; border:1px solid #ffffff14; border-radius:14px; padding:14px; margin:12px 0; }
  table.exp { width:100%; border-collapse:collapse; font-size:13px; }
  table.exp th, table.exp td { text-align:left; padding:8px 10px; border-bottom:1px solid #ffffff12; white-space:nowrap; }
  table.exp th { color:var(--gold); position:sticky; top:0; background:#161616; }
  table.exp td.num, table.exp th.num { text-align:right; }
  .tabs { display:flex; gap:8px; margin:12px 0; }
  .tab { background:#ffffff10; }
  .tab.active { background:var(--gold); color:#000; }
  .hidden { display:none; }
  .err { color:#ff6b6b; font-size:13px; }
  .muted { opacity:.6; }
  .scroll { overflow:auto; max-height:62vh; border:1px solid #ffffff12; border-radius:12px; }
  .emp { display:flex; justify-content:space-between; align-items:center; padding:8px 10px; border-bottom:1px solid #ffffff12; }
</style>
</head>
<body>

<!-- LOGIN -->
<div id="loginView" class="wrap" style="max-width:380px;">
  <h1 class="brand" style="font-size:24px; margin-top:48px;">Atiko Gastos</h1>
  <p class="muted">Panel del dueño</p>
  <div class="card">
    <label for="email">Correo</label>
    <input id="email" type="email" style="width:100%" autocapitalize="none" />
    <label for="password" style="margin-top:10px">Contraseña</label>
    <input id="password" type="password" style="width:100%" />
    <p id="loginErr" class="err"></p>
    <button id="loginBtn" class="btn-gold" style="width:100%; margin-top:8px">Entrar</button>
  </div>
</div>

<!-- APP -->
<div id="appView" class="hidden">
  <header class="top">
    <span class="brand">Atiko Gastos</span>
    <button id="logoutBtn" class="btn-ghost">Salir</button>
  </header>
  <div class="wrap">
    <div class="tabs">
      <button class="tab active" data-tab="gastos">Gastos</button>
      <button class="tab" data-tab="empleados">Empleados</button>
      <button class="tab" data-tab="ajustes">Ajustes</button>
    </div>

    <!-- GASTOS -->
    <section id="gastosSection">
      <div class="card">
        <div class="row">
          <div><label>Desde</label><input id="fFrom" type="date" /></div>
          <div><label>Hasta</label><input id="fTo" type="date" /></div>
          <div><label>Categoría</label>
            <select id="fCategoria"><option value="">Todas</option></select>
          </div>
          <div><label>Estado</label>
            <select id="fEstado">
              <option value="">Todos</option>
              <option value="confirmado">Confirmado</option>
              <option value="pendiente_confirmacion">Pendiente</option>
              <option value="rechazado">Rechazado</option>
            </select>
          </div>
          <div><label>Proveedor</label><input id="fProveedor" placeholder="buscar…" /></div>
          <button id="applyBtn" class="btn-gold">Aplicar</button>
          <button id="excelBtn" class="btn-ghost">Descargar Excel</button>
        </div>
      </div>
      <div id="expensesTable" class="scroll"><p class="muted" style="padding:16px">Cargando…</p></div>
    </section>

    <!-- EMPLEADOS -->
    <section id="employeesSection" class="hidden">
      <div class="card">
        <h3 style="margin-top:0">Agregar empleado</h3>
        <div class="row">
          <div><label>Nombre</label><input id="eNombre" /></div>
          <div><label>WhatsApp (E.164)</label><input id="ePhone" placeholder="569…" /></div>
          <div><label>Usuario (app)</label><input id="eUsuario" autocapitalize="none" /></div>
          <div><label>Contraseña (app)</label><input id="ePassword" type="password" /></div>
          <button id="addEmpBtn" class="btn-gold">Agregar</button>
        </div>
        <p id="empErr" class="err"></p>
      </div>
      <div id="empList" class="card"><p class="muted">Cargando…</p></div>
    </section>

    <!-- AJUSTES -->
    <section id="settingsSection" class="hidden">
      <div class="card">
        <h3 style="margin-top:0">Empresa</h3>
        <div class="row">
          <div><label>Nombre</label><input id="cNombre" /></div>
          <div><label>RUT</label><input id="cRut" /></div>
          <div><label>WhatsApp del dueño</label><input id="cOwnerWa" placeholder="569…" /></div>
          <div><label>Resumen</label>
            <select id="cFreq">
              <option value="diario">Diario</option>
              <option value="semanal">Semanal</option>
              <option value="mensual">Mensual</option>
            </select>
          </div>
          <button id="saveCompanyBtn" class="btn-gold">Guardar</button>
        </div>
        <p id="settingsMsg" class="muted"></p>
      </div>
    </section>
  </div>
</div>

<script src="lib.js"></script>
<script>
(function () {
  var TOKEN_KEY = 'atiko_gastos_panel_jwt';
  var CATEGORIES = [
    'Mercadería e insumos del giro','Alimentación y representación','Combustible y transporte',
    'Mantención y reparaciones','Arriendos','Servicios básicos','Útiles de oficina / generales',
    'Seguros','Publicidad y promoción','Honorarios','Contribuciones, patentes e impuestos',
    'Gastos financieros','Otros gastos'
  ];
  var $ = function (id) { return document.getElementById(id); };
  function token() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function setToken(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch (e) {} }
  function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  async function apiFetch(path, opts) {
    opts = opts || {};
    var headers = opts.headers || {};
    var t = token();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    if (opts.body && !(opts.body instanceof Blob)) headers['Content-Type'] = 'application/json';
    var res = await fetch('/api/panel' + path, { method: opts.method || 'GET', headers: headers, body: opts.body });
    if (res.status === 401) { clearToken(); showLogin(); throw new Error('401'); }
    return res;
  }

  function showLogin() { $('loginView').classList.remove('hidden'); $('appView').classList.add('hidden'); }
  function showApp() { $('loginView').classList.add('hidden'); $('appView').classList.remove('hidden'); loadGastos(); }

  // ---- Login
  $('loginBtn').onclick = async function () {
    $('loginErr').textContent = '';
    try {
      var res = await fetch('/api/panel/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: $('email').value, password: $('password').value })
      });
      if (!res.ok) throw new Error('bad');
      var data = await res.json();
      setToken(data.token);
      showApp();
    } catch (e) { $('loginErr').textContent = 'Correo o contraseña incorrectos.'; }
  };
  $('logoutBtn').onclick = function () { clearToken(); showLogin(); };

  // ---- Tabs
  var tabs = document.querySelectorAll('.tab');
  tabs.forEach(function (b) {
    b.onclick = function () {
      tabs.forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      var tab = b.getAttribute('data-tab');
      $('gastosSection').classList.toggle('hidden', tab !== 'gastos');
      $('employeesSection').classList.toggle('hidden', tab !== 'empleados');
      $('settingsSection').classList.toggle('hidden', tab !== 'ajustes');
      if (tab === 'empleados') loadEmpleados();
      if (tab === 'ajustes') loadCompany();
    };
  });

  // ---- Categorías en el filtro
  CATEGORIES.forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; $('fCategoria').appendChild(o);
  });

  // ---- Gastos
  function currentFilters() {
    return { from: $('fFrom').value, to: $('fTo').value, categoria: $('fCategoria').value,
             estado: $('fEstado').value, proveedor: $('fProveedor').value };
  }
  async function loadGastos() {
    $('expensesTable').innerHTML = '<p class="muted" style="padding:16px">Cargando…</p>';
    try {
      var res = await apiFetch('/expenses' + PanelLib.buildQuery(currentFilters()));
      var rows = await res.json();
      $('expensesTable').innerHTML = rows.length ? PanelLib.expensesTableHtml(rows)
        : '<p class="muted" style="padding:16px">Sin gastos para esos filtros.</p>';
    } catch (e) { if (e.message !== '401') $('expensesTable').innerHTML = '<p class="err" style="padding:16px">Error al cargar.</p>'; }
  }
  $('applyBtn').onclick = loadGastos;
  $('excelBtn').onclick = async function () {
    try {
      var res = await apiFetch('/expenses.xlsx' + PanelLib.buildQuery(currentFilters()));
      var blob = await res.blob();
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url; a.download = 'gastos.xlsx';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) {}
  };

  // ---- Empleados
  async function loadEmpleados() {
    $('empList').innerHTML = '<p class="muted">Cargando…</p>';
    try {
      var res = await apiFetch('/employees');
      var emps = await res.json();
      $('empList').innerHTML = emps.length ? emps.map(function (e) {
        return '<div class="emp"><div><b>' + PanelLib.escapeHtml(e.nombre) + '</b> '
          + '<span class="muted">' + PanelLib.escapeHtml(e.usuario || '') + ' · ' + PanelLib.escapeHtml(e.phone || '') + '</span></div>'
          + '<button class="btn-ghost" data-del="' + e.id + '">' + (e.activo ? 'Desactivar' : 'Inactivo') + '</button></div>';
      }).join('') : '<p class="muted">Sin empleados.</p>';
      $('empList').querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = async function () {
          await apiFetch('/employees/' + b.getAttribute('data-del'), { method: 'DELETE' });
          loadEmpleados();
        };
      });
    } catch (e) {}
  }
  $('addEmpBtn').onclick = async function () {
    $('empErr').textContent = '';
    try {
      var res = await apiFetch('/employees', { method: 'POST', body: JSON.stringify({
        nombre: $('eNombre').value, phone: $('ePhone').value, usuario: $('eUsuario').value, password: $('ePassword').value }) });
      if (!res.ok) throw new Error('bad');
      $('eNombre').value = $('ePhone').value = $('eUsuario').value = $('ePassword').value = '';
      loadEmpleados();
    } catch (e) { $('empErr').textContent = 'Falta el nombre (mínimo).'; }
  };

  // ---- Empresa
  async function loadCompany() {
    try {
      var res = await apiFetch('/company');
      var c = await res.json();
      $('cNombre').value = c.nombre || ''; $('cRut').value = c.rut || '';
      $('cOwnerWa').value = c.owner_whatsapp || ''; $('cFreq').value = c.resumen_frecuencia || 'mensual';
    } catch (e) {}
  }
  $('saveCompanyBtn').onclick = async function () {
    $('settingsMsg').textContent = '';
    try {
      await apiFetch('/company', { method: 'PATCH', body: JSON.stringify({
        nombre: $('cNombre').value, rut: $('cRut').value,
        owner_whatsapp: $('cOwnerWa').value, resumen_frecuencia: $('cFreq').value }) });
      $('settingsMsg').textContent = 'Guardado ✓';
    } catch (e) { $('settingsMsg').textContent = 'No se pudo guardar.'; }
  };

  // ---- Arranque
  if (token()) showApp(); else showLogin();
})();
</script>
</body>
</html>
```

- [ ] **Step 5: Correr y verificar que pasa.** `cd gastos && npx jest tests/panel/static.test.js`

- [ ] **Step 6: Confirmar que el health test sigue verde** (montar estáticos no debe romper nada): `cd gastos && npx jest tests/server.test.js`.

- [ ] **Step 7: Correr TODA la suite.** `cd gastos && npx jest` — todo verde.

- [ ] **Step 8: Commit**
```bash
git add gastos/src/server.js gastos/public/panel/index.html gastos/tests/panel/static.test.js
git commit -m "feat(gastos): panel web del dueño (login + gastos/filtros/excel + empleados + ajustes) servido en /panel"
```

---

## Cierre del Plan 5

Al terminar: el backend de gastos sirve un panel branded en `gastos.atikodigital.cl/panel` con login
del dueño, tabla de gastos filtrable, descarga de Excel (respetando filtros, vía fetch autenticado +
blob), gestión de empleados (alta/baja con credenciales de app) y ajustes de empresa — todo
mismo-origen contra `/api/panel`. Lib pura testeada; el HTML verificado servido con sus secciones.

**Pendiente para Plan 6:**
- Deploy: el panel viaja con el backend (`/root/atiko-gastos/public/panel`) — `deploy-gastos.js` debe incluir `public/`.
- Hardening de los routers (`/api/panel` sin rate-limit; el panel asume mismo-origen).
- Mejora: nombre del empleado en la tabla/Excel (hoy `employee_id` UUID — requiere join en `listExpenses`).
- Mejora: editar/borrar gasto desde el panel; paginación si hay miles.
