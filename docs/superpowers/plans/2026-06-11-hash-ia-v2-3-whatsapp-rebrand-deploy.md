# Hash IA v2-3 — WhatsApp resumen, app ingresos/duplicados, rebrand y deploy (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for Tasks 1-6. The Deploy Runbook (final section) is INTERACTIVE — ejecutar junto al usuario, NO con subagentes. Steps use checkbox (`- [ ]`).

**Goal:** Cerrar la v2: enviar el resumen de flujo de caja por WhatsApp (reusando el número de Atiko), que la app maneje ingresos y duplicados, rebrand a "Hash IA", y desplegar todo a producción.

**Architecture:** Backend gana `cashflowSummary` + endpoint `POST /api/panel/whatsapp/resumen` (envío saliente con las credenciales WhatsApp de la empresa). La app (gastos-app) maneja el 409 de duplicado (con "registrar igual"), muestra/alterna tipo gasto/ingreso, y lista ingresos. Rebrand textual a "Hash IA" en panel + app + APK. Deploy interactivo: migración v2, alta `matikoapp` con el número de Atiko, redeploy backend, rebuild + subida del APK, prueba e2e.

**Tech Stack:** Node/Express, jest, pg-mem; React 18 + RTL + jsdom (gastos-app); WhatsApp Cloud API (Graph v20); Capacitor (APK).

---

## File Structure

Backend (`gastos/`):
- `src/expenses/summary.js` — **Modify**: `cashflowSummary` (gastos/ingresos/saldo por mes).
- `src/whatsapp/format.js` — **Modify**: `formatCashflowSummary`.
- `src/companies/repo.js` — **Modify**: `getCompanyWa` (lee wa_token, etc.).
- `src/panel/router.js` — **Modify**: `POST /whatsapp/resumen` (sendText inyectable).

App (`gastos-app/`):
- `src/gastos/api.js` — **Modify**: adjunta `e.data` al error; `createExpense(..., override)`.
- `src/gastos/ConfirmScreen.jsx` — **Modify**: badge tipo + alternar gasto/ingreso.
- `src/gastos/GastosApp.jsx` — **Modify**: manejo del 409 (registrar igual).
- `src/gastos/MyExpenses.jsx` — **Modify**: muestra ingreso/gasto.

Rebrand:
- `gastos/public/panel/index.html`, app `GastosApp.jsx`/`LoginScreen.jsx`, `gastos-app/capacitor.config.json`, `android/app/src/main/res/values/strings.xml`, `android/app/build.gradle`.

Ops (deploy runbook): `gastos/scripts/migrate.js`, nuevo `create-company.js`, `deploy-gastos.js`, `upload-apk.js`.

**Tests:** backend `cd gastos && npx jest`; app `cd gastos-app && npx jest`.

---

### Task 1: Backend — `cashflowSummary` + formatter

**Files:** Modify `gastos/src/expenses/summary.js`, `gastos/src/whatsapp/format.js`; create `gastos/tests/cashflow-summary.test.js`.

- [ ] **Step 1: Crear `gastos/tests/cashflow-summary.test.js`:**

```js
const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
const { createExpense, confirmExpense } = require('../src/expenses/repo');
const { cashflowSummary } = require('../src/expenses/summary');
const { formatCashflowSummary } = require('../src/whatsapp/format');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}

test('cashflowSummary separa ingresos/gastos confirmados del mes y calcula saldo', async () => {
  const db = await makeDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const cid = c.rows[0].id;
  const g = await createExpense(db, { company_id: cid, tipo: 'gasto', categoria: 'Arriendos', fecha: '2026-06-05', total: 30000 });
  const i = await createExpense(db, { company_id: cid, tipo: 'ingreso', categoria: 'Ingreso', fecha: '2026-06-06', total: 80000 });
  await createExpense(db, { company_id: cid, tipo: 'gasto', categoria: 'Otros gastos', fecha: '2026-06-07', total: 5000 }); // pendiente, no cuenta
  await confirmExpense(db, g.id);
  await confirmExpense(db, i.id);

  const s = await cashflowSummary(db, cid, { year: 2026, month: 6 });
  expect(s.ingresos).toBe(80000);
  expect(s.gastos).toBe(30000);
  expect(s.saldo).toBe(50000);
  expect(s.countGastos).toBe(1);
  expect(s.countIngresos).toBe(1);
  expect(s.porCategoria).toEqual([{ categoria: 'Arriendos', total: 30000 }]);
});

test('formatCashflowSummary arma texto con ingresos, gastos y saldo', () => {
  const txt = formatCashflowSummary({ periodo: 'junio 2026', ingresos: 80000, gastos: 30000, saldo: 50000, countGastos: 1, countIngresos: 1, porCategoria: [{ categoria: 'Arriendos', total: 30000 }] });
  expect(txt).toContain('junio 2026');
  expect(txt).toContain('Ingresos');
  expect(txt).toContain('$80.000');
  expect(txt.toLowerCase()).toContain('saldo');
  expect(txt).toContain('$50.000');
  expect(txt).toContain('Arriendos');
});
```

- [ ] **Step 2: Run** `cd gastos && npx jest tests/cashflow-summary.test.js` → FAIL.

- [ ] **Step 3:** En `gastos/src/expenses/summary.js`, agregar (mantén `monthlySummary` intacto):

```js
// Flujo de caja CONFIRMADO de un mes (year, month 1-12): ingresos, gastos, saldo.
async function cashflowSummary(db, companyId, { year, month }) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const toMonth = month === 12 ? 1 : month + 1;
  const toYear = month === 12 ? year + 1 : year;
  const to = `${toYear}-${String(toMonth).padStart(2, '0')}-01`;

  const r = await db.query(
    `SELECT tipo, categoria, SUM(total) AS total, COUNT(*) AS n
     FROM expenses
     WHERE company_id=$1 AND estado='confirmado' AND fecha >= $2 AND fecha < $3
     GROUP BY tipo, categoria
     ORDER BY SUM(total) DESC`,
    [companyId, from, to]
  );

  let gastos = 0; let ingresos = 0; let countGastos = 0; let countIngresos = 0;
  const porCategoria = [];
  for (const row of r.rows) {
    const total = Number(row.total);
    if (row.tipo === 'ingreso') { ingresos += total; countIngresos += Number(row.n); }
    else { gastos += total; countGastos += Number(row.n); porCategoria.push({ categoria: row.categoria, total }); }
  }
  return { gastos, ingresos, saldo: ingresos - gastos, countGastos, countIngresos, porCategoria };
}
```

Y cambiar el export a: `module.exports = { monthlySummary, cashflowSummary };`

- [ ] **Step 4:** En `gastos/src/whatsapp/format.js`, antes de `module.exports`, agregar:

```js
function formatCashflowSummary(s) {
  const lineas = (s.porCategoria || []).map((c) => `• ${c.categoria}: ${fmtClp(c.total)}`);
  return (
    `📊 Resumen ${s.periodo || ''}\n` +
    `📈 Ingresos: ${fmtClp(s.ingresos)} (${s.countIngresos || 0})\n` +
    `📉 Gastos: ${fmtClp(s.gastos)} (${s.countGastos || 0})\n` +
    `💰 Saldo: ${fmtClp(s.saldo)}` +
    (lineas.length ? `\n\nGastos por categoría:\n${lineas.join('\n')}` : '')
  );
}
```

Y agregar `formatCashflowSummary` al `module.exports` (que ya tiene formatConfirmation, formatSummary, formatDuplicateBlock, fmtClp).

- [ ] **Step 5: Run** `cd gastos && npx jest tests/cashflow-summary.test.js` → PASS (2).
- [ ] **Step 6: Run** `cd gastos && npx jest` → green.
- [ ] **Step 7: Commit**

```bash
git add gastos/src/expenses/summary.js gastos/src/whatsapp/format.js gastos/tests/cashflow-summary.test.js
git commit -m "feat(gastos): cashflowSummary (ingresos/gastos/saldo) + formato WhatsApp"
```

---

### Task 2: Backend — endpoint `POST /whatsapp/resumen`

**Files:** Modify `gastos/src/companies/repo.js`, `gastos/src/panel/router.js`; create `gastos/tests/panel-resumen.test.js`.

- [ ] **Step 1: Crear `gastos/tests/panel-resumen.test.js`:**

```js
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
const { createPanelRouter } = require('../src/panel/router');
const { createExpense, confirmExpense } = require('../src/expenses/repo');
const { createUser } = require('../src/users/repo');
const { hashPassword } = require('../src/auth/password');

async function setup(waConfigured = true) {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  const vals = waConfigured ? "'X','PNID','TK','56993300435'" : "'X',NULL,NULL,NULL";
  const c = await db.query(`INSERT INTO companies(nombre, wa_phone_number_id, wa_token, owner_whatsapp) VALUES(${vals}) RETURNING id`);
  const cid = c.rows[0].id;
  await createUser(db, { company_id: cid, email: 'o@x.cl', password_hash: await hashPassword('p'), rol: 'owner' });
  const g = await createExpense(db, { company_id: cid, tipo: 'gasto', categoria: 'Arriendos', fecha: '2026-06-05', total: 30000 });
  const i = await createExpense(db, { company_id: cid, tipo: 'ingreso', categoria: 'Ingreso', fecha: '2026-06-06', total: 80000 });
  await confirmExpense(db, g.id); await confirmExpense(db, i.id);
  const sent = [];
  const sendText = jest.fn(async (m) => { sent.push(m); return { messages: [{ id: 'wamid.1' }] }; });
  const app = express();
  app.use(express.json());
  app.use('/api/panel', createPanelRouter({ db, sendText }));
  const login = await request(app).post('/api/panel/login').send({ email: 'o@x.cl', password: 'p' });
  return { app, db, cid, token: login.body.token, sent, sendText };
}

test('envía el resumen al WhatsApp del dueño con las credenciales de la empresa', async () => {
  const { app, token, sent } = await setup(true);
  const res = await request(app).post('/api/panel/whatsapp/resumen').set('Authorization', 'Bearer ' + token).send({ periodo: '2026-06' });
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  expect(sent).toHaveLength(1);
  expect(sent[0].to).toBe('56993300435');
  expect(sent[0].phoneNumberId).toBe('PNID');
  expect(sent[0].token).toBe('TK');
  expect(sent[0].body).toContain('Saldo');
  expect(sent[0].body).toContain('$50.000');
});

test('400 si la empresa no tiene WhatsApp configurado', async () => {
  const { app, token } = await setup(false);
  const res = await request(app).post('/api/panel/whatsapp/resumen').set('Authorization', 'Bearer ' + token).send({ periodo: '2026-06' });
  expect(res.status).toBe(400);
});

test('502 si el envío de WhatsApp falla (ventana/plantilla)', async () => {
  const { app, token, sendText } = await setup(true);
  sendText.mockRejectedValueOnce(new Error('fuera de ventana 24h'));
  const res = await request(app).post('/api/panel/whatsapp/resumen').set('Authorization', 'Bearer ' + token).send({ periodo: '2026-06' });
  expect(res.status).toBe(502);
  expect(res.body.detalle).toMatch(/ventana/i);
});
```

- [ ] **Step 2: Run** `cd gastos && npx jest tests/panel-resumen.test.js` → FAIL.

- [ ] **Step 3:** En `gastos/src/companies/repo.js`, agregar la función y exportarla:

```js
async function getCompanyWa(db, companyId) {
  const r = await db.query(
    'SELECT nombre, wa_phone_number_id, wa_token, owner_whatsapp FROM companies WHERE id=$1',
    [companyId]
  );
  return r.rows[0] || null;
}
```

(Agregar `getCompanyWa` al `module.exports`.)

- [ ] **Step 4:** En `gastos/src/panel/router.js`:

(a) Agregar requires (arriba, junto a los demás):

```js
const { cashflowSummary } = require('../expenses/summary');
const { formatCashflowSummary } = require('../whatsapp/format');
const { getCompanyWa } = require('../companies/repo');
const realWaClient = require('../whatsapp/client');
```

(b) Cambiar la firma a `function createPanelRouter({ db, sendText } = {}) {` y dentro, al inicio, `const _sendText = sendText || realWaClient.sendText;`.

(c) Agregar el handler después de `router.patch('/expenses/:id/pagar', ...)`:

```js
  router.post('/whatsapp/resumen', async (req, res) => {
    const wa = await getCompanyWa(db, req.auth.companyId);
    if (!wa || !wa.wa_phone_number_id || !wa.wa_token || !wa.owner_whatsapp) {
      return res.status(400).json({ error: 'whatsapp_no_configurado' });
    }
    let year; let month;
    const m = /^(\d{4})-(\d{2})$/.exec((req.body && req.body.periodo) || '');
    if (m) { year = Number(m[1]); month = Number(m[2]); }
    else { const d = new Date(); year = d.getFullYear(); month = d.getMonth() + 1; }
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const s = await cashflowSummary(db, req.auth.companyId, { year, month });
    const body = formatCashflowSummary({ ...s, periodo: `${meses[month - 1]} ${year}` });
    try {
      await _sendText({ to: wa.owner_whatsapp, body, token: wa.wa_token, phoneNumberId: wa.wa_phone_number_id });
    } catch (e) {
      return res.status(502).json({ error: 'envio_whatsapp', detalle: e.message });
    }
    return res.json({ ok: true, to: wa.owner_whatsapp });
  });
```

- [ ] **Step 5: Run** `cd gastos && npx jest tests/panel-resumen.test.js` → PASS (3).
- [ ] **Step 6: Run** `cd gastos && npx jest` → green.
- [ ] **Step 7: Commit**

```bash
git add gastos/src/companies/repo.js gastos/src/panel/router.js gastos/tests/panel-resumen.test.js
git commit -m "feat(gastos): endpoint panel para enviar el resumen por WhatsApp"
```

---

### Task 3: App — `api.js` adjunta data del error + override

**Files:** Modify `gastos-app/src/gastos/api.js`; update `gastos-app/tests/gastos/api.test.js`.

- [ ] **Step 1:** Agregar tests a `gastos-app/tests/gastos/api.test.js` (al final, antes de cerrar):

```js
test('createExpense 409 lanza error con status y data.duplicado', async () => {
  setToken('TK');
  fetch.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'duplicado', duplicado: { nivel: 'fuerte', existente: { id: 'old' } } }) });
  await expect(api.createExpense('B64')).rejects.toMatchObject({ status: 409 });
  try { await api.createExpense('B64'); } catch (e) { expect(e.data.duplicado.nivel).toBe('fuerte'); }
});

test('createExpense con override manda override:true', async () => {
  setToken('TK');
  fetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'x2' }) });
  await api.createExpense('B64', 'image/jpeg', true);
  const [, opts] = fetch.mock.calls[fetch.mock.calls.length - 1];
  expect(JSON.parse(opts.body)).toEqual({ imageBase64: 'B64', mimeType: 'image/jpeg', override: true });
});
```

- [ ] **Step 2: Run** `cd gastos-app && npx jest tests/gastos/api.test.js` → FAIL.

- [ ] **Step 3:** En `gastos-app/src/gastos/api.js`:

(a) En `req`, en la línea del throw, adjuntar data:

```js
  if (!res.ok) { const e = new Error((data && data.error) || `http_${res.status}`); e.status = res.status; e.data = data; throw e; }
```

(b) Reemplazar `createExpense`:

```js
  createExpense(imageBase64, mimeType = 'image/jpeg', override = false) {
    const body = { imageBase64, mimeType };
    if (override) body.override = true;
    return req('/api/app/expenses', { method: 'POST', body });
  },
```

- [ ] **Step 4: Run** `cd gastos-app && npx jest tests/gastos/api.test.js` → PASS.
- [ ] **Step 5: Run** `cd gastos-app && npx jest` → green.
- [ ] **Step 6: Commit**

```bash
git add gastos-app/src/gastos/api.js gastos-app/tests/gastos/api.test.js
git commit -m "feat(app): api adjunta data del error (409 duplicado) y soporta override"
```

---

### Task 4: App — `ConfirmScreen` con tipo gasto/ingreso

**Files:** Modify `gastos-app/src/gastos/ConfirmScreen.jsx`; update `gastos-app/tests/gastos/ConfirmScreen.test.jsx`.

- [ ] **Step 1:** Reemplazar `gastos-app/tests/gastos/ConfirmScreen.test.jsx` por:

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConfirmScreen from '../../src/gastos/ConfirmScreen.jsx';
import { api } from '../../src/gastos/api';
jest.mock('../../src/gastos/api', () => ({ api: { confirmExpense: jest.fn(), rejectExpense: jest.fn(), updateExpense: jest.fn() } }));
const exp = { id: 'x1', tipo: 'gasto', proveedor: 'Copec', total: 25000, categoria: 'Combustible y transporte', fecha: '2026-06-12', iva: 3992, tipo_documento: 'boleta' };

test('confirma', async () => {
  api.confirmExpense.mockResolvedValue({ ...exp, estado: 'confirmado' });
  const onDone = jest.fn();
  render(<ConfirmScreen expense={exp} onDone={onDone} />);
  expect(screen.getByText(/Copec/)).toBeInTheDocument();
  expect(screen.getByText(/25\.000/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /confirmar|guardar/i }));
  await waitFor(() => expect(api.confirmExpense).toHaveBeenCalledWith('x1'));
  await waitFor(() => expect(onDone).toHaveBeenCalled());
});

test('descarta', async () => {
  api.rejectExpense.mockResolvedValue({ ...exp, estado: 'rechazado' });
  render(<ConfirmScreen expense={exp} onDone={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /descartar/i }));
  await waitFor(() => expect(api.rejectExpense).toHaveBeenCalledWith('x1'));
});

test('muestra badge GASTO y permite cambiar a ingreso', async () => {
  api.updateExpense.mockResolvedValue({ ...exp, tipo: 'ingreso' });
  render(<ConfirmScreen expense={exp} onDone={jest.fn()} />);
  expect(screen.getByText(/GASTO/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /es un ingreso/i }));
  await waitFor(() => expect(api.updateExpense).toHaveBeenCalledWith('x1', { tipo: 'ingreso' }));
  await waitFor(() => expect(screen.getByText(/INGRESO/)).toBeInTheDocument());
});
```

- [ ] **Step 2: Run** `cd gastos-app && npx jest tests/gastos/ConfirmScreen.test.jsx` → FAIL (test 3).

- [ ] **Step 3:** Reemplazar `gastos-app/src/gastos/ConfirmScreen.jsx` por:

```jsx
import { useState } from 'react';
import { api } from './api';
function clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }
export default function ConfirmScreen({ expense, onDone }) {
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(expense);
  const esIngreso = e.tipo === 'ingreso';
  async function run(fn) { setBusy(true); try { await fn(); onDone(); } finally { setBusy(false); } }
  async function toggleTipo() {
    const nuevo = esIngreso ? 'gasto' : 'ingreso';
    setBusy(true);
    try { const upd = await api.updateExpense(e.id, { tipo: nuevo }); setE({ ...e, ...upd }); }
    finally { setBusy(false); }
  }
  return (
    <div className="p-6 max-w-sm mx-auto grid gap-3">
      <h2 className="text-xl font-black" style={{ color: '#C9A24B' }}>Revisa el {esIngreso ? 'ingreso' : 'gasto'}</h2>
      <div className="rounded-2xl bg-black/5 p-4 grid gap-1 border">
        <span className="text-xs font-black w-fit px-2 py-0.5 rounded-full" style={{ background: esIngreso ? '#1f7a3f' : '#7a1f1f', color: '#fff' }}>{esIngreso ? 'INGRESO' : 'GASTO'}</span>
        <div className="text-lg font-black">{e.proveedor || (esIngreso ? 'Sin pagador' : 'Sin proveedor')}</div>
        <div className="text-2xl font-black" style={{ color: '#C9A24B' }}>{clp(e.total)}</div>
        <div className="text-sm opacity-70">{e.tipo_documento || 'documento'} · {e.fecha || 's/fecha'}</div>
        <div className="text-sm opacity-70">{esIngreso ? (e.nro_operacion ? 'N° ' + e.nro_operacion : 'Transferencia/depósito') : (e.categoria || 'Otros gastos') + ' · IVA ' + clp(e.iva)}</div>
      </div>
      <button disabled={busy} onClick={toggleTipo} className="rounded-xl font-black py-2 bg-black/10 border disabled:opacity-50 text-sm">Es un {esIngreso ? 'gasto' : 'ingreso'}</button>
      <button disabled={busy} onClick={() => run(() => api.confirmExpense(e.id))} className="rounded-xl font-black py-3 text-black disabled:opacity-50" style={{ background: '#C9A24B' }}>Confirmar y guardar</button>
      <button disabled={busy} onClick={() => run(() => api.rejectExpense(e.id))} className="rounded-xl font-black py-3 bg-black/10 border disabled:opacity-50">Descartar</button>
    </div>
  );
}
```

- [ ] **Step 4: Run** `cd gastos-app && npx jest tests/gastos/ConfirmScreen.test.jsx` → PASS (3).
- [ ] **Step 5: Run** `cd gastos-app && npx jest` → green.
- [ ] **Step 6: Commit**

```bash
git add gastos-app/src/gastos/ConfirmScreen.jsx gastos-app/tests/gastos/ConfirmScreen.test.jsx
git commit -m "feat(app): ConfirmScreen con tipo gasto/ingreso y alternar"
```

---

### Task 5: App — `GastosApp` maneja duplicado (409) + `MyExpenses` muestra tipo

**Files:** Modify `gastos-app/src/gastos/GastosApp.jsx`, `gastos-app/src/gastos/MyExpenses.jsx`; create `gastos-app/tests/gastos/GastosApp-dup.test.jsx`; update existing `GastosApp.test.jsx`/`MyExpenses.test.jsx` if they break.

- [ ] **Step 1: Crear `gastos-app/tests/gastos/GastosApp-dup.test.jsx`:**

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GastosApp from '../../src/gastos/GastosApp.jsx';
import { api } from '../../src/gastos/api';
import { setToken } from '../../src/gastos/session';

jest.mock('../../src/gastos/api', () => ({ api: { createExpense: jest.fn(), confirmExpense: jest.fn(), rejectExpense: jest.fn(), updateExpense: jest.fn(), listExpenses: jest.fn() } }));
jest.mock('../../src/components/EvidenceIntake.jsx', () => ({ __esModule: true, default: ({ onChange }) => (
  <button onClick={() => onChange([{ imageBase64: 'B64', imageMimeType: 'image/jpeg' }])}>fake-capture</button>
) }));

beforeEach(() => { setToken('TK'); api.listExpenses.mockResolvedValue([]); });

test('al capturar un duplicado fuerte ofrece registrar igual', async () => {
  const err = new Error('duplicado'); err.status = 409; err.data = { duplicado: { nivel: 'fuerte', existente: { proveedor: 'Sodimac', total: 11900 } } };
  api.createExpense.mockRejectedValueOnce(err).mockResolvedValueOnce({ id: 'x9', tipo: 'gasto', proveedor: 'Sodimac', total: 11900 });
  render(<GastosApp />);
  fireEvent.click(screen.getByText('fake-capture'));
  await waitFor(() => expect(screen.getByText(/ya.*registrad/i)).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /registrar igual/i }));
  await waitFor(() => expect(api.createExpense).toHaveBeenLastCalledWith('B64', 'image/jpeg', true));
  await waitFor(() => expect(screen.getByText(/Revisa el/i)).toBeInTheDocument());
});
```

- [ ] **Step 2: Run** `cd gastos-app && npx jest tests/gastos/GastosApp-dup.test.jsx` → FAIL.

- [ ] **Step 3:** Reemplazar `gastos-app/src/gastos/GastosApp.jsx` por:

```jsx
import { useState } from 'react';
import { getToken, clearToken } from './session';
import { api } from './api';
import LoginScreen from './LoginScreen.jsx';
import ConfirmScreen from './ConfirmScreen.jsx';
import MyExpenses from './MyExpenses.jsx';
import EvidenceIntake from '../components/EvidenceIntake.jsx';

function clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }

export default function GastosApp() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [tab, setTab] = useState('capturar');
  const [pending, setPending] = useState(null);
  const [dup, setDup] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!authed) return <LoginScreen onLoggedIn={() => setAuthed(true)} />;

  async function submit(imageBase64, mimeType, override) {
    setBusy(true);
    try { setPending(await api.createExpense(imageBase64, mimeType, override)); setDup(null); }
    catch (e) { if (e && e.status === 409) setDup({ imageBase64, mimeType, info: (e.data && e.data.duplicado) || {} }); }
    finally { setBusy(false); }
  }
  async function onChange(items) {
    const ev = (items || [])[0];
    if (!ev || !ev.imageBase64) return;
    await submit(ev.imageBase64, ev.imageMimeType || 'image/jpeg', false);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex justify-between items-center p-4 border-b">
        <span className="font-black" style={{ color: '#C9A24B' }}>Hash IA</span>
        <button className="text-xs opacity-60" onClick={() => { clearToken(); setAuthed(false); }}>Salir</button>
      </header>
      <main className="flex-1">
        {dup ? (
          <div className="p-6 max-w-sm mx-auto grid gap-3">
            <h2 className="text-xl font-black" style={{ color: '#C9A24B' }}>Posible duplicado</h2>
            <div className="rounded-2xl bg-black/5 p-4 border text-sm">
              Esto ya fue registrado{dup.info && dup.info.existente ? ` (${dup.info.existente.proveedor || 's/proveedor'} · ${clp(dup.info.existente.total)})` : ''}. ¿Registrarlo igual?
            </div>
            <button onClick={() => submit(dup.imageBase64, dup.mimeType, true)} className="rounded-xl font-black py-3 text-black" style={{ background: '#C9A24B' }}>Registrar igual</button>
            <button onClick={() => setDup(null)} className="rounded-xl font-black py-3 bg-black/10 border">Descartar</button>
          </div>
        ) : pending ? (
          <ConfirmScreen expense={pending} onDone={() => { setPending(null); setTab('mis'); }} />
        ) : tab === 'capturar' ? (
          busy ? <div className="p-6">Procesando…</div>
               : <div className="p-4"><p className="px-2 mb-2 opacity-70">Captura la boleta, factura o comprobante:</p>
                   <EvidenceIntake maxEvidence={1} value={[]} onChange={onChange} showNativeCapture /></div>
        ) : (
          <MyExpenses />
        )}
      </main>
      {!pending && !dup && (
        <nav className="flex border-t">
          <button className={`flex-1 py-3 font-black ${tab === 'capturar' ? '' : 'opacity-50'}`} style={tab === 'capturar' ? { color: '#C9A24B' } : {}} onClick={() => setTab('capturar')}>Capturar</button>
          <button className={`flex-1 py-3 font-black ${tab === 'mis' ? '' : 'opacity-50'}`} style={tab === 'mis' ? { color: '#C9A24B' } : {}} onClick={() => setTab('mis')}>Mis movimientos</button>
        </nav>
      )}
    </div>
  );
}
```

- [ ] **Step 4:** Reemplazar `gastos-app/src/gastos/MyExpenses.jsx` por:

```jsx
import { useEffect, useState } from 'react';
import { api } from './api';
function clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }
export default function MyExpenses() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    api.listExpenses().then((r) => { if (alive) setRows(Array.isArray(r) ? r : []); })
      .catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  if (loading) return <div className="p-6">Cargando…</div>;
  return (
    <div className="p-4 grid gap-2">
      <h2 className="text-xl font-black px-2" style={{ color: '#C9A24B' }}>Mis movimientos</h2>
      {rows.length === 0 && <p className="px-2 opacity-60">Aún no tienes movimientos.</p>}
      {rows.map((e) => {
        const esIngreso = e.tipo === 'ingreso';
        return (
          <div key={e.id} className="rounded-xl bg-black/5 p-3 flex justify-between items-center border">
            <div>
              <div className="font-black">{e.proveedor || (esIngreso ? 'Sin pagador' : 'Sin proveedor')}</div>
              <div className="text-xs opacity-60">{esIngreso ? 'Ingreso' : (e.categoria || 'Otros gastos')} · {e.estado}</div>
            </div>
            <div className="font-black" style={{ color: esIngreso ? '#1f7a3f' : '#C9A24B' }}>{esIngreso ? '+' : '−'}{clp(e.total)}</div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Run** `cd gastos-app && npx jest tests/gastos/GastosApp-dup.test.jsx` → PASS. Then run `cd gastos-app && npx jest`. Update the existing `GastosApp.test.jsx` / `MyExpenses.test.jsx` only where they break due to renamed labels ("Atiko Gastos"→"Hash IA", "Mis gastos"→"Mis movimientos", "Sin proveedor" still present). Keep assertions meaningful.

- [ ] **Step 6: Commit**

```bash
git add gastos-app/src/gastos/GastosApp.jsx gastos-app/src/gastos/MyExpenses.jsx gastos-app/tests/gastos/GastosApp-dup.test.jsx
# add updated existing app tests if modified
git commit -m "feat(app): maneja duplicado 409 (registrar igual) y muestra ingresos"
```

---

### Task 6: Rebrand "Atiko Gastos" → "Hash IA"

**Files:** `gastos/public/panel/index.html`, `gastos-app/src/gastos/LoginScreen.jsx`, `gastos-app/capacitor.config.json`, `gastos-app/android/app/src/main/res/values/strings.xml`, `gastos-app/android/app/build.gradle`. (GastosApp header ya quedó "Hash IA" en Task 5.) Update any test asserting the old name.

- [ ] **Step 1:** En `gastos/public/panel/index.html`, cambiar los textos visibles "Atiko Gastos" por "Hash IA": el `<title>` (línea ~6), el `<h1 class="brand">` del login (línea ~40) y el `<span class="brand">` del header (línea ~55). NO cambiar ids, clases ni el token de localStorage.

- [ ] **Step 2:** En `gastos-app/src/gastos/LoginScreen.jsx`, cambiar el título visible "Atiko Gastos" por "Hash IA" (buscar el texto y reemplazarlo; no tocar lógica ni llamadas a api).

- [ ] **Step 3:** En `gastos-app/capacitor.config.json`, cambiar `"appName": "Atiko Gastos"` por `"appName": "Hash IA"`. NO cambiar `appId`.

- [ ] **Step 4:** En `gastos-app/android/app/src/main/res/values/strings.xml`, cambiar `app_name` y `title_activity_main` de "Atiko Gastos" a "Hash IA". NO cambiar `package_name` ni `custom_url_scheme`.

- [ ] **Step 5:** En `gastos-app/android/app/build.gradle`, buscar el `outputFileName` (hoy genera `AtikoGastos-debug-v1.0.apk`) y cambiar el nombre base a `HashIA` → `HashIA-debug-v1.0.apk`. Si no existe un bloque de rename, dejar el default (no es bloqueante; se renombra al subir).

- [ ] **Step 6:** Run `cd gastos && npx jest` y `cd gastos-app && npx jest`. Actualizar cualquier test que aún afirme "Atiko Gastos" (p. ej. `LoginScreen.test.jsx`, `panel/static.test.js`) al nuevo nombre "Hash IA". Ambas suites deben quedar verdes.

- [ ] **Step 7: Commit**

```bash
git add gastos/public/panel/index.html gastos-app/src/gastos/LoginScreen.jsx gastos-app/capacitor.config.json gastos-app/android/app/src/main/res/values/strings.xml gastos-app/android/app/build.gradle
# add updated tests
git commit -m "feat: rebrand del producto a Hash IA (panel + app + APK)"
```

---

## Deploy Runbook (INTERACTIVO — ejecutar con el usuario, NO con subagentes)

> Requiere acceso al VPS (scripts existentes usan `.env` con VPS_IP/VPS_PASSWORD) y, para el APK, el Android Studio del usuario. El número de WhatsApp se reusa del agente KAI (solo envío saliente; el webhook entrante de ese número sigue siendo de KAI, no se toca).

- [ ] **R1 — Migración v2 en producción.** Correr `scripts/migrate.js` contra la DB del VPS (agrega las columnas v2 de forma aditiva, idempotente). Verificar que el backend sigue sano (`/health`).

- [ ] **R2 — Alta de `matikoapp` con el número de Atiko.** Crear un script `create-company.js` (raíz, gemelo de `create-gastos-employee.js`) que: cree la empresa `matikoapp` (owner_whatsapp `+56993300435`), cargue en ella `wa_phone_number_id` y `wa_token` leídos del `.env` de `/root/atiko-agent` (`WHATSAPP_PHONE_ID`, `WHATSAPP_TOKEN`), cree el usuario dueño (email + clave nueva, solo-app) y un empleado de prueba. Confirmar con el usuario el email/clave del dueño antes de crearlo (no reutilizar claves personales).

- [ ] **R3 — Redeploy backend.** `GASTOS_DB_PASSWORD=... node deploy-gastos.js` desde el checkout principal (sube `src/` nuevos), `pm2 restart atiko-gastos`, verificar `/health` y un login de panel.

- [ ] **R4 — Rebuild + subida del APK.** El usuario corre `gradlew assembleDebug` en `gastos-app/android` (Android Studio). Luego `node upload-apk.js` (ajustar el nombre a `HashIA-...apk` si cambió). Verificar `https://gastos.atikodigital.cl/panel/<apk>` → HTTP 200.

- [ ] **R5 — Pruebas e2e (con el usuario).**
  - Panel: login dueño de `matikoapp` → ver Gastos/Ingresos/Saldo, filtrar por período, marcar pagada, descargar Excel.
  - App "Hash IA": login del empleado → foto de boleta (gasto) → confirma → aparece en Mis movimientos y en el panel. Foto de comprobante de transferencia → la IA lo marca **ingreso** → confirma. Subir la **misma** boleta otra vez → la app ofrece **"Registrar igual"** (409).
  - WhatsApp: el dueño le escribe "hola" al **+56 9 2713 0792** (abre ventana 24h; KAI responderá su saludo, se ignora). Tocar **"Enviarme el resumen"** en el panel → llega el resumen de flujo de caja al **+56 9 9330 0435**. (Si responde 502 "fuera de ventana", reintentar tras abrir la ventana, o dejar agendado el resumen con plantilla — fuera de este alcance.)

- [ ] **R6 — Memoria + cierre.** Actualizar `memory/atiko-gastos.md` con el estado desplegado (matikoapp, número conectado, APK Hash IA) y considerar `superpowers:finishing-a-development-branch` para mergear la rama a `main`.

---

## Self-Review

**Spec coverage (v2-3):** WhatsApp resumen → Tasks 1-2 + R5. App ingresos (clasifica/confirma/alterna) → Tasks 3-5. App anti-duplicado (registrar igual) → Tasks 3,5. Rebrand Hash IA → Task 6. matikoapp + número Atiko + deploy + APK → Runbook R1-R5. ✅

**Placeholder scan:** sin TBD; código completo en Tasks 1-6. El Runbook es operativo (interactivo) por naturaleza; R2/R4 describen scripts concretos a crear en su momento.

**Type consistency:** `cashflowSummary` (Task 1) consumido por el endpoint (Task 2). `formatCashflowSummary` (Task 1) usado en Task 2. `getCompanyWa` (Task 2) devuelve wa_token/owner_whatsapp usados por el handler. `e.data`/`override` (Task 3) consumidos por `GastosApp` (Task 5) y `createExpense`. `tipo`/`updateExpense` coherentes app↔backend (EDITABLE incluye `tipo` desde v2-1).

**Regresiones esperadas:** tests de app que afirman "Atiko Gastos"/"Mis gastos" (Tasks 5-6 los actualizan); ConfirmScreen mock gana `updateExpense` (Task 4).
