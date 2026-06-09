# Plan 3 — API app + Auth + API panel + Excel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-06-09-atiko-gastos-design.md` (§3.1, §4 panel, §6, §7)
**Depende de:** Plan 1 (motor+repo+DB) y Plan 2 (intake, summary). Ya implementados en `gastos/`.

**Goal:** Exponer las APIs HTTP que consumirán la app Android (Plan 4) y el panel web (Plan 5): login con JWT (empleado para la app, dueño/admin para el panel), subir/confirmar/editar/listar gastos desde la app, y en el panel listar+filtrar gastos, exportar Excel, y gestionar empleados + ajustes de empresa. Todo multi-tenant: cada request queda acotado al `company_id` del token.

**Architecture:** Dos routers Express montados en el server del Plan 1: `/api/app/*` (auth de empleado) y `/api/panel/*` (auth de dueño/admin). Auth con JWT firmado con `JWT_SECRET` + passwords con bcrypt. El payload del token lleva `{kind, companyId, employeeId|userId, rol}`; un middleware lo verifica y deja `req.auth`. Cada query a la DB se filtra por `req.auth.companyId` (aislamiento de tenant). La lógica de auth (hash, firma, filtros de query, armado de Excel) se prueba con TDD; los routers con supertest + pg-mem + mocks del motor OCR.

**Tech Stack:** (Plan 1/2) + `bcryptjs`, `jsonwebtoken`, `exceljs`. supertest para routers.

---

## Estructura de archivos (Plan 3)

```
gastos/src/
  auth/
    password.js      # hashPassword, verifyPassword (bcryptjs)
    jwt.js           # signToken, verifyToken (jsonwebtoken, JWT_SECRET)
    middleware.js    # requireAuth, requireKind
  users/
    repo.js          # createUser, getUserByEmail (login del panel)
  companies/
    repo.js          # (MODIFICAR) + getEmployeeByUsuario, listEmployees, updateEmployee, deactivateEmployee, getCompany, updateCompany
  expenses/
    query.js         # listExpenses(db, companyId, filtros) con WHERE dinámico
  app/
    router.js        # /api/app: login, expenses (crear/confirmar/editar/rechazar/listar)
  panel/
    excel.js         # buildExpensesWorkbook(expenses) -> Buffer
    router.js        # /api/panel: login, expenses, expenses.xlsx, employees CRUD, company
gastos/tests/
  auth/password.test.js
  auth/jwt.test.js
  auth/middleware.test.js
  users/repo.test.js
  expenses/query.test.js
  app/router.test.js
  panel/excel.test.js
  panel/router.test.js
```

---

## Task 1: Passwords + JWT (+ deps)

**Files:**
- Modify: `gastos/package.json` (deps bcryptjs, jsonwebtoken, exceljs)
- Create: `gastos/src/auth/password.js`
- Create: `gastos/src/auth/jwt.js`
- Test: `gastos/tests/auth/password.test.js`
- Test: `gastos/tests/auth/jwt.test.js`

- [ ] **Step 1: Agregar deps a `gastos/package.json`** (en `dependencies`, mantener orden alfabético):
`"bcryptjs": "^2.4.3"`, `"exceljs": "^4.4.0"`, `"jsonwebtoken": "^9.0.2"`. Luego `cd gastos && npm install`.

- [ ] **Step 2: Escribir el test que falla** `gastos/tests/auth/password.test.js`:
```js
const { hashPassword, verifyPassword } = require('../../src/auth/password');

test('hashea y verifica password', async () => {
  const hash = await hashPassword('secreto123');
  expect(hash).not.toBe('secreto123');
  expect(await verifyPassword('secreto123', hash)).toBe(true);
  expect(await verifyPassword('malo', hash)).toBe(false);
});
```

- [ ] **Step 3: Escribir el test que falla** `gastos/tests/auth/jwt.test.js`:
```js
process.env.JWT_SECRET = 'test-secret';
const { signToken, verifyToken } = require('../../src/auth/jwt');

test('firma y verifica un token', () => {
  const t = signToken({ kind: 'employee', companyId: 'c1', employeeId: 'e1' });
  const p = verifyToken(t);
  expect(p.kind).toBe('employee');
  expect(p.companyId).toBe('c1');
  expect(p.employeeId).toBe('e1');
});

test('token invalido lanza', () => {
  expect(() => verifyToken('no-es-un-token')).toThrow();
});
```

- [ ] **Step 4: Correr y verificar que fallan.** `cd gastos && npx jest tests/auth/password.test.js tests/auth/jwt.test.js`

- [ ] **Step 5: Implementar** `gastos/src/auth/password.js`:
```js
const bcrypt = require('bcryptjs');

async function hashPassword(plain) {
  return bcrypt.hash(String(plain), 10);
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(String(plain), hash);
}

module.exports = { hashPassword, verifyPassword };
```

- [ ] **Step 6: Implementar** `gastos/src/auth/jwt.js`:
```js
const jwt = require('jsonwebtoken');

function secret() {
  return process.env.JWT_SECRET || 'dev-insecure-secret';
}

function signToken(payload, opts = {}) {
  return jwt.sign(payload, secret(), { expiresIn: opts.expiresIn || '30d' });
}

function verifyToken(token) {
  return jwt.verify(token, secret());
}

module.exports = { signToken, verifyToken };
```

- [ ] **Step 7: Correr y verificar que pasan.** `cd gastos && npx jest tests/auth/password.test.js tests/auth/jwt.test.js`

- [ ] **Step 8: Commit**
```bash
git add gastos/package.json gastos/package-lock.json gastos/src/auth/password.js gastos/src/auth/jwt.js gastos/tests/auth/password.test.js gastos/tests/auth/jwt.test.js
git commit -m "feat(gastos): auth base (bcrypt password + JWT)"
```

---

## Task 2: Middleware de auth + users repo + employee-por-usuario

**Files:**
- Create: `gastos/src/auth/middleware.js`
- Create: `gastos/src/users/repo.js`
- Modify: `gastos/src/companies/repo.js` (agregar `getEmployeeByUsuario`)
- Test: `gastos/tests/auth/middleware.test.js`
- Test: `gastos/tests/users/repo.test.js`

- [ ] **Step 1: Escribir el test que falla** `gastos/tests/auth/middleware.test.js`:
```js
process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { signToken } = require('../../src/auth/jwt');
const { requireAuth, requireKind } = require('../../src/auth/middleware');

function appWith(mw) {
  const app = express();
  app.get('/p', mw, (req, res) => res.json({ auth: req.auth }));
  return app;
}

test('requireAuth rechaza sin token (401)', async () => {
  const res = await request(appWith(requireAuth)).get('/p');
  expect(res.status).toBe(401);
});

test('requireAuth acepta Bearer valido y setea req.auth', async () => {
  const token = signToken({ kind: 'employee', companyId: 'c1', employeeId: 'e1' });
  const res = await request(appWith(requireAuth)).get('/p').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.auth.companyId).toBe('c1');
});

test('requireKind bloquea kind equivocado (403)', async () => {
  const app = express();
  app.get('/p', requireAuth, requireKind('user'), (req, res) => res.json({ ok: true }));
  const token = signToken({ kind: 'employee', companyId: 'c1', employeeId: 'e1' });
  const res = await request(app).get('/p').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(403);
});
```

- [ ] **Step 2: Escribir el test que falla** `gastos/tests/users/repo.test.js`:
```js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createUser, getUserByEmail } = require('../../src/users/repo');

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
  return { db: client, companyId: c.rows[0].id };
}

test('crea usuario y lo busca por email', async () => {
  const { db, companyId } = await freshDb();
  const u = await createUser(db, { company_id: companyId, email: 'jefe@x.cl', password_hash: 'H', rol: 'owner' });
  expect(u.email).toBe('jefe@x.cl');
  const found = await getUserByEmail(db, 'jefe@x.cl');
  expect(found.id).toBe(u.id);
  expect(await getUserByEmail(db, 'no@x.cl')).toBeNull();
});
```

- [ ] **Step 3: Correr y verificar que fallan.** `cd gastos && npx jest tests/auth/middleware.test.js tests/users/repo.test.js`

- [ ] **Step 4: Implementar** `gastos/src/auth/middleware.js`:
```js
const { verifyToken } = require('./jwt');

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: 'no_token' });
  try {
    req.auth = verifyToken(m[1]);
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'token_invalido' });
  }
}

function requireKind(kind) {
  return (req, res, next) => {
    if (!req.auth || req.auth.kind !== kind) return res.status(403).json({ error: 'prohibido' });
    return next();
  };
}

module.exports = { requireAuth, requireKind };
```

- [ ] **Step 5: Implementar** `gastos/src/users/repo.js`:
```js
async function createUser(db, data) {
  const cols = ['company_id', 'email', 'password_hash', 'rol'].filter((f) => data[f] !== undefined);
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
  const r = await db.query(`INSERT INTO users(${cols.join(', ')}) VALUES(${ph}) RETURNING *`, cols.map((f) => data[f]));
  return r.rows[0];
}

async function getUserByEmail(db, email) {
  const r = await db.query('SELECT * FROM users WHERE email=$1', [email]);
  return r.rows[0] || null;
}

module.exports = { createUser, getUserByEmail };
```

- [ ] **Step 6: Agregar a `gastos/src/companies/repo.js`** la función `getEmployeeByUsuario` (y exportarla):
```js
async function getEmployeeByUsuario(db, usuario) {
  const r = await db.query('SELECT * FROM employees WHERE usuario=$1 AND activo=true LIMIT 1', [usuario]);
  return r.rows[0] || null;
}
```
Actualizar el `module.exports` para incluir `getEmployeeByUsuario` junto a las funciones existentes. NO tocar las funciones existentes.

- [ ] **Step 7: Correr y verificar que pasan.** `cd gastos && npx jest tests/auth/middleware.test.js tests/users/repo.test.js`

- [ ] **Step 8: Commit**
```bash
git add gastos/src/auth/middleware.js gastos/src/users/repo.js gastos/src/companies/repo.js gastos/tests/auth/middleware.test.js gastos/tests/users/repo.test.js
git commit -m "feat(gastos): middleware auth + users repo + employee por usuario"
```

---

## Task 3: API de la app (login + gastos)

**Files:**
- Create: `gastos/src/app/router.js`
- Modify: `gastos/src/server.js` (montar `/api/app`)
- Test: `gastos/tests/app/router.test.js`

Endpoints (todos bajo `/api/app`):
- `POST /login` `{usuario, password}` → verifica empleado → `{token, employee}`.
- `POST /expenses` (auth empleado) `{imageBase64, mimeType}` → intakeFromImage(canal 'app') → gasto.
- `POST /expenses/:id/confirm` (auth, dueño del tenant) → confirmExpense.
- `PATCH /expenses/:id` (auth) `{...campos editables}` → updateExpense.
- `POST /expenses/:id/reject` (auth) → rejectExpense.
- `GET /expenses` (auth) → últimos gastos del empleado.

- [ ] **Step 1: Escribir el test que falla** `gastos/tests/app/router.test.js`:
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
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const db = mem.adapters.createPg();
  const client = new db.Pool();
  await migrate(client).catch(() => {});
  return client;
}

async function seedEmployee(db) {
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const hash = await hashPassword('clave');
  const e = await db.query(
    "INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'Juan','juan',$2) RETURNING id",
    [c.rows[0].id, hash]
  );
  return { companyId: c.rows[0].id, employeeId: e.rows[0].id };
}

function buildApp(db, deps) {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use('/api/app', createAppRouter({ db, ...deps }));
  return app;
}

async function loginToken(app) {
  const res = await request(app).post('/api/app/login').send({ usuario: 'juan', password: 'clave' });
  return res.body.token;
}

test('login correcto devuelve token; incorrecto 401', async () => {
  const db = await freshDb(); await seedEmployee(db);
  const app = buildApp(db, {});
  const ok = await request(app).post('/api/app/login').send({ usuario: 'juan', password: 'clave' });
  expect(ok.status).toBe(200);
  expect(ok.body.token).toBeTruthy();
  const bad = await request(app).post('/api/app/login').send({ usuario: 'juan', password: 'x' });
  expect(bad.status).toBe(401);
});

test('crear gasto con imagen (auth) corre el motor y guarda canal app', async () => {
  const db = await freshDb(); await seedEmployee(db);
  const extractExpense = jest.fn().mockResolvedValue({ proveedor: 'Copec', total: 25000, categoria: 'Otros gastos', cuenta_sii_codigo: '4.3.150.1', cuenta_sii_nombre: 'X' });
  const app = buildApp(db, { extractExpense });
  const token = await loginToken(app);
  const res = await request(app).post('/api/app/expenses')
    .set('Authorization', `Bearer ${token}`)
    .send({ imageBase64: Buffer.from('img').toString('base64'), mimeType: 'image/jpeg' });
  expect(res.status).toBe(201);
  expect(res.body.canal).toBe('app');
  expect(res.body.estado).toBe('pendiente_confirmacion');
  expect(extractExpense).toHaveBeenCalled();
});

test('sin token => 401', async () => {
  const db = await freshDb(); await seedEmployee(db);
  const app = buildApp(db, {});
  const res = await request(app).post('/api/app/expenses').send({ imageBase64: 'x' });
  expect(res.status).toBe(401);
});

test('confirmar y listar mis gastos', async () => {
  const db = await freshDb(); const { } = await seedEmployee(db);
  const extractExpense = jest.fn().mockResolvedValue({ total: 1000, categoria: 'Otros gastos', cuenta_sii_codigo: '4.3.150.1', cuenta_sii_nombre: 'X' });
  const app = buildApp(db, { extractExpense });
  const token = await loginToken(app);
  const created = await request(app).post('/api/app/expenses').set('Authorization', `Bearer ${token}`).send({ imageBase64: 'x' });
  const id = created.body.id;
  const conf = await request(app).post(`/api/app/expenses/${id}/confirm`).set('Authorization', `Bearer ${token}`);
  expect(conf.status).toBe(200);
  expect(conf.body.estado).toBe('confirmado');
  const list = await request(app).get('/api/app/expenses').set('Authorization', `Bearer ${token}`);
  expect(list.status).toBe(200);
  expect(list.body.length).toBe(1);
});
```

- [ ] **Step 2: Correr y verificar que falla.** `cd gastos && npx jest tests/app/router.test.js`

- [ ] **Step 3: Implementar** `gastos/src/app/router.js`:
```js
const express = require('express');
const { getEmployeeByUsuario } = require('../companies/repo');
const { verifyPassword } = require('../auth/password');
const { signToken } = require('../auth/jwt');
const { requireAuth, requireKind } = require('../auth/middleware');
const { intakeFromImage } = require('../expenses/intake');
const { getExpense, confirmExpense, updateExpense, rejectExpense } = require('../expenses/repo');
const realExtract = require('../ocr/extract');

function createAppRouter({ db, extractExpense } = {}) {
  const _extract = extractExpense || realExtract.extractExpense;
  const router = express.Router();

  router.post('/login', async (req, res) => {
    const { usuario, password } = req.body || {};
    const emp = await getEmployeeByUsuario(db, usuario);
    if (!emp || !(await verifyPassword(password, emp.password_hash))) {
      return res.status(401).json({ error: 'credenciales' });
    }
    const token = signToken({ kind: 'employee', companyId: emp.company_id, employeeId: emp.id });
    return res.json({ token, employee: { id: emp.id, nombre: emp.nombre } });
  });

  router.use(requireAuth, requireKind('employee'));

  // Verifica que el gasto pertenezca al tenant del token.
  async function ownedExpense(req, res) {
    const exp = await getExpense(db, req.params.id);
    if (!exp || exp.company_id !== req.auth.companyId) { res.status(404).json({ error: 'no_existe' }); return null; }
    return exp;
  }

  router.post('/expenses', async (req, res) => {
    const { imageBase64, mimeType } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'falta_imagen' });
    const exp = await intakeFromImage({
      db, companyId: req.auth.companyId, employeeId: req.auth.employeeId,
      imageBuffer: Buffer.from(imageBase64, 'base64'), mimeType: mimeType || 'image/jpeg',
      canal: 'app', extract: _extract,
    });
    return res.status(201).json(exp);
  });

  router.post('/expenses/:id/confirm', async (req, res) => {
    if (!(await ownedExpense(req, res))) return;
    return res.json(await confirmExpense(db, req.params.id));
  });

  router.patch('/expenses/:id', async (req, res) => {
    if (!(await ownedExpense(req, res))) return;
    return res.json(await updateExpense(db, req.params.id, req.body || {}));
  });

  router.post('/expenses/:id/reject', async (req, res) => {
    if (!(await ownedExpense(req, res))) return;
    return res.json(await rejectExpense(db, req.params.id));
  });

  router.get('/expenses', async (req, res) => {
    const r = await db.query(
      `SELECT * FROM expenses WHERE company_id=$1 AND employee_id=$2 ORDER BY created_at DESC LIMIT 50`,
      [req.auth.companyId, req.auth.employeeId]
    );
    return res.json(r.rows);
  });

  return router;
}

module.exports = { createAppRouter };
```

- [ ] **Step 4: Correr y verificar que pasa.** `cd gastos && npx jest tests/app/router.test.js`

- [ ] **Step 5: Montar en `gastos/src/server.js`** (tras el webhook):
```js
const { createAppRouter } = require('./app/router');
app.use('/api/app', createAppRouter({ db: getPool() }));
```
Verificar que `tests/server.test.js` siga verde.

- [ ] **Step 6: Correr la suite completa.** `cd gastos && npx jest` — todo verde.

- [ ] **Step 7: Commit**
```bash
git add gastos/src/app/router.js gastos/src/server.js gastos/tests/app/router.test.js
git commit -m "feat(gastos): API app (login empleado + crear/confirmar/editar/listar gastos)"
```

---

## Task 4: Query de gastos del panel (filtros)

**Files:**
- Create: `gastos/src/expenses/query.js`
- Test: `gastos/tests/expenses/query.test.js`

`listExpenses(db, companyId, filtros)` con WHERE dinámico, SIEMPRE acotado por `company_id`.
Filtros: `from`/`to` (fecha rango ISO), `empleadoId`, `categoria`, `estado`, `tipoDocumento`,
`proveedor` (substring, case-insensitive). Orden por fecha desc, luego created_at desc. Límite 1000.

- [ ] **Step 1: Escribir el test que falla** `gastos/tests/expenses/query.test.js`:
```js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { listExpenses } = require('../../src/expenses/query');

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
  const c2 = await client.query("INSERT INTO companies(nombre) VALUES('Y') RETURNING id");
  const cid = c.rows[0].id;
  const ins = (fecha, categoria, estado, proveedor, total, company = cid) => client.query(
    `INSERT INTO expenses(company_id, fecha, categoria, estado, proveedor, total) VALUES($1,$2,$3,$4,$5,$6)`,
    [company, fecha, categoria, estado, proveedor, total]);
  await ins('2026-06-05', 'Combustible y transporte', 'confirmado', 'Copec', 25000);
  await ins('2026-06-10', 'Otros gastos', 'pendiente_confirmacion', 'Lider', 10000);
  await ins('2026-05-01', 'Otros gastos', 'confirmado', 'Lider', 5000);
  await ins('2026-06-09', 'Otros gastos', 'confirmado', 'COPEC SA', 7000, c2.rows[0].id); // otra empresa
  return { db: client, cid };
}

test('lista acotada por company_id y ordenada por fecha desc', async () => {
  const { db, cid } = await seed();
  const all = await listExpenses(db, cid, {});
  expect(all.map((r) => r.proveedor)).toEqual(['Lider', 'Copec', 'Lider']); // 06-10, 06-05, 05-01; NO la empresa Y
});

test('filtra por estado', async () => {
  const { db, cid } = await seed();
  const conf = await listExpenses(db, cid, { estado: 'confirmado' });
  expect(conf).toHaveLength(2);
});

test('filtra por rango de fecha', async () => {
  const { db, cid } = await seed();
  const jun = await listExpenses(db, cid, { from: '2026-06-01', to: '2026-06-30' });
  expect(jun).toHaveLength(2);
});

test('filtra por proveedor substring case-insensitive', async () => {
  const { db, cid } = await seed();
  const cop = await listExpenses(db, cid, { proveedor: 'copec' });
  expect(cop).toHaveLength(1);
  expect(cop[0].proveedor).toBe('Copec');
});
```

- [ ] **Step 2: Correr y verificar que falla.** `cd gastos && npx jest tests/expenses/query.test.js`

- [ ] **Step 3: Implementar** `gastos/src/expenses/query.js`:
```js
// Lista de gastos de UNA empresa con filtros opcionales. Siempre acotado por company_id.
async function listExpenses(db, companyId, filtros = {}) {
  const where = ['company_id = $1'];
  const vals = [companyId];
  const add = (sql, val) => { vals.push(val); where.push(sql.replace('?', `$${vals.length}`)); };

  if (filtros.from) add('fecha >= ?', filtros.from);
  if (filtros.to) add('fecha <= ?', filtros.to);
  if (filtros.empleadoId) add('employee_id = ?', filtros.empleadoId);
  if (filtros.categoria) add('categoria = ?', filtros.categoria);
  if (filtros.estado) add('estado = ?', filtros.estado);
  if (filtros.tipoDocumento) add('tipo_documento = ?', filtros.tipoDocumento);
  if (filtros.proveedor) add('LOWER(proveedor) LIKE LOWER(?)', `%${filtros.proveedor}%`);

  const r = await db.query(
    `SELECT * FROM expenses WHERE ${where.join(' AND ')}
     ORDER BY fecha DESC NULLS LAST, created_at DESC LIMIT 1000`,
    vals
  );
  return r.rows;
}

module.exports = { listExpenses };
```

- [ ] **Step 4: Correr y verificar que pasa.** `cd gastos && npx jest tests/expenses/query.test.js`

> Si pg-mem falla con `NULLS LAST`, quitarlo (`ORDER BY fecha DESC, created_at DESC`). Si falla
> `LOWER(proveedor) LIKE LOWER(?)`, probar `proveedor ILIKE ?`. Reportar el cambio.

- [ ] **Step 5: Commit**
```bash
git add gastos/src/expenses/query.js gastos/tests/expenses/query.test.js
git commit -m "feat(gastos): query de gastos del panel con filtros (acotado por tenant)"
```

---

## Task 5: Export Excel

**Files:**
- Create: `gastos/src/panel/excel.js`
- Test: `gastos/tests/panel/excel.test.js`

`buildExpensesWorkbook(expenses)` → Buffer xlsx con una fila por gasto y columnas:
Fecha, Empleado(employee_id), Proveedor, RUT, Folio, Tipo, Categoría, Cuenta SII, Neto, IVA,
Total, Estado. (El nombre del empleado se resuelve en el router; aquí entra lo que venga en
`empleado` si está, si no `employee_id`.)

- [ ] **Step 1: Escribir el test que falla** `gastos/tests/panel/excel.test.js`:
```js
const ExcelJS = require('exceljs');
const { buildExpensesWorkbook } = require('../../src/panel/excel');

test('arma un xlsx con header y una fila por gasto', async () => {
  const buf = await buildExpensesWorkbook([
    { fecha: '2026-06-05', empleado: 'Juan', proveedor: 'Copec', rut_emisor: '76086428-5', folio: '123',
      tipo_documento: 'boleta', categoria: 'Combustible y transporte', cuenta_sii_codigo: '4.3.150.1',
      neto: 21008, iva: 3992, total: 25000, estado: 'confirmado' },
  ]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  expect(ws.getRow(1).getCell(1).value).toBe('Fecha');
  expect(ws.getRow(1).getCell(3).value).toBe('Proveedor');
  const row2 = ws.getRow(2);
  expect(row2.getCell(3).value).toBe('Copec');
  expect(row2.getCell(11).value).toBe(25000);
});
```

- [ ] **Step 2: Correr y verificar que falla.** `cd gastos && npx jest tests/panel/excel.test.js`

- [ ] **Step 3: Implementar** `gastos/src/panel/excel.js`:
```js
const ExcelJS = require('exceljs');

const COLUMNS = [
  { header: 'Fecha', key: 'fecha', width: 12 },
  { header: 'Empleado', key: 'empleado', width: 18 },
  { header: 'Proveedor', key: 'proveedor', width: 22 },
  { header: 'RUT', key: 'rut_emisor', width: 14 },
  { header: 'Folio', key: 'folio', width: 12 },
  { header: 'Tipo', key: 'tipo_documento', width: 10 },
  { header: 'Categoría', key: 'categoria', width: 26 },
  { header: 'Cuenta SII', key: 'cuenta_sii_codigo', width: 12 },
  { header: 'Neto', key: 'neto', width: 12 },
  { header: 'IVA', key: 'iva', width: 12 },
  { header: 'Total', key: 'total', width: 12 },
  { header: 'Estado', key: 'estado', width: 18 },
];

async function buildExpensesWorkbook(expenses = []) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Gastos');
  ws.columns = COLUMNS;
  ws.getRow(1).font = { bold: true };
  for (const e of expenses) {
    ws.addRow({
      fecha: e.fecha || '',
      empleado: e.empleado || e.employee_id || '',
      proveedor: e.proveedor || '',
      rut_emisor: e.rut_emisor || '',
      folio: e.folio || '',
      tipo_documento: e.tipo_documento || '',
      categoria: e.categoria || '',
      cuenta_sii_codigo: e.cuenta_sii_codigo || '',
      neto: Number(e.neto) || 0,
      iva: Number(e.iva) || 0,
      total: Number(e.total) || 0,
      estado: e.estado || '',
    });
  }
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

module.exports = { buildExpensesWorkbook, COLUMNS };
```

- [ ] **Step 4: Correr y verificar que pasa.** `cd gastos && npx jest tests/panel/excel.test.js`

- [ ] **Step 5: Commit**
```bash
git add gastos/src/panel/excel.js gastos/tests/panel/excel.test.js
git commit -m "feat(gastos): export Excel de gastos (exceljs)"
```

---

## Task 6: API del panel (login, gastos, xlsx, empleados, empresa)

**Files:**
- Modify: `gastos/src/companies/repo.js` (agregar `listEmployees`, `updateEmployee`, `deactivateEmployee`, `getCompany`, `updateCompany`)
- Create: `gastos/src/panel/router.js`
- Modify: `gastos/src/server.js` (montar `/api/panel`)
- Test: `gastos/tests/panel/router.test.js`

Endpoints (`/api/panel`, auth kind 'user'):
- `POST /login` `{email, password}` → `{token, user}`.
- `GET /expenses?from&to&empleadoId&categoria&estado&tipoDocumento&proveedor` → lista (acotada al tenant).
- `GET /expenses.xlsx?<mismos filtros>` → archivo xlsx.
- `GET /employees` / `POST /employees` `{nombre,phone,usuario,password}` / `PATCH /employees/:id` / `DELETE /employees/:id` (desactiva).
- `GET /company` / `PATCH /company` `{owner_whatsapp,resumen_frecuencia,...}`.

- [ ] **Step 1: Escribir el test que falla** `gastos/tests/panel/router.test.js`:
```js
process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const ExcelJS = require('exceljs');
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
  const db = mem.adapters.createPg();
  const client = new db.Pool();
  await migrate(client).catch(() => {});
  return client;
}

async function seedOwner(db) {
  const c = await db.query("INSERT INTO companies(nombre, owner_whatsapp) VALUES('X','56999') RETURNING id");
  const cid = c.rows[0].id;
  const hash = await hashPassword('clave');
  await db.query("INSERT INTO users(company_id, email, password_hash, rol) VALUES($1,'jefe@x.cl',$2,'owner')", [cid, hash]);
  await db.query("INSERT INTO expenses(company_id, fecha, proveedor, total, estado, categoria) VALUES($1,'2026-06-05','Copec',25000,'confirmado','Otros gastos')", [cid]);
  return cid;
}

function buildApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/panel', createPanelRouter({ db }));
  return app;
}
async function token(app) {
  const r = await request(app).post('/api/panel/login').send({ email: 'jefe@x.cl', password: 'clave' });
  return r.body.token;
}

test('login owner ok/mal', async () => {
  const db = await freshDb(); await seedOwner(db);
  const app = buildApp(db);
  expect((await request(app).post('/api/panel/login').send({ email: 'jefe@x.cl', password: 'clave' })).status).toBe(200);
  expect((await request(app).post('/api/panel/login').send({ email: 'jefe@x.cl', password: 'x' })).status).toBe(401);
});

test('lista gastos del tenant', async () => {
  const db = await freshDb(); await seedOwner(db);
  const app = buildApp(db); const t = await token(app);
  const res = await request(app).get('/api/panel/expenses').set('Authorization', `Bearer ${t}`);
  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(1);
  expect(res.body[0].proveedor).toBe('Copec');
});

test('descarga xlsx', async () => {
  const db = await freshDb(); await seedOwner(db);
  const app = buildApp(db); const t = await token(app);
  const res = await request(app).get('/api/panel/expenses.xlsx').set('Authorization', `Bearer ${t}`).buffer().parse((r, cb) => {
    const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toContain('spreadsheet');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(res.body);
  expect(wb.worksheets[0].getRow(2).getCell(3).value).toBe('Copec');
});

test('crea empleado y lo lista', async () => {
  const db = await freshDb(); await seedOwner(db);
  const app = buildApp(db); const t = await token(app);
  const cr = await request(app).post('/api/panel/employees').set('Authorization', `Bearer ${t}`)
    .send({ nombre: 'Ana', phone: '56911', usuario: 'ana', password: 'clave' });
  expect(cr.status).toBe(201);
  expect(cr.body.password_hash).toBeUndefined(); // no filtrar el hash
  const list = await request(app).get('/api/panel/employees').set('Authorization', `Bearer ${t}`);
  expect(list.body.length).toBe(1);
});

test('actualiza ajustes de empresa', async () => {
  const db = await freshDb(); await seedOwner(db);
  const app = buildApp(db); const t = await token(app);
  const res = await request(app).patch('/api/panel/company').set('Authorization', `Bearer ${t}`).send({ resumen_frecuencia: 'semanal' });
  expect(res.status).toBe(200);
  expect(res.body.resumen_frecuencia).toBe('semanal');
});

test('sin token 401', async () => {
  const db = await freshDb(); await seedOwner(db);
  const app = buildApp(db);
  expect((await request(app).get('/api/panel/expenses')).status).toBe(401);
});
```

- [ ] **Step 2: Correr y verificar que falla.** `cd gastos && npx jest tests/panel/router.test.js`

- [ ] **Step 3: Agregar a `gastos/src/companies/repo.js`** (y exportarlas):
```js
async function listEmployees(db, companyId) {
  const r = await db.query('SELECT id, company_id, nombre, phone, usuario, rol, activo, created_at FROM employees WHERE company_id=$1 ORDER BY created_at DESC', [companyId]);
  return r.rows;
}

async function updateEmployee(db, companyId, id, patch) {
  const cols = ['nombre', 'phone', 'usuario', 'rol', 'activo'].filter((f) => patch[f] !== undefined);
  if (!cols.length) return null;
  const set = cols.map((f, i) => `${f}=$${i + 3}`).join(', ');
  const r = await db.query(
    `UPDATE employees SET ${set} WHERE id=$1 AND company_id=$2 RETURNING id, company_id, nombre, phone, usuario, rol, activo`,
    [id, companyId, ...cols.map((f) => patch[f])]
  );
  return r.rows[0] || null;
}

async function deactivateEmployee(db, companyId, id) {
  const r = await db.query('UPDATE employees SET activo=false WHERE id=$1 AND company_id=$2 RETURNING id', [id, companyId]);
  return r.rows[0] || null;
}

async function getCompany(db, companyId) {
  const r = await db.query('SELECT id, nombre, rut, wa_phone_number_id, owner_nombre, owner_whatsapp, resumen_frecuencia, created_at FROM companies WHERE id=$1', [companyId]);
  return r.rows[0] || null;
}

async function updateCompany(db, companyId, patch) {
  const cols = ['nombre', 'rut', 'owner_nombre', 'owner_whatsapp', 'resumen_frecuencia'].filter((f) => patch[f] !== undefined);
  if (!cols.length) return getCompany(db, companyId);
  const set = cols.map((f, i) => `${f}=$${i + 2}`).join(', ');
  await db.query(`UPDATE companies SET ${set} WHERE id=$1`, [companyId, ...cols.map((f) => patch[f])]);
  return getCompany(db, companyId);
}
```
Agregarlas al `module.exports` existente (junto a createCompany/createEmployee/getCompanyByPhoneNumberId/getEmployeeByPhone/getEmployeeByUsuario). NO tocar las funciones existentes.

- [ ] **Step 4: Implementar** `gastos/src/panel/router.js`:
```js
const express = require('express');
const { getUserByEmail } = require('../users/repo');
const { verifyPassword, hashPassword } = require('../auth/password');
const { signToken } = require('../auth/jwt');
const { requireAuth, requireKind } = require('../auth/middleware');
const { listExpenses } = require('../expenses/query');
const { buildExpensesWorkbook } = require('./excel');
const {
  createEmployee, listEmployees, updateEmployee, deactivateEmployee, getCompany, updateCompany,
} = require('../companies/repo');

function parseFiltros(q = {}) {
  return {
    from: q.from, to: q.to, empleadoId: q.empleadoId, categoria: q.categoria,
    estado: q.estado, tipoDocumento: q.tipoDocumento, proveedor: q.proveedor,
  };
}

function createPanelRouter({ db } = {}) {
  const router = express.Router();

  router.post('/login', async (req, res) => {
    const { email, password } = req.body || {};
    const user = await getUserByEmail(db, email);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'credenciales' });
    }
    const token = signToken({ kind: 'user', companyId: user.company_id, userId: user.id, rol: user.rol });
    return res.json({ token, user: { id: user.id, email: user.email, rol: user.rol } });
  });

  router.use(requireAuth, requireKind('user'));

  router.get('/expenses', async (req, res) => {
    const rows = await listExpenses(db, req.auth.companyId, parseFiltros(req.query));
    return res.json(rows);
  });

  router.get('/expenses.xlsx', async (req, res) => {
    const rows = await listExpenses(db, req.auth.companyId, parseFiltros(req.query));
    const buf = await buildExpensesWorkbook(rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="gastos.xlsx"');
    return res.send(buf);
  });

  router.get('/employees', async (req, res) => {
    return res.json(await listEmployees(db, req.auth.companyId));
  });

  router.post('/employees', async (req, res) => {
    const { nombre, phone, usuario, password, rol } = req.body || {};
    if (!nombre) return res.status(400).json({ error: 'falta_nombre' });
    const password_hash = password ? await hashPassword(password) : null;
    const emp = await createEmployee(db, { company_id: req.auth.companyId, nombre, phone, usuario, password_hash, rol });
    const { password_hash: _omit, ...safe } = emp;
    return res.status(201).json(safe);
  });

  router.patch('/employees/:id', async (req, res) => {
    const upd = await updateEmployee(db, req.auth.companyId, req.params.id, req.body || {});
    if (!upd) return res.status(404).json({ error: 'no_existe' });
    return res.json(upd);
  });

  router.delete('/employees/:id', async (req, res) => {
    const out = await deactivateEmployee(db, req.auth.companyId, req.params.id);
    if (!out) return res.status(404).json({ error: 'no_existe' });
    return res.json({ ok: true });
  });

  router.get('/company', async (req, res) => {
    return res.json(await getCompany(db, req.auth.companyId));
  });

  router.patch('/company', async (req, res) => {
    return res.json(await updateCompany(db, req.auth.companyId, req.body || {}));
  });

  return router;
}

module.exports = { createPanelRouter };
```

- [ ] **Step 5: Correr y verificar que pasa.** `cd gastos && npx jest tests/panel/router.test.js`

- [ ] **Step 6: Montar en `gastos/src/server.js`** (tras `/api/app`):
```js
const { createPanelRouter } = require('./panel/router');
app.use('/api/panel', createPanelRouter({ db: getPool() }));
```

- [ ] **Step 7: Correr TODA la suite.** `cd gastos && npx jest` — todo verde (Plan 1 + 2 + 3).

- [ ] **Step 8: Commit**
```bash
git add gastos/src/companies/repo.js gastos/src/panel/router.js gastos/src/server.js gastos/tests/panel/router.test.js
git commit -m "feat(gastos): API panel (login, gastos, xlsx, empleados, empresa)"
```

---

## Cierre del Plan 3

Al terminar: la app puede autenticar empleados, subir fotos (motor OCR), confirmar/editar/listar; y
el panel puede autenticar al dueño, listar+filtrar gastos del tenant, descargar Excel, gestionar
empleados y ajustes — todo acotado por `company_id` del token. Probado con supertest + pg-mem + mocks.

**Pendiente para planes siguientes:**
- **Plan 4** (app Android Capacitor) consume `/api/app`.
- **Plan 5** (panel web) consume `/api/panel`.
- **Plan 6** (deploy): `deploy-gastos.js`, Caddy, contenedor `atiko-gastos-db`, seed del super-admin
  Atiko + alta de la 1ª empresa cliente, cron del resumen, storage de fotos.
- Rate limiting + CORS para los routers (hoy sin límites); refresh tokens; recuperación de password.
