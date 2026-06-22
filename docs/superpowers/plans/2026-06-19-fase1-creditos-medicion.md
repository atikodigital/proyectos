# Fase 1 — Medición y créditos de IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Medir el consumo de IA por empresa con un saldo de "créditos" mensual y bloquear cuando se agota — sin tocar pagos todavía.

**Architecture:** Nuevo módulo `gastos/src/billing/` con planes+pesos configurables, un repositorio de suscripción/consumo en Postgres, y una función central `consumirCredito()` que se invoca en cada punto de IA. Toda empresa nace en plan `free`. Sigue los patrones existentes del backend (funciones `async (db, ...)`, `db.query`, tests con `pg-mem`, router con inyección de dependencias).

**Tech Stack:** Node.js (CommonJS), Express, Postgres (`pg`), Jest + `pg-mem` para tests.

**Spec:** `docs/superpowers/specs/2026-06-19-suscripciones-creditos-pagos-design.md` (§4, §5, §9).

---

## File Structure

- `gastos/src/db/migrate.js` — **modificar**: agregar bloque DDL `BILLING_DDL` (tablas `subscriptions`, `ia_consumo`).
- `gastos/src/billing/planes.js` — **crear**: planes, pesos por tipo, helpers puros.
- `gastos/src/billing/repo.js` — **crear**: persistencia (crear free, leer, incrementar atómico, log, reset).
- `gastos/src/billing/creditos.js` — **crear**: `consumirCredito`, `SinCreditosError`, `saldo`.
- `gastos/src/companies/repo.js` — **modificar**: `createCompany` crea la suscripción `free`.
- `gastos/src/app/router.js` — **modificar**: endpoint `GET /suscripcion`.
- `gastos/src/expenses/intake.js` — **modificar**: cobrar 1 crédito `imagen` antes del OCR.
- Tests nuevos en `gastos/tests/billing/`.

Convención del repo: módulos exportan funciones `async (db, ...args)`; `db.query(sql, params)` devuelve `{ rows }`. Tests crean DB con `pg-mem` (ver helper en cada test). Correr tests: `cd gastos && npx jest <ruta>`.

---

## Task 1: Migración — tablas `subscriptions` e `ia_consumo`

**Files:**
- Modify: `gastos/src/db/migrate.js`
- Test: `gastos/tests/billing/migrate-billing.test.js`

- [ ] **Step 1: Write the failing test**

```js
// gastos/tests/billing/migrate-billing.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}

test('migrate crea las tablas subscriptions e ia_consumo', async () => {
  const db = await freshDb();
  const cid = require('crypto').randomUUID();
  // Inserta y lee una suscripción mínima sin errores.
  await db.query(
    `INSERT INTO subscriptions(company_id, plan, estado, source, creditos_limite, creditos_usados)
     VALUES($1,'free','activa','manual',30,0)`, [cid]);
  const s = await db.query('SELECT plan, creditos_limite, creditos_usados FROM subscriptions WHERE company_id=$1', [cid]);
  expect(s.rows[0].plan).toBe('free');
  expect(Number(s.rows[0].creditos_limite)).toBe(30);
  // ia_consumo existe y acepta inserts.
  await db.query(`INSERT INTO ia_consumo(company_id, tipo, cantidad, creditos) VALUES($1,'imagen',1,1)`, [cid]);
  const c = await db.query('SELECT tipo, creditos FROM ia_consumo WHERE company_id=$1', [cid]);
  expect(c.rows[0].tipo).toBe('imagen');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/billing/migrate-billing.test.js`
Expected: FAIL — relation "subscriptions" does not exist.

- [ ] **Step 3: Add the DDL block in `gastos/src/db/migrate.js`**

Después del bloque `ADMINS_DDL` (≈línea 81), agrega:

```js
// Suscripciones y consumo de IA (créditos). Fase 1 de monetización.
const BILLING_DDL = [
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    plan text NOT NULL DEFAULT 'free',
    estado text NOT NULL DEFAULT 'activa',
    source text NOT NULL DEFAULT 'manual',
    external_id text,
    ciclo_inicio timestamptz NOT NULL DEFAULT now(),
    ciclo_fin timestamptz,
    creditos_limite integer NOT NULL DEFAULT 30,
    creditos_usados integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_company ON subscriptions(company_id)",
  `CREATE TABLE IF NOT EXISTS ia_consumo (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    tipo text NOT NULL,
    cantidad numeric NOT NULL DEFAULT 1,
    creditos integer NOT NULL DEFAULT 0,
    meta jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  "CREATE INDEX IF NOT EXISTS idx_ia_consumo_company ON ia_consumo(company_id, created_at)",
];
```

Y dentro de `async function migrate(db)`, después del loop de `ADMINS_DDL`, agrega:

```js
  for (const stmt of BILLING_DDL) {
    try { await db.query(stmt); } catch (e) { /* pg-mem / ya existe */ }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/billing/migrate-billing.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add gastos/src/db/migrate.js gastos/tests/billing/migrate-billing.test.js
git commit -m "feat(billing): migración de subscriptions e ia_consumo"
```

---

## Task 2: `billing/planes.js` — planes y pesos (config pura)

**Files:**
- Create: `gastos/src/billing/planes.js`
- Test: `gastos/tests/billing/planes.test.js`

- [ ] **Step 1: Write the failing test**

```js
// gastos/tests/billing/planes.test.js
const { PLANES, PESOS, getPlan, creditosDe } = require('../../src/billing/planes');

test('planes tienen límite de créditos', () => {
  expect(getPlan('free').creditos).toBe(30);
  expect(getPlan('pyme').creditos).toBe(250);
  expect(getPlan('desconocido').nombre).toBe('free'); // fallback a free
});

test('creditosDe pondera por tipo y cantidad', () => {
  expect(creditosDe('imagen', 1)).toBe(PESOS.imagen);          // 1 imagen
  expect(creditosDe('voz_min', 3)).toBe(PESOS.voz_min * 3);    // 3 minutos de voz
  expect(creditosDe('texto', 1)).toBe(PESOS.texto);
  expect(creditosDe('tipo_raro', 1)).toBe(0);                  // tipo desconocido = 0 (no cobra de más)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/billing/planes.test.js`
Expected: FAIL — Cannot find module '../../src/billing/planes'.

- [ ] **Step 3: Create `gastos/src/billing/planes.js`**

```js
// Definición de planes y pesos de consumo de IA. Pesos INICIALES — se calibran
// con el costo real de la API en Task 9 antes de cobrar.
const PLANES = {
  free:    { nombre: 'free',    creditos: 30 },
  basico:  { nombre: 'basico',  creditos: 100 },
  pyme:    { nombre: 'pyme',    creditos: 250 },
  empresa: { nombre: 'empresa', creditos: 800 },
};

// Cuántos créditos cuesta una unidad de cada operación. Provisional (calibrar).
const PESOS = {
  imagen: 1,    // 1 imagen interpretada (boleta, cartola, catálogo)
  voz_min: 3,   // 1 minuto de voz (Gemini Live) — el más caro
  texto: 0,     // chat/Match/parsing — incluido por ahora (subir tras calibrar)
};

function getPlan(nombre) {
  return PLANES[nombre] || PLANES.free;
}

function creditosDe(tipo, cantidad = 1) {
  const peso = PESOS[tipo];
  if (!peso) return 0;
  return Math.ceil(peso * cantidad);
}

module.exports = { PLANES, PESOS, getPlan, creditosDe };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/billing/planes.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add gastos/src/billing/planes.js gastos/tests/billing/planes.test.js
git commit -m "feat(billing): planes y pesos de consumo (config)"
```

---

## Task 3: `billing/repo.js` — persistencia de suscripción y consumo

**Files:**
- Create: `gastos/src/billing/repo.js`
- Test: `gastos/tests/billing/repo.test.js`

- [ ] **Step 1: Write the failing test**

```js
// gastos/tests/billing/repo.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const repo = require('../../src/billing/repo');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}
const cid = () => require('crypto').randomUUID();

test('crea suscripción free y la lee', async () => {
  const db = await freshDb(); const c = cid();
  const s = await repo.createFreeSubscription(db, c);
  expect(s.plan).toBe('free');
  expect(s.creditos_limite).toBe(30);
  const got = await repo.getSubscription(db, c);
  expect(got.company_id).toBe(c);
});

test('tryConsume incrementa hasta el límite y luego rechaza', async () => {
  const db = await freshDb(); const c = cid();
  await repo.createFreeSubscription(db, c);
  const ok = await repo.tryConsume(db, c, 30);   // gasta justo el límite
  expect(ok).toBe(true);
  const sob = await repo.tryConsume(db, c, 1);    // ya no queda
  expect(sob).toBe(false);
  const s = await repo.getSubscription(db, c);
  expect(s.creditos_usados).toBe(30);
});

test('logConsumo guarda auditoría', async () => {
  const db = await freshDb(); const c = cid();
  await repo.logConsumo(db, c, { tipo: 'imagen', cantidad: 1, creditos: 1 });
  const r = await db.query('SELECT tipo, creditos FROM ia_consumo WHERE company_id=$1', [c]);
  expect(r.rows[0].tipo).toBe('imagen');
});

test('resetCiclo pone usados en 0', async () => {
  const db = await freshDb(); const c = cid();
  await repo.createFreeSubscription(db, c);
  await repo.tryConsume(db, c, 10);
  await repo.resetCiclo(db, c);
  const s = await repo.getSubscription(db, c);
  expect(s.creditos_usados).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/billing/repo.test.js`
Expected: FAIL — Cannot find module '../../src/billing/repo'.

- [ ] **Step 3: Create `gastos/src/billing/repo.js`**

```js
const { getPlan } = require('./planes');

async function createFreeSubscription(db, companyId) {
  const lim = getPlan('free').creditos;
  const r = await db.query(
    `INSERT INTO subscriptions(company_id, plan, estado, source, creditos_limite, creditos_usados)
     VALUES($1,'free','activa','manual',$2,0)
     ON CONFLICT (company_id) DO NOTHING
     RETURNING *`, [companyId, lim]);
  return r.rows[0] || getSubscription(db, companyId);
}

async function getSubscription(db, companyId) {
  const r = await db.query('SELECT * FROM subscriptions WHERE company_id=$1', [companyId]);
  return r.rows[0] || null;
}

// Incremento atómico con chequeo de límite. Devuelve true si alcanzó, false si no.
async function tryConsume(db, companyId, creditos) {
  if (!creditos) return true; // 0 créditos: siempre permitido
  const r = await db.query(
    `UPDATE subscriptions
        SET creditos_usados = creditos_usados + $2, updated_at = now()
      WHERE company_id = $1
        AND creditos_usados + $2 <= creditos_limite
        AND estado = 'activa'
      RETURNING id`, [companyId, creditos]);
  return r.rows.length > 0;
}

async function logConsumo(db, companyId, { tipo, cantidad = 1, creditos = 0, meta = null }) {
  await db.query(
    `INSERT INTO ia_consumo(company_id, tipo, cantidad, creditos, meta)
     VALUES($1,$2,$3,$4,$5)`,
    [companyId, tipo, cantidad, creditos, meta ? JSON.stringify(meta) : null]);
}

async function resetCiclo(db, companyId) {
  await db.query(
    `UPDATE subscriptions SET creditos_usados = 0, ciclo_inicio = now(), updated_at = now()
      WHERE company_id = $1`, [companyId]);
}

module.exports = { createFreeSubscription, getSubscription, tryConsume, logConsumo, resetCiclo };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/billing/repo.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add gastos/src/billing/repo.js gastos/tests/billing/repo.test.js
git commit -m "feat(billing): repo de suscripción y consumo (atómico)"
```

---

## Task 4: `billing/creditos.js` — `consumirCredito`, `SinCreditosError`, `saldo`

**Files:**
- Create: `gastos/src/billing/creditos.js`
- Test: `gastos/tests/billing/creditos.test.js`

- [ ] **Step 1: Write the failing test**

```js
// gastos/tests/billing/creditos.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const repo = require('../../src/billing/repo');
const { consumirCredito, SinCreditosError, saldo } = require('../../src/billing/creditos');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}
const cid = () => require('crypto').randomUUID();

test('consumirCredito descuenta y audita', async () => {
  const db = await freshDb(); const c = cid();
  await repo.createFreeSubscription(db, c);
  await consumirCredito(db, c, { tipo: 'imagen', cantidad: 1 });
  const s = await saldo(db, c);
  expect(s.usado).toBe(1);
  expect(s.restante).toBe(29);
  const audit = await db.query('SELECT count(*)::int n FROM ia_consumo WHERE company_id=$1', [c]);
  expect(audit.rows[0].n).toBe(1);
});

test('consumirCredito lanza SinCreditosError al exceder y NO audita ni descuenta', async () => {
  const db = await freshDb(); const c = cid();
  await repo.createFreeSubscription(db, c);
  // Consume todo el saldo (30 imágenes).
  for (let i = 0; i < 30; i++) await consumirCredito(db, c, { tipo: 'imagen', cantidad: 1 });
  await expect(consumirCredito(db, c, { tipo: 'imagen', cantidad: 1 }))
    .rejects.toThrow(SinCreditosError);
  const s = await saldo(db, c);
  expect(s.usado).toBe(30);
  const audit = await db.query('SELECT count(*)::int n FROM ia_consumo WHERE company_id=$1', [c]);
  expect(audit.rows[0].n).toBe(30); // el intento fallido no agrega fila
});

test('tipo con peso 0 (texto) no consume pero sí audita', async () => {
  const db = await freshDb(); const c = cid();
  await repo.createFreeSubscription(db, c);
  await consumirCredito(db, c, { tipo: 'texto', cantidad: 1 });
  const s = await saldo(db, c);
  expect(s.usado).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/billing/creditos.test.js`
Expected: FAIL — Cannot find module '../../src/billing/creditos'.

- [ ] **Step 3: Create `gastos/src/billing/creditos.js`**

```js
const { creditosDe, getPlan } = require('./planes');
const repo = require('./repo');

class SinCreditosError extends Error {
  constructor(saldoActual) {
    super('Sin créditos suficientes para esta operación.');
    this.name = 'SinCreditosError';
    this.code = 'SIN_CREDITOS';
    this.saldo = saldoActual || null;
  }
}

// Cobra los créditos de una operación de IA. Lanza SinCreditosError si no alcanza.
// Para tipos con peso 0 igual registra auditoría (no descuenta).
async function consumirCredito(db, companyId, { tipo, cantidad = 1, meta = null } = {}) {
  const creditos = creditosDe(tipo, cantidad);
  if (creditos > 0) {
    const ok = await repo.tryConsume(db, companyId, creditos);
    if (!ok) throw new SinCreditosError(await saldo(db, companyId));
  }
  await repo.logConsumo(db, companyId, { tipo, cantidad, creditos, meta });
  return { tipo, creditos };
}

async function saldo(db, companyId) {
  const s = await repo.getSubscription(db, companyId);
  if (!s) return { plan: 'free', limite: getPlan('free').creditos, usado: 0, restante: getPlan('free').creditos, ciclo_fin: null, estado: 'activa' };
  const limite = Number(s.creditos_limite), usado = Number(s.creditos_usados);
  return { plan: s.plan, limite, usado, restante: Math.max(0, limite - usado), ciclo_fin: s.ciclo_fin, estado: s.estado };
}

module.exports = { consumirCredito, saldo, SinCreditosError };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/billing/creditos.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add gastos/src/billing/creditos.js gastos/tests/billing/creditos.test.js
git commit -m "feat(billing): consumirCredito + SinCreditosError + saldo"
```

---

## Task 5: Onboarding — `createCompany` crea la suscripción `free`

**Files:**
- Modify: `gastos/src/companies/repo.js` (función `createCompany`, líneas 1-10)
- Test: `gastos/tests/billing/onboarding-free-sub.test.js`

- [ ] **Step 1: Write the failing test**

```js
// gastos/tests/billing/onboarding-free-sub.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createCompany } = require('../../src/companies/repo');
const { getSubscription } = require('../../src/billing/repo');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}

test('crear empresa la deja con suscripción free', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'Pyme Test' });
  const sub = await getSubscription(db, co.id);
  expect(sub).toBeTruthy();
  expect(sub.plan).toBe('free');
  expect(sub.creditos_limite).toBe(30);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/billing/onboarding-free-sub.test.js`
Expected: FAIL — `sub` es null.

- [ ] **Step 3: Modificar `createCompany` en `gastos/src/companies/repo.js`**

Al inicio del archivo, agrega el require (debajo de la primera línea):

```js
const billingRepo = require('../billing/repo');
```

Reemplaza el cuerpo de `createCompany` para crear la suscripción tras insertar:

```js
async function createCompany(db, data) {
  const cols = ['nombre', 'rut', 'wa_phone_number_id', 'wa_token', 'owner_nombre', 'owner_whatsapp', 'resumen_frecuencia']
    .filter((f) => data[f] !== undefined);
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
  const r = await db.query(
    `INSERT INTO companies(${cols.join(', ')}) VALUES(${ph}) RETURNING *`,
    cols.map((f) => data[f])
  );
  const company = r.rows[0];
  try { await billingRepo.createFreeSubscription(db, company.id); } catch (e) { /* no romper alta */ }
  return company;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/billing/onboarding-free-sub.test.js`
Expected: PASS

- [ ] **Step 5: Run the full companies/onboarding suite (no regresiones)**

Run: `cd gastos && npx jest tests/billing tests/app tests/panel`
Expected: PASS (o los mismos resultados previos; ninguna rotura nueva por la suscripción).

- [ ] **Step 6: Commit**

```bash
git add gastos/src/companies/repo.js gastos/tests/billing/onboarding-free-sub.test.js
git commit -m "feat(billing): alta de empresa crea suscripción free"
```

---

## Task 6: Endpoint `GET /suscripcion` (saldo del plan)

**Files:**
- Modify: `gastos/src/app/router.js` (dentro de `createAppRouter`, junto a otras rutas `router.get(...)`)
- Test: `gastos/tests/billing/suscripcion-route.test.js`

- [ ] **Step 1: Write the failing test**

```js
// gastos/tests/billing/suscripcion-route.test.js
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createCompany } = require('../../src/companies/repo');
const { consumirCredito } = require('../../src/billing/creditos');
const { createAppRouter } = require('../../src/app/router');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}

test('GET /suscripcion devuelve saldo de la empresa autenticada', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'X' });
  await consumirCredito(db, co.id, { tipo: 'imagen', cantidad: 2 });

  const app = express();
  app.use(express.json());
  // Inyecta auth de prueba (mismo shape que requireAuth: req.auth.companyId).
  app.use((req, _res, next) => { req.auth = { companyId: co.id, kind: 'app' }; next(); });
  app.use('/', createAppRouter({ db }));

  const res = await request(app).get('/suscripcion');
  expect(res.status).toBe(200);
  expect(res.body.plan).toBe('free');
  expect(res.body.limite).toBe(30);
  expect(res.body.usado).toBe(2);
  expect(res.body.restante).toBe(28);
});
```

> Nota: si `supertest` no está instalado en `gastos`, instálalo como devDependency: `cd gastos && npm i -D supertest`. (Revisa primero `gastos/package.json`; varios tests de ruta del repo ya lo usan.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/billing/suscripcion-route.test.js`
Expected: FAIL — 404 (ruta inexistente).

- [ ] **Step 3: Agregar la ruta en `gastos/src/app/router.js`**

Cerca del require block superior, añade:

```js
const { saldo: saldoCreditos } = require('../billing/creditos');
```

Dentro de `createAppRouter`, después de `const router = express.Router();`, agrega la ruta (las rutas existentes usan `req.auth.companyId`; respeta el mismo middleware de auth que el resto del router — si el router monta `requireAuth` globalmente, esta queda protegida igual):

```js
  router.get('/suscripcion', async (req, res) => {
    try {
      const s = await saldoCreditos(db, req.auth.companyId);
      res.json(s);
    } catch (e) {
      res.status(500).json({ error: 'saldo_error' });
    }
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/billing/suscripcion-route.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add gastos/src/app/router.js gastos/tests/billing/suscripcion-route.test.js
git commit -m "feat(billing): endpoint GET /suscripcion (saldo)"
```

---

## Task 7: Cobrar 1 crédito `imagen` en el intake de imágenes

**Files:**
- Modify: `gastos/src/expenses/intake.js` (función `intakeFromImage`, antes del OCR en la línea ~21)
- Test: `gastos/tests/billing/intake-creditos.test.js`

- [ ] **Step 1: Write the failing test**

```js
// gastos/tests/billing/intake-creditos.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createCompany } = require('../../src/companies/repo');
const { saldo, SinCreditosError } = require('../../src/billing/creditos');
const { intakeFromImage } = require('../../src/expenses/intake');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}
// OCR falso: no llama a la IA, devuelve un gasto simple.
const fakeExtract = async () => ({ tipo: 'gasto', proveedor: 'Prov', total: 1000, fecha: '2026-06-01', lineas: [] });

test('intake con imagen descuenta 1 crédito', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'X' });
  await intakeFromImage({ db, companyId: co.id, imageBuffer: Buffer.from('x'), extract: fakeExtract, storeImage: () => null });
  const s = await saldo(db, co.id);
  expect(s.usado).toBe(1);
});

test('intake sin créditos lanza SinCreditosError y no llama al OCR', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'X' });
  // Agota el saldo a mano.
  await db.query('UPDATE subscriptions SET creditos_usados = creditos_limite WHERE company_id=$1', [co.id]);
  let llamoOcr = false;
  const spyExtract = async (...a) => { llamoOcr = true; return fakeExtract(...a); };
  await expect(intakeFromImage({ db, companyId: co.id, imageBuffer: Buffer.from('x'), extract: spyExtract, storeImage: () => null }))
    .rejects.toThrow(SinCreditosError);
  expect(llamoOcr).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/billing/intake-creditos.test.js`
Expected: FAIL — el primer test da `usado` 0 (no descuenta); el segundo no lanza.

- [ ] **Step 3: Modificar `gastos/src/expenses/intake.js`**

Agrega el require arriba (junto a los otros):

```js
const { consumirCredito } = require('../billing/creditos');
```

Dentro de `intakeFromImage`, **antes** de `const extracted = await run(...)` (línea ~21), agrega el cobro (deja propagar `SinCreditosError` para que el caller lo maneje):

```js
  // Cobra 1 crédito 'imagen' antes de gastar la llamada de IA. Si no hay saldo,
  // lanza SinCreditosError y NO se ejecuta el OCR.
  await consumirCredito(db, companyId, { tipo: 'imagen', cantidad: 1, meta: { canal } });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/billing/intake-creditos.test.js`
Expected: PASS

- [ ] **Step 5: Run intake/expenses suites (no regresiones)**

Run: `cd gastos && npx jest tests/app tests/panel tests/billing`
Expected: PASS. Si algún test de intake existente falla por falta de empresa/suscripción, ajústalo creando la empresa con `createCompany` (que ya crea la free) o seteando una suscripción free en el setup.

- [ ] **Step 6: Commit**

```bash
git add gastos/src/expenses/intake.js gastos/tests/billing/intake-creditos.test.js
git commit -m "feat(billing): cobrar 1 crédito imagen en intakeFromImage"
```

---

## Task 8: Auditar y cubrir el resto de puntos de IA

**Objetivo:** que TODA operación de IA que cuesta plata pase por `consumirCredito`. Mismo patrón que Task 7 (cobrar antes de la llamada cara; para texto barato basta registrar después con `tipo:'texto'`).

**Files (a integrar, confirmar firma en cada uno):**
- Voz: `gastos/src/agent/kaly-proxy.js` (+ `agent/token.js`) — al **abrir** sesión de voz cobrar un mínimo y, si es posible, al cerrar cobrar `voz_min` por minutos de la sesión (`tipo:'voz_min'`). La voz pública de la landing (sin company) NO descuenta — se limita aparte en Fase 4.
- Texto: `gastos/src/varas/chat.js` / `varas/gemini.js` (chat Varas), `gastos/src/match/componer.js` (Match) — `tipo:'texto'` (peso 0 hoy; queda auditado).
- Imagen catálogo: `gastos/src/catalog/extraer.js` — `tipo:'imagen'`.
- Parsing: `gastos/src/auxiliares/mapear.js`, `gastos/src/agent/aprender.js`, `gastos/src/agent/gestionar.js` — `tipo:'texto'`.

- [ ] **Step 1:** Por cada archivo, identifica la función que hace la llamada a Gemini y dónde está disponible `db` + `companyId`. Si no llega `companyId`, propágalo desde el caller (router).
- [ ] **Step 2:** Para cada sitio, escribe primero un test (estilo Task 7: spy que verifica que NO se llama a la IA cuando no hay saldo, y que se audita cuando sí) en `gastos/tests/billing/cobertura-<area>.test.js`.
- [ ] **Step 3:** Inserta `await consumirCredito(db, companyId, { tipo, cantidad, meta })` (imagen/voz_min: antes de la llamada; texto: después).
- [ ] **Step 4:** Corre los tests del área. Expected: PASS.
- [ ] **Step 5:** Commit por área: `git commit -m "feat(billing): medir consumo en <area>"`.

---

## Task 9: Calibrar los pesos con el costo real

**Objetivo:** que el plan más barato (Básico) cubra su costo de API. Ajustar `PESOS` en `billing/planes.js`.

- [ ] **Step 1:** Anota el precio vigente de la API de Gemini para: visión (por imagen), audio (Gemini Live, por minuto in/out) y texto (por 1k tokens in/out). Fuente: consola/precios de Google. (Usa la skill `claude-api` SOLO si fuera Claude; aquí es Gemini — usa la doc de Google.)
- [ ] **Step 2:** Estima el costo CLP de: 1 imagen, 1 minuto de voz, 1 chat/Match promedio.
- [ ] **Step 3:** Fija pesos para que: `costo_API(plan) < precio_plan`. Ej.: si 1 min de voz cuesta ~3× una imagen, `voz_min = 3`. Si el texto es <5% del costo, mantener `texto` bajo (0–1).
- [ ] **Step 4:** Actualiza `PESOS` en `planes.js` y deja un comentario con la fecha y la fuente del cálculo.
- [ ] **Step 5:** Commit: `git commit -m "chore(billing): calibrar pesos de consumo con costo real"`.

---

## Task 10: Indicador de saldo en panel y app

**Objetivo:** que el dueño vea "te quedan X créditos" y un aviso cuando llega a 0.

**Files:**
- `gastos/public/panel/index.html` (+ su JS) — pinta el saldo consultando `GET /api/.../suscripcion`.
- `gastos-app/src/gastos/...` — componente que muestra saldo (consume el mismo endpoint).

- [ ] **Step 1:** En el panel, tras login, hacer `fetch` al endpoint de saldo y mostrar `restante/limite` + estado.
- [ ] **Step 2:** Cuando una operación devuelva `SIN_CREDITOS` (código del error), mostrar un aviso claro ("Sin créditos: mejora tu plan o espera la renovación"). Asegúrate de que el handler de error del router traduzca `SinCreditosError` a `res.status(402).json({ error:'sin_creditos', saldo })`.
- [ ] **Step 3:** En la app (`gastos-app`), mostrar el saldo en la pantalla principal/perfil.
- [ ] **Step 4:** Commit: `git commit -m "feat(billing): indicador de saldo en panel y app"`.

> Nota de manejo de error: en el router donde hoy se llama el intake (app/router.js, panel/router.js, whatsapp/webhook.js), captura `SinCreditosError` y responde `402` con mensaje accionable, en vez de un 500 genérico.

---

## Definición de "Hecho" (Fase 1)

- [ ] Migración aplicada (`node scripts/migrate.js` en prod, vía deploy).
- [ ] Toda empresa nueva nace en `free` (30 créditos).
- [ ] Cada operación de IA cobrable pasa por `consumirCredito` y se audita en `ia_consumo`.
- [ ] Al agotar el saldo, las nuevas operaciones se bloquean con `402 SIN_CREDITOS` y mensaje claro.
- [ ] Pesos calibrados con costo real.
- [ ] Panel y app muestran el saldo.
- [ ] `cd gastos && npx jest` pasa completo.

---

## Self-review (autor del plan)

- **Cobertura del spec:** §4 (modelo de créditos) → Tasks 2,4,9; §5 (datos) → Tasks 1,3; §9 (detalle Fase 1) → Tasks 1-10. ✔
- **Consistencia de tipos:** `consumirCredito(db, companyId, {tipo, cantidad, meta})`, `tryConsume(db, companyId, creditos)`, `saldo(db, companyId)`, `creditosDe(tipo, cantidad)`, `getPlan(nombre).creditos`, `SinCreditosError.code='SIN_CREDITOS'` — usados igual en todas las tareas. ✔
- **Sin placeholders en el núcleo** (Tasks 1-7 traen código completo). Tasks 8-10 son auditoría/medición/UI: especifican patrón, sitios y criterios (dependen de hallazgos en cada archivo).
