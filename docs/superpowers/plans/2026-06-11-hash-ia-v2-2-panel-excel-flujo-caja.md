# Hash IA v2-2 — Panel + Excel: flujo de caja, período y cobranzas (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el panel y el Excel muestren gastos e ingresos con saldo, filtro por tipo y por período (mes/año), columnas de cobranzas (pagador + quién envió), y permitan marcar un gasto como pagado.

**Architecture:** Cambios aditivos sobre el panel existente (página estática servida por el backend + API `/api/panel`). `query.js` gana filtros `tipo`/`periodo` y un JOIN para el nombre del empleado. `excel.js` gana columnas v2. `lib.js` (UMD, testeable en jest) gana el cálculo de saldo y el render de la columna Tipo + botón pagar. El router del panel gana el endpoint "marcar pagada". `index.html` cablea la UI nueva.

**Tech Stack:** Node/Express, jest, pg-mem v3, exceljs, panel HTML/JS vanilla (UMD lib).

---

## File Structure

- `gastos/src/expenses/query.js` — **Modify**: filtros `tipo` + `periodo` (YYYY-MM) + JOIN `empleado_nombre`.
- `gastos/src/expenses/repo.js` — **Modify**: `markExpensePaid(db, companyId, id)`.
- `gastos/src/panel/router.js` — **Modify**: `parseFiltros` (tipo/periodo/estadoPago) + `PATCH /expenses/:id/pagar`.
- `gastos/src/panel/excel.js` — **Modify**: columnas Tipo, Fecha emisión/carga, Pagador, N° operación, Estado pago, Enviado por (WA), Empleado por nombre.
- `gastos/public/panel/lib.js` — **Modify**: `cashflowFromRows` (saldo) + `expensesTableHtml` con Tipo, empleado_nombre y botón "marcar pagada".
- `gastos/public/panel/index.html` — **Modify**: filtro Tipo + Período, tarjeta de saldo, cableado del botón pagar.

**Nota:** Tareas 1-4 son TDD puro. La Tarea 5 (index.html) es UI: se valida corriendo el test estático existente + verificación manual.

---

### Task 1: `query.js` — filtros tipo/período + nombre de empleado

**Files:**
- Modify: `gastos/src/expenses/query.js`
- Test: `gastos/tests/query-v2.test.js` (crear)
- Possibly update: existing `gastos/tests/**query*.test.js` if it asserts exact row shape.

- [ ] **Step 1: Crear `gastos/tests/query-v2.test.js`:**

```js
const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
const { createExpense } = require('../src/expenses/repo');
const { createEmployee } = require('../src/companies/repo');
const { listExpenses, periodoRange } = require('../src/expenses/query');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}

test('periodoRange convierte YYYY-MM a rango de mes', () => {
  expect(periodoRange('2026-06')).toEqual({ from: '2026-06-01', to: '2026-06-30' });
  expect(periodoRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  expect(periodoRange('')).toBeNull();
  expect(periodoRange('basura')).toBeNull();
});

test('filtra por tipo y por período, y trae empleado_nombre', async () => {
  const db = await makeDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const cid = c.rows[0].id;
  const emp = await createEmployee(db, { company_id: cid, nombre: 'Juan', activo: true });
  await createExpense(db, { company_id: cid, employee_id: emp.id, tipo: 'gasto', proveedor: 'Sodimac', fecha: '2026-06-10', total: 11900 });
  await createExpense(db, { company_id: cid, employee_id: emp.id, tipo: 'ingreso', proveedor: 'Cliente A', fecha: '2026-06-12', total: 50000 });
  await createExpense(db, { company_id: cid, employee_id: emp.id, tipo: 'gasto', proveedor: 'Mayo SA', fecha: '2026-05-01', total: 3000 });

  const ingresos = await listExpenses(db, cid, { tipo: 'ingreso' });
  expect(ingresos).toHaveLength(1);
  expect(ingresos[0].proveedor).toBe('Cliente A');
  expect(ingresos[0].empleado_nombre).toBe('Juan');

  const junio = await listExpenses(db, cid, { periodo: '2026-06' });
  expect(junio).toHaveLength(2);
  const proveedores = junio.map((r) => r.proveedor).sort();
  expect(proveedores).toEqual(['Cliente A', 'Sodimac']);

  const todos = await listExpenses(db, cid, {});
  expect(todos).toHaveLength(3);
});
```

- [ ] **Step 2: Run** `cd gastos && npx jest tests/query-v2.test.js` — Expected: FAIL (`periodoRange` no existe / sin `empleado_nombre`).

- [ ] **Step 3: Reemplazar el contenido de `gastos/src/expenses/query.js` por:**

```js
// Convierte 'YYYY-MM' a { from, to } (primer y último día del mes). null si no aplica.
function periodoRange(periodo) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(periodo || ''));
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const lastDay = new Date(year, month, 0).getDate(); // día 0 del mes siguiente = último del mes
  return { from: `${m[1]}-${m[2]}-01`, to: `${m[1]}-${m[2]}-${String(lastDay).padStart(2, '0')}` };
}

// Lista movimientos de UNA empresa con filtros opcionales. Siempre acotado por company_id.
async function listExpenses(db, companyId, filtros = {}) {
  const where = ['e.company_id = $1'];
  const vals = [companyId];
  const add = (sql, val) => { vals.push(val); where.push(sql.replace('?', `$${vals.length}`)); };

  const periodo = periodoRange(filtros.periodo);
  const from = periodo ? periodo.from : filtros.from;
  const to = periodo ? periodo.to : filtros.to;

  if (from) add('e.fecha >= ?', from);
  if (to) add('e.fecha <= ?', to);
  if (filtros.empleadoId) add('e.employee_id = ?', filtros.empleadoId);
  if (filtros.categoria) add('e.categoria = ?', filtros.categoria);
  if (filtros.estado) add('e.estado = ?', filtros.estado);
  if (filtros.estadoPago) add('e.estado_pago = ?', filtros.estadoPago);
  if (filtros.tipo === 'gasto' || filtros.tipo === 'ingreso') add('e.tipo = ?', filtros.tipo);
  if (filtros.tipoDocumento) add('e.tipo_documento = ?', filtros.tipoDocumento);
  if (filtros.proveedor) add('e.proveedor ILIKE ?', `%${filtros.proveedor}%`);

  const r = await db.query(
    `SELECT e.*, emp.nombre AS empleado_nombre
     FROM expenses e
     LEFT JOIN employees emp ON emp.id = e.employee_id
     WHERE ${where.join(' AND ')}
     ORDER BY e.fecha DESC, e.created_at DESC LIMIT 1000`,
    vals
  );
  return r.rows;
}

module.exports = { listExpenses, periodoRange };
```

- [ ] **Step 4: Run** `cd gastos && npx jest tests/query-v2.test.js` — Expected: PASS (2 tests).

- [ ] **Step 5: Run full suite** `cd gastos && npx jest`. If an existing query/panel-router test asserts an exact row object (now with extra `empleado_nombre`), relax it to `toMatchObject` or add the field. Don't weaken meaningful assertions. Expected: green.

- [ ] **Step 6: Commit**

```bash
git add gastos/src/expenses/query.js gastos/tests/query-v2.test.js
git commit -m "feat(gastos): query con filtro tipo/periodo y nombre de empleado"
```

---

### Task 2: "Marcar pagada" — repo + endpoint del panel

**Files:**
- Modify: `gastos/src/expenses/repo.js` (add `markExpensePaid`)
- Modify: `gastos/src/panel/router.js` (add `PATCH /expenses/:id/pagar` + parseFiltros)
- Test: `gastos/tests/panel-pagar.test.js` (crear)

- [ ] **Step 1: Crear `gastos/tests/panel-pagar.test.js`:**

```js
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
const { createPanelRouter } = require('../src/panel/router');
const { createExpense } = require('../src/expenses/repo');
const { createUser } = require('../src/users/repo');
const { hashPassword } = require('../src/auth/password');

async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const cid = c.rows[0].id;
  await createUser(db, { company_id: cid, email: 'o@x.cl', password_hash: await hashPassword('p'), rol: 'owner' });
  const exp = await createExpense(db, { company_id: cid, tipo: 'gasto', proveedor: 'Sodimac', total: 11900, estado: 'confirmado' });
  const app = express();
  app.use(express.json());
  app.use('/api/panel', createPanelRouter({ db }));
  const login = await request(app).post('/api/panel/login').send({ email: 'o@x.cl', password: 'p' });
  return { app, db, cid, expId: exp.id, token: login.body.token, otherCompany: async () => {
    const r = await db.query("INSERT INTO companies(nombre) VALUES('Y') RETURNING id"); return r.rows[0].id;
  } };
}

test('PATCH /expenses/:id/pagar marca estado_pago=pagada', async () => {
  const { app, token, expId } = await setup();
  const res = await request(app).patch('/api/panel/expenses/' + expId + '/pagar').set('Authorization', 'Bearer ' + token);
  expect(res.status).toBe(200);
  expect(res.body.estado_pago).toBe('pagada');
});

test('no puede pagar un gasto de otra empresa → 404', async () => {
  const { app, token, db, otherCompany } = await setup();
  const cid2 = await otherCompany();
  const ajeno = await createExpense(db, { company_id: cid2, tipo: 'gasto', total: 1000 });
  const res = await request(app).patch('/api/panel/expenses/' + ajeno.id + '/pagar').set('Authorization', 'Bearer ' + token);
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: Run** `cd gastos && npx jest tests/panel-pagar.test.js` — Expected: FAIL (endpoint no existe).

- [ ] **Step 3: En `gastos/src/expenses/repo.js`**, agregar la función antes de `module.exports` y exportarla:

```js
async function markExpensePaid(db, companyId, id) {
  const r = await db.query(
    "UPDATE expenses SET estado_pago='pagada' WHERE id=$1 AND company_id=$2 RETURNING *",
    [id, companyId]
  );
  return r.rows[0] || null;
}
```

Y en el `module.exports` de `repo.js`, agregar `markExpensePaid`:

```js
module.exports = { createExpense, getExpense, confirmExpense, updateExpense, getLatestPending, rejectExpense, markExpensePaid };
```

- [ ] **Step 4: En `gastos/src/panel/router.js`:**

(a) Cambiar el import de repo para incluir `markExpensePaid`. La línea actual es `const { listExpenses } = require('../expenses/query');` — NO esa. Agregar un require nuevo arriba (después de la línea de `query`):

```js
const { markExpensePaid } = require('../expenses/repo');
```

(b) Reemplazar `parseFiltros` por:

```js
function parseFiltros(q = {}) {
  return {
    from: q.from, to: q.to, periodo: q.periodo, empleadoId: q.empleadoId, categoria: q.categoria,
    estado: q.estado, estadoPago: q.estadoPago, tipo: q.tipo, tipoDocumento: q.tipoDocumento, proveedor: q.proveedor,
  };
}
```

(c) Agregar el endpoint justo después del handler `router.get('/expenses.xlsx', ...)` (antes de `router.get('/employees', ...)`):

```js
  router.patch('/expenses/:id/pagar', async (req, res) => {
    const upd = await markExpensePaid(db, req.auth.companyId, req.params.id);
    if (!upd) return res.status(404).json({ error: 'no_existe' });
    return res.json(upd);
  });
```

- [ ] **Step 5: Run** `cd gastos && npx jest tests/panel-pagar.test.js` — Expected: PASS (2 tests).

- [ ] **Step 6: Run full suite** `cd gastos && npx jest` — Expected: green.

- [ ] **Step 7: Commit**

```bash
git add gastos/src/expenses/repo.js gastos/src/panel/router.js gastos/tests/panel-pagar.test.js
git commit -m "feat(gastos): endpoint marcar gasto pagado (estado_pago) + filtros tipo/periodo"
```

---

### Task 3: `excel.js` — columnas v2 (tipo, fechas, cobranzas, estado pago)

**Files:**
- Modify: `gastos/src/panel/excel.js`
- Test: `gastos/tests/excel-v2.test.js` (crear)
- Possibly update: existing `gastos/tests/**excel*.test.js` if it asserts old COLUMNS.

- [ ] **Step 1: Crear `gastos/tests/excel-v2.test.js`:**

```js
const ExcelJS = require('exceljs');
const { buildExpensesWorkbook } = require('../src/panel/excel');

test('excel incluye columnas v2 y mapea los datos', async () => {
  const buf = await buildExpensesWorkbook([{
    tipo: 'ingreso', fecha: '2026-06-01', created_at: '2026-06-02T10:00:00Z',
    empleado_nombre: 'Jose', proveedor: 'Cliente A', rut_emisor: '', folio: '',
    nro_operacion: 'OP-9', tipo_documento: 'transferencia', categoria: 'Ingreso',
    cuenta_sii_codigo: '', neto: 0, iva: 0, total: 50000, estado: 'confirmado',
    estado_pago: 'registrada', wa_sender_name: 'Juan', wa_sender_phone: '56999',
  }]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet('Gastos');
  const headers = ws.getRow(1).values.filter(Boolean);
  expect(headers).toEqual(expect.arrayContaining([
    'Tipo', 'Fecha emisión', 'Fecha carga', 'Empleado', 'N° operación', 'Estado pago', 'Enviado por (WA)',
  ]));
  const row2 = {};
  ws.getRow(1).eachCell((cell, col) => { row2[cell.value] = ws.getRow(2).getCell(col).value; });
  expect(row2['Tipo']).toBe('ingreso');
  expect(row2['Empleado']).toBe('Jose');
  expect(row2['Fecha carga']).toBe('2026-06-02');
  expect(row2['Enviado por (WA)']).toBe('Juan · 56999');
  expect(Number(row2['Total'])).toBe(50000);
});
```

- [ ] **Step 2: Run** `cd gastos && npx jest tests/excel-v2.test.js` — Expected: FAIL.

- [ ] **Step 3: Reemplazar el contenido de `gastos/src/panel/excel.js` por:**

```js
const ExcelJS = require('exceljs');

const COLUMNS = [
  { header: 'Tipo', key: 'tipo', width: 10 },
  { header: 'Fecha emisión', key: 'fecha', width: 13 },
  { header: 'Fecha carga', key: 'fecha_carga', width: 13 },
  { header: 'Empleado', key: 'empleado', width: 18 },
  { header: 'Proveedor/Pagador', key: 'proveedor', width: 24 },
  { header: 'RUT', key: 'rut_emisor', width: 14 },
  { header: 'Folio', key: 'folio', width: 12 },
  { header: 'N° operación', key: 'nro_operacion', width: 14 },
  { header: 'Doc', key: 'tipo_documento', width: 12 },
  { header: 'Categoría', key: 'categoria', width: 26 },
  { header: 'Cuenta SII', key: 'cuenta_sii_codigo', width: 12 },
  { header: 'Neto', key: 'neto', width: 12 },
  { header: 'IVA', key: 'iva', width: 12 },
  { header: 'Total', key: 'total', width: 12 },
  { header: 'Estado', key: 'estado', width: 16 },
  { header: 'Estado pago', key: 'estado_pago', width: 14 },
  { header: 'Enviado por (WA)', key: 'wa_sender', width: 22 },
];

function fechaCarga(v) {
  if (!v) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return s.slice(0, 10);
}

async function buildExpensesWorkbook(expenses = []) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Gastos');
  ws.columns = COLUMNS;
  ws.getRow(1).font = { bold: true };
  for (const e of expenses) {
    ws.addRow({
      tipo: e.tipo || 'gasto',
      fecha: e.fecha || '',
      fecha_carga: fechaCarga(e.created_at),
      empleado: e.empleado_nombre || e.empleado || e.employee_id || '',
      proveedor: e.proveedor || '',
      rut_emisor: e.rut_emisor || '',
      folio: e.folio || '',
      nro_operacion: e.nro_operacion || '',
      tipo_documento: e.tipo_documento || '',
      categoria: e.categoria || '',
      cuenta_sii_codigo: e.cuenta_sii_codigo || '',
      neto: Number(e.neto) || 0,
      iva: Number(e.iva) || 0,
      total: Number(e.total) || 0,
      estado: e.estado || '',
      estado_pago: e.estado_pago || '',
      wa_sender: [e.wa_sender_name, e.wa_sender_phone].filter(Boolean).join(' · '),
    });
  }
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

module.exports = { buildExpensesWorkbook, COLUMNS };
```

- [ ] **Step 4: Run** `cd gastos && npx jest tests/excel-v2.test.js` — Expected: PASS.

- [ ] **Step 5: Run full suite** `cd gastos && npx jest`. If an existing excel test asserts the OLD column set/length, update it to the new headers. Expected: green.

- [ ] **Step 6: Commit**

```bash
git add gastos/src/panel/excel.js gastos/tests/excel-v2.test.js
git commit -m "feat(gastos): Excel con tipo, fechas, cobranzas y estado de pago"
```

---

### Task 4: `lib.js` — saldo + tabla con Tipo y botón pagar

**Files:**
- Modify: `gastos/public/panel/lib.js`
- Test: `gastos/tests/panel/lib-v2.test.js` (crear)
- Update: existing `gastos/tests/panel/lib.test.js` if it asserts the old table HTML (column count/headers changed).

- [ ] **Step 1: Crear `gastos/tests/panel/lib-v2.test.js`:**

```js
const PanelLib = require('../../public/panel/lib');

test('cashflowFromRows separa gastos e ingresos y calcula saldo', () => {
  const c = PanelLib.cashflowFromRows([
    { tipo: 'ingreso', total: 50000 },
    { tipo: 'gasto', total: 11900 },
    { tipo: 'gasto', total: 3000 },
  ]);
  expect(c.ingresos).toBe(50000);
  expect(c.gastos).toBe(14900);
  expect(c.saldo).toBe(35100);
});

test('expensesTableHtml muestra columna Tipo, nombre de empleado y botón pagar', () => {
  const html = PanelLib.expensesTableHtml([
    { id: 'a1', tipo: 'gasto', fecha: '2026-06-01', empleado_nombre: 'Juan', proveedor: 'Sodimac', total: 11900, estado: 'confirmado', estado_pago: 'registrada' },
  ]);
  expect(html).toContain('Tipo');
  expect(html).toContain('Juan');
  expect(html).toContain('data-pay="a1"');
  expect(html).toContain('Marcar pagada');
});

test('expensesTableHtml: gasto pagado no muestra botón; ingreso muestra raya', () => {
  const pagado = PanelLib.expensesTableHtml([{ id: 'a', tipo: 'gasto', estado_pago: 'pagada', total: 1000 }]);
  expect(pagado).toContain('Pagada');
  expect(pagado).not.toContain('data-pay');
  const ingreso = PanelLib.expensesTableHtml([{ id: 'b', tipo: 'ingreso', total: 5000 }]);
  expect(ingreso).not.toContain('data-pay');
});
```

- [ ] **Step 2: Run** `cd gastos && npx jest tests/panel/lib-v2.test.js` — Expected: FAIL.

- [ ] **Step 3: En `gastos/public/panel/lib.js`**, reemplazar el bloque desde `const COLS = [ ... ]` hasta el final del `function expensesTableHtml(...) { ... }` (incluyendo `MONEY`) por:

```js
  const COLS = [
    ['Tipo', 'tipo'], ['Fecha', 'fecha'], ['Empleado', 'empleado_nombre'], ['Proveedor', 'proveedor'],
    ['RUT', 'rut_emisor'], ['Folio', 'folio'], ['N° oper.', 'nro_operacion'], ['Categoría', 'categoria'],
  ];
  const MONEY = [['Neto', 'neto'], ['IVA', 'iva'], ['Total', 'total']];

  function cashflowFromRows(rows) {
    const acc = { gastos: 0, ingresos: 0, saldo: 0, countGastos: 0, countIngresos: 0 };
    for (const r of rows || []) {
      const total = Number(r.total) || 0;
      if (r.tipo === 'ingreso') { acc.ingresos += total; acc.countIngresos += 1; }
      else { acc.gastos += total; acc.countGastos += 1; }
    }
    acc.saldo = acc.ingresos - acc.gastos;
    return acc;
  }

  function pagoCell(r) {
    if (r.tipo === 'ingreso') return '—';
    if (r.estado_pago === 'pagada') return '✅ Pagada';
    return '<button class="btn-ghost btn-pay" data-pay="' + escapeHtml(r.id) + '">Marcar pagada</button>';
  }

  function expensesTableHtml(rows) {
    const list = rows || [];
    const thead = '<thead><tr>'
      + COLS.map(function (c) { return '<th>' + c[0] + '</th>'; }).join('')
      + MONEY.map(function (c) { return '<th class="num">' + c[0] + '</th>'; }).join('')
      + '<th>Estado</th><th>Pago</th></tr></thead>';
    const body = list.map(function (r) {
      const cells = COLS.map(function (c) { return '<td>' + escapeHtml(r[c[1]]) + '</td>'; }).join('')
        + MONEY.map(function (c) { return '<td class="num">' + fmtClp(r[c[1]]) + '</td>'; }).join('')
        + '<td>' + escapeHtml(r.estado) + '</td>'
        + '<td>' + pagoCell(r) + '</td>';
      return '<tr>' + cells + '</tr>';
    }).join('');
    const t = totalsFromRows(list);
    const foot = '<tfoot><tr><td colspan="8" class="num"><b>Totales</b></td>'
      + '<td class="num"><b>' + fmtClp(t.neto) + '</b></td>'
      + '<td class="num"><b>' + fmtClp(t.iva) + '</b></td>'
      + '<td class="num"><b>' + fmtClp(t.total) + '</b></td><td></td><td></td></tr></tfoot>';
    return '<table class="exp">' + thead + '<tbody>' + body + '</tbody>' + foot + '</table>';
  }

  return { fmtClp, escapeHtml, buildQuery, totalsFromRows, cashflowFromRows, expensesTableHtml };
```

(Esto reemplaza el `COLS`/`MONEY`/`expensesTableHtml`/`return {...}` anteriores. `fmtClp`, `escapeHtml`, `buildQuery`, `totalsFromRows` quedan iguales arriba.)

- [ ] **Step 4: Run** `cd gastos && npx jest tests/panel/lib-v2.test.js` — Expected: PASS (3 tests).

- [ ] **Step 5: Run full suite** `cd gastos && npx jest`. Update `tests/panel/lib.test.js` if it asserted the old table (e.g., old headers like "Empleado"→employee_id, or column counts). Keep assertions meaningful (e.g., it can still check that `expensesTableHtml` escapes XSS and renders totals). Expected: green.

- [ ] **Step 6: Commit**

```bash
git add gastos/public/panel/lib.js gastos/tests/panel/lib-v2.test.js
git commit -m "feat(gastos): panel lib con saldo (cashflow) y columna Tipo + boton pagar"
```

---

### Task 5: `index.html` — filtro Tipo/Período, tarjeta de saldo, botón pagar

**Files:**
- Modify: `gastos/public/panel/index.html`
- Verify: `gastos/tests/panel/static.test.js` (existente) sigue verde; verificación manual del panel.

- [ ] **Step 1:** Agregar los filtros Tipo y Período. En `index.html`, dentro del `<div class="row">` de la sección GASTOS, después del `<div><label>Proveedor</label>...</div>` y antes de `<button id="applyBtn" ...>`, insertar:

```html
          <div><label>Tipo</label>
            <select id="fTipo">
              <option value="">Todos</option>
              <option value="gasto">Gastos</option>
              <option value="ingreso">Ingresos</option>
            </select>
          </div>
          <div><label>Período</label><input id="fPeriodo" type="month" /></div>
```

- [ ] **Step 2:** Agregar la tarjeta de saldo. Justo antes de `<div id="expensesTable" class="scroll">`, insertar:

```html
      <div id="saldoCard" class="card hidden">
        <div class="row" style="gap:28px">
          <div><label>Ingresos</label><div id="sIngresos" style="font-size:20px;font-weight:900;color:#7CFC9B">$0</div></div>
          <div><label>Gastos</label><div id="sGastos" style="font-size:20px;font-weight:900;color:#ff8a8a">$0</div></div>
          <div><label>Saldo</label><div id="sSaldo" style="font-size:20px;font-weight:900;color:var(--gold)">$0</div></div>
        </div>
      </div>
```

- [ ] **Step 3:** Reemplazar la función `currentFilters` por:

```js
  function currentFilters() {
    return { from: $('fFrom').value, to: $('fTo').value, periodo: $('fPeriodo').value,
             tipo: $('fTipo').value, categoria: $('fCategoria').value,
             estado: $('fEstado').value, proveedor: $('fProveedor').value };
  }
```

- [ ] **Step 4:** Reemplazar la función `loadGastos` por (y agregar `renderSaldo` + `wirePayButtons` justo después):

```js
  async function loadGastos() {
    $('expensesTable').innerHTML = '<p class="muted" style="padding:16px">Cargando…</p>';
    try {
      var res = await apiFetch('/expenses' + PanelLib.buildQuery(currentFilters()));
      var rows = await res.json();
      renderSaldo(rows);
      $('expensesTable').innerHTML = rows.length ? PanelLib.expensesTableHtml(rows)
        : '<p class="muted" style="padding:16px">Sin movimientos para esos filtros.</p>';
      wirePayButtons();
    } catch (e) { if (e.message !== '401') $('expensesTable').innerHTML = '<p class="err" style="padding:16px">Error al cargar.</p>'; }
  }
  function renderSaldo(rows) {
    var c = PanelLib.cashflowFromRows(rows);
    $('sIngresos').textContent = PanelLib.fmtClp(c.ingresos);
    $('sGastos').textContent = PanelLib.fmtClp(c.gastos);
    $('sSaldo').textContent = PanelLib.fmtClp(c.saldo);
    $('saldoCard').classList.toggle('hidden', !rows.length);
  }
  function wirePayButtons() {
    $('expensesTable').querySelectorAll('[data-pay]').forEach(function (b) {
      b.onclick = async function () {
        b.disabled = true;
        try { await apiFetch('/expenses/' + b.getAttribute('data-pay') + '/pagar', { method: 'PATCH' }); loadGastos(); }
        catch (e) { b.disabled = false; }
      };
    });
  }
```

- [ ] **Step 5:** Run `cd gastos && npx jest tests/panel/static.test.js` (and the full suite). If the static test asserts specific content that you changed, update it minimally. Expected: green. Then do a manual check (load `index.html` logic): the filter row shows Tipo + Período; loading rows shows the saldo card and a Tipo column; clicking "Marcar pagada" on a gasto calls the endpoint and reloads.

- [ ] **Step 6: Commit**

```bash
git add gastos/public/panel/index.html
# include gastos/tests/panel/static.test.js if modified
git commit -m "feat(gastos): panel UI con filtro tipo/periodo, tarjeta saldo y marcar pagada"
```

---

## Self-Review

**Spec coverage (v2-2):**
- Filtro gastos/ingresos → Task 1 (query) + Task 5 (UI). ✅
- Saldo (Σ ingresos − Σ gastos) → Task 4 (cashflowFromRows) + Task 5 (tarjeta). ✅
- Filtro por período mes/año → Task 1 (periodoRange) + Task 5 (input month). ✅
- Columnas de cobranzas (pagador = proveedor; enviado por = wa_sender) → Task 3 (Excel) + Task 4 (tabla muestra proveedor; el detalle de envío va al Excel). ✅
- Botón "marcar pagada" → Task 2 (endpoint) + Task 4 (botón) + Task 5 (cableado). ✅
- Nombre de empleado (en vez de UUID) → Task 1 (JOIN) + Task 3/4 (uso). ✅ (cierra un GAP histórico)

**Placeholder scan:** sin TBD; código completo en cada step.

**Type consistency:** `empleado_nombre` producido en query (Task 1) y consumido en excel (Task 3) y lib (Task 4). `cashflowFromRows` definido en lib (Task 4) y usado en index (Task 5). `markExpensePaid(db, companyId, id)` definido en repo (Task 2) y usado en router (Task 2). Filtros `tipo`/`periodo`/`estadoPago` fluyen index → buildQuery → parseFiltros → listExpenses con los mismos nombres.

**Regresiones esperadas a reparar dentro de su tarea:** tests viejos de excel y de panel/lib (cambian columnas) — Steps 5 de Tasks 3 y 4 lo cubren.
