# Plan 2 — Canal WhatsApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-06-09-atiko-gastos-design.md` (§3.2, §5.2)
**Depende de:** Plan 1 (motor OCR + repo + DB), ya implementado en `gastos/`.

**Goal:** Que un empleado mande una foto de boleta/factura al número WhatsApp de su empresa y el bot la procese (motor del Plan 1), responda lo que entendió, acepte confirmación o corrección por texto, y deje el gasto confirmado; y que el dueño pida "resumen" por WhatsApp y reciba total + desglose.

**Architecture:** Webhook Express (multi-tenant por `phone_number_id`) que resuelve empresa + empleado (whitelist), descarga la imagen vía Graph API, llama `extractExpense` (Plan 1), guarda con `createExpense` agregando los campos de sesión (company_id/employee_id/wa_message_id/foto_path/canal). El **estado de la conversación ES la fila del gasto**: el último gasto `pendiente_confirmacion` de ese empleado es lo que una respuesta de texto confirma/corrige/cancela — no hay store de sesión aparte. La lógica de interpretación de texto y de armado de mensajes es pura y se prueba con TDD; el webhook se prueba con supertest mockeando WhatsApp y el motor OCR; la DB con pg-mem.

**Tech Stack:** (lo del Plan 1) + supertest para el webhook. WhatsApp Cloud API (Graph) vía axios (mockeado en tests).

---

## Estructura de archivos (Plan 2)

```
gastos/src/
  companies/
    repo.js              # getCompanyByPhoneNumberId, getEmployeeByPhone, (+ seed helpers)
  whatsapp/
    client.js            # sendText, downloadMedia (Graph API, axios)
    format.js            # formatConfirmation(expense), formatSummary(summary)
    interpret.js         # interpretText(text) -> intención
    webhook.js           # router Express: GET verify + POST dispatch
  expenses/
    repo.js              # (MODIFICAR) + getLatestPending, rejectExpense
    intake.js            # intakeFromImage(...) -> extract + createExpense con campos de sesión
    summary.js           # monthlySummary(db, companyId, period) -> agregados
gastos/tests/
  companies/repo.test.js
  whatsapp/client.test.js
  whatsapp/format.test.js
  whatsapp/interpret.test.js
  whatsapp/webhook.test.js
  expenses/intake.test.js
  expenses/summary.test.js
```

> Reusa los helpers de test de Plan 1: `freshDb()` con pg-mem (registrar `gen_random_uuid` y `now`), mocks con `jest.mock`.

---

## Task 1: Repo de empresas/empleados (resolución de tenant)

**Files:**
- Create: `gastos/src/companies/repo.js`
- Test: `gastos/tests/companies/repo.test.js`

- [ ] **Step 1: Escribir el test que falla** `gastos/tests/companies/repo.test.js`

```js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const {
  createCompany, createEmployee,
  getCompanyByPhoneNumberId, getEmployeeByPhone,
} = require('../../src/companies/repo');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const db = mem.adapters.createPg();
  const client = new db.Pool();
  await migrate(client).catch(() => {});
  return client;
}

test('resuelve empresa por phone_number_id', async () => {
  const db = await freshDb();
  const c = await createCompany(db, { nombre: 'Pyme X', wa_phone_number_id: '538774095982196', wa_token: 'TKN', owner_whatsapp: '56999999999' });
  const found = await getCompanyByPhoneNumberId(db, '538774095982196');
  expect(found.id).toBe(c.id);
  expect(found.wa_token).toBe('TKN');
  expect(await getCompanyByPhoneNumberId(db, 'no-existe')).toBeNull();
});

test('resuelve empleado autorizado por telefono dentro de la empresa', async () => {
  const db = await freshDb();
  const c = await createCompany(db, { nombre: 'Pyme X' });
  const e = await createEmployee(db, { company_id: c.id, nombre: 'Juan', phone: '56988887777' });
  const found = await getEmployeeByPhone(db, c.id, '56988887777');
  expect(found.id).toBe(e.id);
  expect(await getEmployeeByPhone(db, c.id, '56900000000')).toBeNull();
});

test('no resuelve empleado inactivo', async () => {
  const db = await freshDb();
  const c = await createCompany(db, { nombre: 'Pyme X' });
  await createEmployee(db, { company_id: c.id, nombre: 'Ana', phone: '56911112222', activo: false });
  expect(await getEmployeeByPhone(db, c.id, '56911112222')).toBeNull();
});
```

- [ ] **Step 2: Correr y verificar que falla.** `cd gastos && npx jest tests/companies/repo.test.js`

- [ ] **Step 3: Implementar** `gastos/src/companies/repo.js`

```js
async function createCompany(db, data) {
  const cols = ['nombre', 'rut', 'wa_phone_number_id', 'wa_token', 'owner_nombre', 'owner_whatsapp', 'resumen_frecuencia']
    .filter((f) => data[f] !== undefined);
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
  const r = await db.query(
    `INSERT INTO companies(${cols.join(', ')}) VALUES(${ph}) RETURNING *`,
    cols.map((f) => data[f])
  );
  return r.rows[0];
}

async function createEmployee(db, data) {
  const cols = ['company_id', 'nombre', 'phone', 'usuario', 'password_hash', 'rol', 'activo']
    .filter((f) => data[f] !== undefined);
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
  const r = await db.query(
    `INSERT INTO employees(${cols.join(', ')}) VALUES(${ph}) RETURNING *`,
    cols.map((f) => data[f])
  );
  return r.rows[0];
}

async function getCompanyByPhoneNumberId(db, phoneNumberId) {
  const r = await db.query('SELECT * FROM companies WHERE wa_phone_number_id=$1', [phoneNumberId]);
  return r.rows[0] || null;
}

async function getEmployeeByPhone(db, companyId, phone) {
  const r = await db.query(
    'SELECT * FROM employees WHERE company_id=$1 AND phone=$2 AND activo=true',
    [companyId, phone]
  );
  return r.rows[0] || null;
}

module.exports = { createCompany, createEmployee, getCompanyByPhoneNumberId, getEmployeeByPhone };
```

- [ ] **Step 4: Correr y verificar que pasa.** `cd gastos && npx jest tests/companies/repo.test.js`

- [ ] **Step 5: Commit**

```bash
git add gastos/src/companies/repo.js gastos/tests/companies/repo.test.js
git commit -m "feat(gastos): repo empresas/empleados + resolucion de tenant"
```

---

## Task 2: Cliente WhatsApp (sendText, downloadMedia)

**Files:**
- Create: `gastos/src/whatsapp/client.js`
- Test: `gastos/tests/whatsapp/client.test.js`

Graph API. `sendText({to, body, token, phoneNumberId})` hace POST a `/{phoneNumberId}/messages`.
`downloadMedia({mediaId, token})` hace 2 pasos: GET `/{mediaId}` → `url`, luego GET de esa `url`
con auth → buffer. axios mockeado.

- [ ] **Step 1: Escribir el test que falla** `gastos/tests/whatsapp/client.test.js`

```js
jest.mock('axios');
const axios = require('axios');
const { sendText, downloadMedia } = require('../../src/whatsapp/client');

test('sendText postea al endpoint de mensajes con el token', async () => {
  axios.post.mockResolvedValue({ data: { messages: [{ id: 'wamid.1' }] } });
  const r = await sendText({ to: '56988887777', body: 'hola', token: 'TKN', phoneNumberId: 'PNID' });
  expect(r.messages[0].id).toBe('wamid.1');
  const [url, payload, cfg] = axios.post.mock.calls[0];
  expect(url).toContain('/PNID/messages');
  expect(payload).toMatchObject({ to: '56988887777', type: 'text', text: { body: 'hola' } });
  expect(cfg.headers.Authorization).toBe('Bearer TKN');
});

test('downloadMedia resuelve la url y baja el buffer', async () => {
  axios.get
    .mockResolvedValueOnce({ data: { url: 'https://media.example/abc' } })
    .mockResolvedValueOnce({ data: Buffer.from('IMG'), headers: { 'content-type': 'image/jpeg' } });
  const out = await downloadMedia({ mediaId: 'MID', token: 'TKN' });
  expect(out.buffer.toString()).toBe('IMG');
  expect(out.mimeType).toBe('image/jpeg');
  expect(axios.get.mock.calls[0][0]).toContain('/MID');
  expect(axios.get.mock.calls[1][1].responseType).toBe('arraybuffer');
});
```

- [ ] **Step 2: Correr y verificar que falla.** `cd gastos && npx jest tests/whatsapp/client.test.js`

- [ ] **Step 3: Implementar** `gastos/src/whatsapp/client.js`

```js
const axios = require('axios');

const GRAPH = 'https://graph.facebook.com/v20.0';

async function sendText({ to, body, token, phoneNumberId }) {
  const res = await axios.post(
    `${GRAPH}/${phoneNumberId}/messages`,
    { messaging_product: 'whatsapp', to, type: 'text', text: { body } },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 20000 }
  );
  return res.data;
}

async function downloadMedia({ mediaId, token }) {
  const meta = await axios.get(`${GRAPH}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` }, timeout: 20000,
  });
  const url = meta.data.url;
  const bin = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` }, responseType: 'arraybuffer', timeout: 30000,
  });
  return {
    buffer: Buffer.from(bin.data),
    mimeType: (bin.headers && bin.headers['content-type']) || 'image/jpeg',
  };
}

module.exports = { sendText, downloadMedia };
```

- [ ] **Step 4: Correr y verificar que pasa.** `cd gastos && npx jest tests/whatsapp/client.test.js`

- [ ] **Step 5: Commit**

```bash
git add gastos/src/whatsapp/client.js gastos/tests/whatsapp/client.test.js
git commit -m "feat(gastos): cliente WhatsApp Graph (sendText, downloadMedia)"
```

---

## Task 3: Intake (motor→DB) + extensiones de repo + formato

**Files:**
- Modify: `gastos/src/expenses/repo.js` (agregar `getLatestPending`, `rejectExpense`)
- Create: `gastos/src/expenses/intake.js`
- Create: `gastos/src/whatsapp/format.js`
- Test: `gastos/tests/expenses/intake.test.js`
- Test: `gastos/tests/whatsapp/format.test.js`

- [ ] **Step 1: Escribir el test que falla** `gastos/tests/expenses/intake.test.js`

```js
jest.mock('../../src/ocr/extract');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { extractExpense } = require('../../src/ocr/extract');
const { intakeFromImage } = require('../../src/expenses/intake');
const { getLatestPending, rejectExpense } = require('../../src/expenses/repo');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const db = mem.adapters.createPg();
  const client = new db.Pool();
  await migrate(client).catch(() => {});
  const c = await client.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const e = await client.query("INSERT INTO employees(company_id, nombre) VALUES($1,'Juan') RETURNING id", [c.rows[0].id]);
  return { db: client, companyId: c.rows[0].id, employeeId: e.rows[0].id };
}

test('intakeFromImage corre el motor y guarda con campos de sesion', async () => {
  extractExpense.mockResolvedValue({
    tipo_documento: 'boleta', proveedor: 'Copec', neto: 21008, iva: 3992, total: 25000,
    categoria: 'Combustible y transporte', cuenta_sii_codigo: '4.3.150.1',
    cuenta_sii_nombre: 'Otros Gastos de Administración y Venta', confianza: 75, raw_ocr: { a: 1 },
  });
  const { db, companyId, employeeId } = await freshDb();
  const exp = await intakeFromImage({
    db, companyId, employeeId, imageBuffer: Buffer.from('x'), mimeType: 'image/jpeg',
    canal: 'whatsapp', waMessageId: 'wamid.1', fotoPath: '/tmp/a.jpg',
  });
  expect(exp.estado).toBe('pendiente_confirmacion');
  expect(exp.canal).toBe('whatsapp');
  expect(exp.proveedor).toBe('Copec');
  // queda como el pendiente del empleado
  const pend = await getLatestPending(db, companyId, employeeId);
  expect(pend.id).toBe(exp.id);
});

test('rejectExpense pone estado rechazado', async () => {
  extractExpense.mockResolvedValue({ total: 1000, categoria: 'Otros gastos', cuenta_sii_codigo: '4.3.150.1', cuenta_sii_nombre: 'X' });
  const { db, companyId, employeeId } = await freshDb();
  const exp = await intakeFromImage({ db, companyId, employeeId, imageBuffer: Buffer.from('x'), canal: 'whatsapp' });
  const rej = await rejectExpense(db, exp.id);
  expect(rej.estado).toBe('rechazado');
  expect(await getLatestPending(db, companyId, employeeId)).toBeNull();
});
```

- [ ] **Step 2: Escribir el test que falla** `gastos/tests/whatsapp/format.test.js`

```js
const { formatConfirmation, formatSummary } = require('../../src/whatsapp/format');

test('formatConfirmation incluye proveedor, total formateado y categoria', () => {
  const msg = formatConfirmation({
    tipo_documento: 'boleta', proveedor: 'Copec', total: 25000, fecha: '2026-06-12',
    categoria: 'Combustible y transporte', iva: 3992,
  });
  expect(msg).toContain('Copec');
  expect(msg).toContain('$25.000');
  expect(msg).toContain('Combustible y transporte');
  expect(msg.toLowerCase()).toContain('sí'); // pide confirmar
});

test('formatSummary arma total y desglose por categoria', () => {
  const msg = formatSummary({
    periodo: 'junio 2026', total: 35000,
    porCategoria: [{ categoria: 'Combustible y transporte', total: 25000 }, { categoria: 'Otros gastos', total: 10000 }],
    count: 2,
  });
  expect(msg).toContain('junio 2026');
  expect(msg).toContain('$35.000');
  expect(msg).toContain('Combustible y transporte');
  expect(msg).toContain('$25.000');
});
```

- [ ] **Step 3: Correr ambos, verificar que fallan.** `cd gastos && npx jest tests/expenses/intake.test.js tests/whatsapp/format.test.js`

- [ ] **Step 4: Agregar a `gastos/src/expenses/repo.js`** (al final, antes de `module.exports`, y exportarlas):

```js
async function getLatestPending(db, companyId, employeeId) {
  const r = await db.query(
    `SELECT * FROM expenses
     WHERE company_id=$1 AND employee_id=$2 AND estado='pendiente_confirmacion'
     ORDER BY created_at DESC LIMIT 1`,
    [companyId, employeeId]
  );
  return r.rows[0] || null;
}

async function rejectExpense(db, id) {
  const r = await db.query(
    "UPDATE expenses SET estado='rechazado' WHERE id=$1 RETURNING *",
    [id]
  );
  return r.rows[0] || null;
}
```

Y actualizar la línea de export a:
```js
module.exports = { createExpense, getExpense, confirmExpense, updateExpense, getLatestPending, rejectExpense };
```

- [ ] **Step 5: Implementar** `gastos/src/expenses/intake.js`

```js
const { extractExpense } = require('../ocr/extract');
const { createExpense } = require('./repo');

// Corre el motor OCR (Plan 1) y persiste agregando los campos de sesion del canal.
async function intakeFromImage({ db, companyId, employeeId, imageBuffer, mimeType = 'image/jpeg', canal = 'whatsapp', waMessageId, fotoPath }) {
  const extracted = await extractExpense({ imageBuffer, mimeType });
  return createExpense(db, {
    ...extracted,
    company_id: companyId,
    employee_id: employeeId,
    canal,
    wa_message_id: waMessageId,
    foto_path: fotoPath,
  });
}

module.exports = { intakeFromImage };
```

- [ ] **Step 6: Implementar** `gastos/src/whatsapp/format.js`

```js
function fmtClp(n) {
  const v = Math.round(Number(n) || 0);
  return '$' + v.toLocaleString('es-CL');
}

function formatConfirmation(e) {
  const tipo = (e.tipo_documento || 'documento');
  const partes = [
    `🧾 ${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`,
    e.proveedor || 's/proveedor',
    fmtClp(e.total),
    e.fecha || 's/fecha',
    e.categoria || 'Otros gastos',
  ];
  return (
    partes.join(' · ') +
    `\nIVA ${fmtClp(e.iva)}.` +
    `\n¿Está correcto? Responde *SÍ* para guardar, o dime qué corregir ` +
    `(ej: "monto 30000" o "categoría comida"). Responde *NO* para descartar.`
  );
}

function formatSummary(s) {
  const lineas = (s.porCategoria || []).map((c) => `• ${c.categoria}: ${fmtClp(c.total)}`);
  return (
    `📊 Gastos ${s.periodo} (${s.count || 0})\n` +
    `Total: ${fmtClp(s.total)}\n` +
    (lineas.length ? lineas.join('\n') : 'Sin gastos en el período.')
  );
}

module.exports = { formatConfirmation, formatSummary, fmtClp };
```

- [ ] **Step 7: Correr ambos, verificar que pasan.** `cd gastos && npx jest tests/expenses/intake.test.js tests/whatsapp/format.test.js`

- [ ] **Step 8: Commit**

```bash
git add gastos/src/expenses/repo.js gastos/src/expenses/intake.js gastos/src/whatsapp/format.js gastos/tests/expenses/intake.test.js gastos/tests/whatsapp/format.test.js
git commit -m "feat(gastos): intake motor->DB + getLatestPending/reject + formato WhatsApp"
```

---

## Task 4: Interpretación de texto entrante

**Files:**
- Create: `gastos/src/whatsapp/interpret.js`
- Test: `gastos/tests/whatsapp/interpret.test.js`

`interpretText(text)` → `{kind, ...}`:
- `confirm` (sí, si, ok, dale, correcto, confirmar)
- `cancel` (no, cancelar, descartar)
- `summary` (texto que empieza con "resumen"; opc. `period` el resto)
- `correction` (`monto N`/`total N`/`neto N`/`iva N` → field+value entero; `categoria <txt>`,
  `proveedor <txt>`, `fecha <dd/mm/aaaa>`, `folio <x>` → field+value)
- `unknown` (lo demás)

- [ ] **Step 1: Escribir el test que falla** `gastos/tests/whatsapp/interpret.test.js`

```js
const { interpretText } = require('../../src/whatsapp/interpret');

test('confirmaciones', () => {
  for (const t of ['sí', 'si', 'SI', 'ok', 'dale', 'correcto', 'confirmar']) {
    expect(interpretText(t).kind).toBe('confirm');
  }
});

test('cancelaciones', () => {
  for (const t of ['no', 'NO', 'cancelar', 'descartar']) {
    expect(interpretText(t).kind).toBe('cancel');
  }
});

test('resumen con y sin periodo', () => {
  expect(interpretText('resumen')).toEqual({ kind: 'summary', period: '' });
  expect(interpretText('resumen mes')).toEqual({ kind: 'summary', period: 'mes' });
});

test('correccion de montos a entero', () => {
  expect(interpretText('monto 30000')).toEqual({ kind: 'correction', field: 'total', value: 30000 });
  expect(interpretText('total $30.000')).toEqual({ kind: 'correction', field: 'total', value: 30000 });
  expect(interpretText('neto 21008')).toEqual({ kind: 'correction', field: 'neto', value: 21008 });
  expect(interpretText('iva 3992')).toEqual({ kind: 'correction', field: 'iva', value: 3992 });
});

test('correccion de texto', () => {
  expect(interpretText('categoria Honorarios')).toEqual({ kind: 'correction', field: 'categoria', value: 'Honorarios' });
  expect(interpretText('proveedor Lider')).toEqual({ kind: 'correction', field: 'proveedor', value: 'Lider' });
  expect(interpretText('folio 123')).toEqual({ kind: 'correction', field: 'folio', value: '123' });
});

test('desconocido', () => {
  expect(interpretText('cualquier cosa rara').kind).toBe('unknown');
});
```

- [ ] **Step 2: Correr y verificar que falla.** `cd gastos && npx jest tests/whatsapp/interpret.test.js`

- [ ] **Step 3: Implementar** `gastos/src/whatsapp/interpret.js`

```js
const { parseAmountClp } = require('../domain/normalize');

const CONFIRM = new Set(['si', 'sí', 'ok', 'okay', 'dale', 'correcto', 'confirmar', 'confirmo', 'listo']);
const CANCEL = new Set(['no', 'cancelar', 'descartar', 'borrar', 'eliminar']);
const AMOUNT_FIELDS = { monto: 'total', total: 'total', neto: 'neto', iva: 'iva' };
const TEXT_FIELDS = { categoria: 'categoria', 'categoría': 'categoria', proveedor: 'proveedor', folio: 'folio', fecha: 'fecha', rut: 'rut_emisor' };

function interpretText(raw) {
  const text = String(raw || '').trim();
  const lower = text.toLowerCase();

  if (CONFIRM.has(lower)) return { kind: 'confirm' };
  if (CANCEL.has(lower)) return { kind: 'cancel' };

  if (lower === 'resumen' || lower.startsWith('resumen ') || lower.startsWith('resumen')) {
    if (lower === 'resumen') return { kind: 'summary', period: '' };
    if (lower.startsWith('resumen ')) return { kind: 'summary', period: text.slice('resumen '.length).trim() };
  }

  const firstSpace = text.indexOf(' ');
  if (firstSpace > 0) {
    const head = lower.slice(0, firstSpace);
    const rest = text.slice(firstSpace + 1).trim();
    if (AMOUNT_FIELDS[head]) {
      return { kind: 'correction', field: AMOUNT_FIELDS[head], value: parseAmountClp(rest) };
    }
    if (TEXT_FIELDS[head]) {
      return { kind: 'correction', field: TEXT_FIELDS[head], value: rest };
    }
  }

  return { kind: 'unknown' };
}

module.exports = { interpretText };
```

- [ ] **Step 4: Correr y verificar que pasa.** `cd gastos && npx jest tests/whatsapp/interpret.test.js`

- [ ] **Step 5: Commit**

```bash
git add gastos/src/whatsapp/interpret.js gastos/tests/whatsapp/interpret.test.js
git commit -m "feat(gastos): interpretacion de texto entrante (confirm/cancel/correccion/resumen)"
```

---

## Task 5: Resumen del dueño (agregación)

**Files:**
- Create: `gastos/src/expenses/summary.js`
- Test: `gastos/tests/expenses/summary.test.js`

`monthlySummary(db, companyId, { year, month })` agrega los gastos **confirmados** del mes:
total general, total por categoría (desc), y count. `month` 1-12. Si no se pasa periodo, el
caller decide; esta función exige year/month explícitos para ser determinista en tests.

- [ ] **Step 1: Escribir el test que falla** `gastos/tests/expenses/summary.test.js`

```js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { monthlySummary } = require('../../src/expenses/summary');

async function seed() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const db = mem.adapters.createPg();
  const client = new db.Pool();
  await migrate(client).catch(() => {});
  const c = await client.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const cid = c.rows[0].id;
  // 2 confirmados en junio 2026, 1 pendiente (no cuenta), 1 confirmado en mayo (no cuenta)
  const ins = (fecha, total, categoria, estado) => client.query(
    `INSERT INTO expenses(company_id, fecha, total, categoria, estado)
     VALUES($1,$2,$3,$4,$5)`, [cid, fecha, total, categoria, estado]);
  await ins('2026-06-05', 25000, 'Combustible y transporte', 'confirmado');
  await ins('2026-06-20', 10000, 'Otros gastos', 'confirmado');
  await ins('2026-06-21', 99999, 'Otros gastos', 'pendiente_confirmacion');
  await ins('2026-05-10', 50000, 'Otros gastos', 'confirmado');
  return { db: client, cid };
}

test('agrega solo confirmados del mes pedido', async () => {
  const { db, cid } = await seed();
  const s = await monthlySummary(db, cid, { year: 2026, month: 6 });
  expect(s.total).toBe(35000);
  expect(s.count).toBe(2);
  expect(s.porCategoria).toEqual([
    { categoria: 'Combustible y transporte', total: 25000 },
    { categoria: 'Otros gastos', total: 10000 },
  ]);
});
```

- [ ] **Step 2: Correr y verificar que falla.** `cd gastos && npx jest tests/expenses/summary.test.js`

- [ ] **Step 3: Implementar** `gastos/src/expenses/summary.js`

```js
// Resumen de gastos CONFIRMADOS de un mes (year, month 1-12) para una empresa.
async function monthlySummary(db, companyId, { year, month }) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const toMonth = month === 12 ? 1 : month + 1;
  const toYear = month === 12 ? year + 1 : year;
  const to = `${toYear}-${String(toMonth).padStart(2, '0')}-01`;

  const r = await db.query(
    `SELECT categoria, SUM(total)::bigint AS total, COUNT(*)::int AS n
     FROM expenses
     WHERE company_id=$1 AND estado='confirmado' AND fecha >= $2 AND fecha < $3
     GROUP BY categoria
     ORDER BY total DESC`,
    [companyId, from, to]
  );

  const porCategoria = r.rows.map((row) => ({ categoria: row.categoria, total: Number(row.total) }));
  const total = porCategoria.reduce((a, c) => a + c.total, 0);
  const count = r.rows.reduce((a, row) => a + Number(row.n), 0);
  return { total, count, porCategoria };
}

module.exports = { monthlySummary };
```

- [ ] **Step 4: Correr y verificar que pasa.** `cd gastos && npx jest tests/expenses/summary.test.js`

> Si pg-mem se queja de `SUM(total)::bigint` o `COUNT(*)::int`, quitar los casts (`SUM(total) AS total, COUNT(*) AS n`) y dejar el `Number(...)` en JS que ya está. Reportar si se cambió.

- [ ] **Step 5: Commit**

```bash
git add gastos/src/expenses/summary.js gastos/tests/expenses/summary.test.js
git commit -m "feat(gastos): resumen mensual de gastos confirmados (agregacion)"
```

---

## Task 6: Webhook (GET verify + POST dispatch)

**Files:**
- Create: `gastos/src/whatsapp/webhook.js`
- Modify: `gastos/src/server.js` (montar el router)
- Test: `gastos/tests/whatsapp/webhook.test.js`

El router recibe `db` y deps inyectadas (factory) para ser testeable sin red ni Postgres real.
GET: verificación (`hub.mode=subscribe` + `hub.verify_token` == `WHATSAPP_VERIFY_TOKEN`) → responde
`hub.challenge`. POST: por cada mensaje, resuelve empresa (por `metadata.phone_number_id`) y empleado
(por `from`); imagen → descarga + intake + responde confirmación; texto → interpreta contra el
pendiente (confirm/cancel/correction) o comando `resumen`. Siempre responde 200 rápido.

- [ ] **Step 1: Escribir el test que falla** `gastos/tests/whatsapp/webhook.test.js`

```js
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createWebhookRouter } = require('../../src/whatsapp/webhook');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const db = mem.adapters.createPg();
  const client = new db.Pool();
  await migrate(client).catch(() => {});
  return client;
}

function buildApp(db, deps) {
  const app = express();
  app.use(express.json());
  app.use('/api/whatsapp/webhook', createWebhookRouter({ db, verifyToken: 'VT', ...deps }));
  return app;
}

function imageMsg(phoneNumberId, from, mediaId, msgId) {
  return { entry: [{ changes: [{ value: {
    metadata: { phone_number_id: phoneNumberId },
    messages: [{ id: msgId, from, type: 'image', image: { id: mediaId } }],
  } }] }] };
}
function textMsg(phoneNumberId, from, body, msgId) {
  return { entry: [{ changes: [{ value: {
    metadata: { phone_number_id: phoneNumberId },
    messages: [{ id: msgId, from, type: 'text', text: { body } }],
  } }] }] };
}

test('GET verificacion devuelve el challenge con token correcto', async () => {
  const db = await freshDb();
  const app = buildApp(db, {});
  const res = await request(app).get('/api/whatsapp/webhook')
    .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'VT', 'hub.challenge': '12345' });
  expect(res.status).toBe(200);
  expect(res.text).toBe('12345');
});

test('GET con token malo => 403', async () => {
  const db = await freshDb();
  const app = buildApp(db, {});
  const res = await request(app).get('/api/whatsapp/webhook')
    .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'MALO', 'hub.challenge': '12345' });
  expect(res.status).toBe(403);
});

test('imagen de empleado autorizado => intake + responde confirmacion', async () => {
  const db = await freshDb();
  const c = await db.query("INSERT INTO companies(nombre, wa_phone_number_id, wa_token) VALUES('X','PNID','TKN') RETURNING id");
  await db.query("INSERT INTO employees(company_id, nombre, phone) VALUES($1,'Juan','56988887777')", [c.rows[0].id]);

  const sent = [];
  const deps = {
    downloadMedia: jest.fn().mockResolvedValue({ buffer: Buffer.from('img'), mimeType: 'image/jpeg' }),
    extractExpense: jest.fn().mockResolvedValue({ proveedor: 'Copec', total: 25000, categoria: 'Combustible y transporte', cuenta_sii_codigo: '4.3.150.1', cuenta_sii_nombre: 'X', iva: 3992 }),
    sendText: jest.fn().mockImplementation(async ({ body }) => { sent.push(body); return {}; }),
  };
  const app = buildApp(db, deps);

  const res = await request(app).post('/api/whatsapp/webhook').send(imageMsg('PNID', '56988887777', 'MID', 'wamid.1'));
  expect(res.status).toBe(200);
  expect(deps.downloadMedia).toHaveBeenCalled();
  expect(deps.extractExpense).toHaveBeenCalled();
  expect(sent[0]).toContain('Copec');

  const pend = await db.query("SELECT * FROM expenses WHERE estado='pendiente_confirmacion'");
  expect(pend.rows).toHaveLength(1);
});

test('texto SI confirma el pendiente', async () => {
  const db = await freshDb();
  const c = await db.query("INSERT INTO companies(nombre, wa_phone_number_id, wa_token) VALUES('X','PNID','TKN') RETURNING id");
  const e = await db.query("INSERT INTO employees(company_id, nombre, phone) VALUES($1,'Juan','56988887777') RETURNING id", [c.rows[0].id]);
  await db.query("INSERT INTO expenses(company_id, employee_id, total, estado, categoria) VALUES($1,$2,25000,'pendiente_confirmacion','Otros gastos')", [c.rows[0].id, e.rows[0].id]);

  const deps = {
    downloadMedia: jest.fn(), extractExpense: jest.fn(),
    sendText: jest.fn().mockResolvedValue({}),
  };
  const app = buildApp(db, deps);
  const res = await request(app).post('/api/whatsapp/webhook').send(textMsg('PNID', '56988887777', 'sí', 'wamid.2'));
  expect(res.status).toBe(200);

  const conf = await db.query("SELECT estado FROM expenses LIMIT 1");
  expect(conf.rows[0].estado).toBe('confirmado');
  expect(deps.sendText).toHaveBeenCalled();
});

test('empleado NO autorizado recibe aviso y no crea gasto', async () => {
  const db = await freshDb();
  await db.query("INSERT INTO companies(nombre, wa_phone_number_id, wa_token) VALUES('X','PNID','TKN')");
  const deps = {
    downloadMedia: jest.fn(), extractExpense: jest.fn(),
    sendText: jest.fn().mockResolvedValue({}),
  };
  const app = buildApp(db, deps);
  const res = await request(app).post('/api/whatsapp/webhook').send(imageMsg('PNID', '56900000000', 'MID', 'wamid.3'));
  expect(res.status).toBe(200);
  expect(deps.extractExpense).not.toHaveBeenCalled();
  expect(deps.sendText.mock.calls[0][0].body.toLowerCase()).toContain('registrad');
});
```

- [ ] **Step 2: Correr y verificar que falla.** `cd gastos && npx jest tests/whatsapp/webhook.test.js`

- [ ] **Step 3: Implementar** `gastos/src/whatsapp/webhook.js`

```js
const express = require('express');
const { getCompanyByPhoneNumberId, getEmployeeByPhone } = require('../companies/repo');
const { intakeFromImage } = require('../expenses/intake');
const { getLatestPending, confirmExpense, updateExpense, rejectExpense } = require('../expenses/repo');
const { monthlySummary } = require('../expenses/summary');
const { interpretText } = require('./interpret');
const { formatConfirmation, formatSummary } = require('./format');
const realClient = require('./client');
const realExtract = require('../ocr/extract');

// Inyección de deps para test; en producción usa las reales.
function createWebhookRouter({ db, verifyToken, sendText, downloadMedia, extractExpense, now } = {}) {
  const _send = sendText || realClient.sendText;
  const _download = downloadMedia || realClient.downloadMedia;
  const _extract = extractExpense || realExtract.extractExpense;
  const _now = now || (() => new Date());
  const router = express.Router();

  router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === (verifyToken || process.env.WHATSAPP_VERIFY_TOKEN)) {
      return res.status(200).send(String(challenge || ''));
    }
    return res.sendStatus(403);
  });

  router.post('/', async (req, res) => {
    // Procesamos y LUEGO respondemos 200 (síncrono): así es testeable con supertest
    // y, para el MVP, el trabajo (download+OCR+DB) cae bien dentro del timeout de Meta.
    // El dedup por wa_message_id (índice único) cubre un eventual reintento de Meta.
    try {
      const changes = req.body?.entry?.flatMap((e) => e.changes || []) || [];
      for (const ch of changes) {
        const value = ch.value || {};
        const phoneNumberId = value.metadata?.phone_number_id;
        const messages = value.messages || [];
        if (!phoneNumberId || !messages.length) continue;

        const company = await getCompanyByPhoneNumberId(db, phoneNumberId);
        if (!company) continue;
        const reply = (body) => _send({ to: messages[0].from, body, token: company.wa_token, phoneNumberId });

        for (const msg of messages) {
          const employee = await getEmployeeByPhone(db, company.id, msg.from);
          if (!employee) {
            await reply('No estás registrado para rendir gastos. Pídele a tu jefe que te agregue.');
            continue;
          }

          if (msg.type === 'image' && msg.image?.id) {
            const media = await _download({ mediaId: msg.image.id, token: company.wa_token });
            const exp = await intakeFromImage({
              db, companyId: company.id, employeeId: employee.id,
              imageBuffer: media.buffer, mimeType: media.mimeType, canal: 'whatsapp',
              waMessageId: msg.id, fotoPath: null, extract: _extract,
            });
            await reply(formatConfirmation(exp));
            continue;
          }

          if (msg.type === 'text' && msg.text?.body) {
            const intent = interpretText(msg.text.body);

            if (intent.kind === 'summary') {
              const d = _now();
              const s = await monthlySummary(db, company.id, { year: d.getFullYear(), month: d.getMonth() + 1 });
              const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
              await reply(formatSummary({ ...s, periodo: `${meses[d.getMonth()]} ${d.getFullYear()}` }));
              continue;
            }

            const pending = await getLatestPending(db, company.id, employee.id);
            if (!pending) {
              await reply('No tengo un gasto pendiente. Mándame la foto de una boleta o escribe "resumen".');
              continue;
            }
            if (intent.kind === 'confirm') {
              await confirmExpense(db, pending.id);
              await reply('✅ Gasto guardado. ¡Gracias!');
            } else if (intent.kind === 'cancel') {
              await rejectExpense(db, pending.id);
              await reply('❌ Gasto descartado.');
            } else if (intent.kind === 'correction') {
              const upd = await updateExpense(db, pending.id, { [intent.field]: intent.value });
              await reply(formatConfirmation(upd));
            } else {
              await reply('No te entendí. Responde *SÍ*, *NO*, o corrige (ej: "monto 30000").');
            }
          }
        }
      }
    } catch (err) {
      console.error('[gastos/webhook] error:', err.message);
    } finally {
      res.sendStatus(200); // Meta siempre recibe 200 (no reintenta en bucle)
    }
  });

  return router;
}

module.exports = { createWebhookRouter };
```

> NOTA para el implementador: `intakeFromImage` (Task 3) NO recibe `extract` como parámetro
> (usa el import directo). En el test del webhook se mockea `extractExpense` vía la dep `_extract`,
> pero `intakeFromImage` no lo usa. Para que el test del webhook funcione con el mock, **pásale el
> motor a intakeFromImage**: ajusta `intakeFromImage` para aceptar un parámetro opcional
> `extract` y usarlo en vez del import (`const run = extract || extractExpense;`). Aplica ese
> pequeño ajuste en `gastos/src/expenses/intake.js` como parte de esta task y re-corre los tests de
> Task 3 para confirmar que siguen verdes.

- [ ] **Step 4: Ajustar `gastos/src/expenses/intake.js`** para aceptar `extract` inyectable:

```js
const { extractExpense } = require('../ocr/extract');
const { createExpense } = require('./repo');

async function intakeFromImage({ db, companyId, employeeId, imageBuffer, mimeType = 'image/jpeg', canal = 'whatsapp', waMessageId, fotoPath, extract }) {
  const run = extract || extractExpense;
  const extracted = await run({ imageBuffer, mimeType });
  return createExpense(db, {
    ...extracted,
    company_id: companyId,
    employee_id: employeeId,
    canal,
    wa_message_id: waMessageId,
    foto_path: fotoPath,
  });
}

module.exports = { intakeFromImage };
```

- [ ] **Step 5: Montar el router en `gastos/src/server.js`** (agregar tras el `/health`):

```js
const { createWebhookRouter } = require('./whatsapp/webhook');
const { getPool } = require('./db/pool');

app.use('/api/whatsapp/webhook', createWebhookRouter({ db: getPool() }));
```

> Colócalo de modo que `getPool()` se llame al montar; en test no se importa server.js, así que
> `getPool()` (que falla si no hay GASTOS_DB_URL) no se evalúa en los tests del webhook (que montan
> el router con un `db` de pg-mem). Verifica que el health test del Plan 1 (`tests/server.test.js`)
> SIGA verde — si montar el router hace que `getPool()` cree un Pool al cargar server.js y eso
> rompe el health test, envuélvelo para que el Pool se cree perezosamente (ya lo hace `getPool`),
> y confirma `npx jest tests/server.test.js` verde.

- [ ] **Step 6: Correr el webhook test, verificar que pasa.** `cd gastos && npx jest tests/whatsapp/webhook.test.js`

- [ ] **Step 7: Correr TODA la suite.** `cd gastos && npx jest` — todo verde (Plan 1 + Plan 2).

- [ ] **Step 8: Commit**

```bash
git add gastos/src/whatsapp/webhook.js gastos/src/expenses/intake.js gastos/src/server.js gastos/tests/whatsapp/webhook.test.js
git commit -m "feat(gastos): webhook WhatsApp (verify + intake imagen + confirmacion + resumen)"
```

---

## Cierre del Plan 2

Al terminar: el webhook recibe fotos por WhatsApp, las procesa con el motor del Plan 1, responde la
confirmación, acepta SÍ/NO/correcciones y entrega resúmenes a demanda — todo multi-tenant por
`phone_number_id`, con whitelist de empleados. Probado con supertest + pg-mem + mocks (sin red).

**Pendiente para planes siguientes:**
- Resumen **programado** (cron diario/semanal/mensual) — Task aparte o Plan 6 (deploy) con un
  scheduler; la agregación (`monthlySummary`) ya está lista.
- Guardado real de la **foto** (`foto_path`) en disco del VPS (hoy va `null` por WhatsApp).
- Dedup duro por `wa_message_id` (el índice parcial existe; el intake ya lo setea — verificar que
  un reenvío del mismo `wamid` no duplique: el índice único lo bloquea, manejar el error).
- Test de integración con número real + token (fuera de la suite).
