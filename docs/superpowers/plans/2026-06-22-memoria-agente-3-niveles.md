# Memoria del agente en 3 niveles + aislamiento — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ordenar la memoria del agente (KALY/VARAS) en 3 niveles con aislamiento estricto por cuenta y por persona, verificado por tests.

**Architecture:** Se extiende la tabla `kaly_memory` con un eje de "dueño" del hecho (`owner_kind`/`owner_id`): empresa compartida (`'company'`) o privada de la persona (`'user'`/`'employee'`), siempre filtrada por `company_id`. Se endurecen `getAgentPrefs/setAgentPrefs` con `company_id`, `buildAgentContext` recibe la persona, y los endpoints `/kaly/memoria` ganan `alcance` + gestión (listar/borrar). El nivel 1 (conocimiento del sistema) queda en prompts; el nivel 3 (sesión) es efímero y se prueba que el contexto se arma fresco por cuenta.

**Tech Stack:** Node/Express, pg (Postgres), pg-mem + jest + supertest para tests.

**Spec:** `docs/superpowers/specs/2026-06-22-memoria-agente-3-niveles-design.md`

**Convenciones del repo (leer antes de empezar):**
- Tests con pg-mem: registrar `gen_random_uuid` (ver `gastos/tests/panel/kaly-endpoints.test.js`).
- Migraciones idempotentes con `ADD COLUMN IF NOT EXISTS` dentro de arrays con try/catch tolerante (`gastos/src/db/migrate.js`).
- Identidad de persona desde JWT: panel = `req.auth.kind='user'`, `req.auth.userId`; app = `req.auth.kind='employee'`, `req.auth.employeeId`.
- Correr tests desde `gastos/`: `cd gastos && npx jest <ruta>`.

---

## File Structure

- `gastos/src/db/migrate.js` — agrega `owner_kind`/`owner_id` + índice en `MEMORY_DDL`.
- `gastos/src/agent/memory.js` — funciones de memoria con eje owner + borrado/limpieza.
- `gastos/src/agent/context.js` — `buildAgentContext` recibe `owner` y filtra memoria por persona.
- `gastos/src/companies/repo.js` — `getAgentPrefs`/`setAgentPrefs` con `company_id`.
- `gastos/src/app/router.js` — `/agent/prefs`, `/agent/session`, `/kaly/memoria`.
- `gastos/src/panel/router.js` — `/agent/session`, `/kaly/memoria`.
- `gastos/src/agent/gestionar.js`, `aprender.js` — dedup contra memoria de empresa (default).
- Tests nuevos: `gastos/tests/agent/memory-scope.test.js`, `gastos/tests/agent/context-aislamiento.test.js`, `gastos/tests/agent/prefs-scope.test.js`, `gastos/tests/panel/memoria-personal.test.js`, `gastos/tests/app/memoria-personal.test.js`, `gastos/tests/panel/session-aislamiento.test.js`.

---

## Task 1: Migración — columnas owner + índice en kaly_memory

**Files:**
- Modify: `gastos/src/db/migrate.js:37-49` (array `MEMORY_DDL`)
- Test: `gastos/tests/agent/memory-scope.test.js` (se crea aquí; se reusa en Task 2)

- [ ] **Step 1: Escribir el test que falla**

Crear `gastos/tests/agent/memory-scope.test.js`:

```js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  return db;
}

test('kaly_memory tiene columnas owner_kind/owner_id con defaults', async () => {
  const db = await freshDb();
  const C = require('crypto').randomUUID();
  await db.query("INSERT INTO kaly_memory(company_id, tipo, contenido, origen) VALUES($1,'hecho','x','kaly')", [C]);
  const r = await db.query('SELECT owner_kind, owner_id FROM kaly_memory WHERE company_id=$1', [C]);
  expect(r.rows[0].owner_kind).toBe('company');
  expect(r.rows[0].owner_id == null).toBe(true);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd gastos && npx jest tests/agent/memory-scope.test.js -t "columnas owner"`
Expected: FAIL con error de columna inexistente (`column "owner_kind" does not exist`).

- [ ] **Step 3: Implementar — agregar columnas e índice**

En `gastos/src/db/migrate.js`, reemplazar el array `MEMORY_DDL` (líneas 37-49) por:

```js
const MEMORY_DDL = [
  `CREATE TABLE IF NOT EXISTS kaly_memory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    tipo text NOT NULL DEFAULT 'hecho',
    contenido text NOT NULL,
    origen text NOT NULL DEFAULT 'kaly',
    activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  "ALTER TABLE companies ADD COLUMN IF NOT EXISTS kaly_persona jsonb",
  // Eje de "dueño" del hecho: 'company' (compartido) | 'user'/'employee' (privado).
  "ALTER TABLE kaly_memory ADD COLUMN IF NOT EXISTS owner_kind text NOT NULL DEFAULT 'company'",
  "ALTER TABLE kaly_memory ADD COLUMN IF NOT EXISTS owner_id uuid",
  "CREATE INDEX IF NOT EXISTS idx_kaly_memory_scope ON kaly_memory(company_id, owner_kind, owner_id)",
];
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd gastos && npx jest tests/agent/memory-scope.test.js -t "columnas owner"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gastos/src/db/migrate.js gastos/tests/agent/memory-scope.test.js
git commit -m "feat(memoria): columnas owner_kind/owner_id + indice en kaly_memory"
```

---

## Task 2: memory.js — crear/listar memoria con eje owner

**Files:**
- Modify: `gastos/src/agent/memory.js:26-49`
- Test: `gastos/tests/agent/memory-scope.test.js`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `gastos/tests/agent/memory-scope.test.js`:

```js
const memory = require('../../src/agent/memory');

test('cross-tenant: empresa A no ve memoria de empresa B', async () => {
  const db = await freshDb();
  const A = require('crypto').randomUUID();
  const B = require('crypto').randomUUID();
  await memory.crearMemoria(db, A, { contenido: 'hecho de A', tipo: 'negocio' });
  await memory.crearMemoria(db, B, { contenido: 'hecho de B', tipo: 'negocio' });
  const listaA = await memory.listMemorias(db, A, { owner: { kind: 'user', id: 'u1' } });
  expect(listaA.map((m) => m.contenido)).toEqual(['hecho de A']);
});

test('personal: persona P2 no ve la memoria privada de P1; la de empresa la ven ambas', async () => {
  const db = await freshDb();
  const C = require('crypto').randomUUID();
  const P1 = require('crypto').randomUUID();
  const P2 = require('crypto').randomUUID();
  await memory.crearMemoria(db, C, { contenido: 'privado de P1', tipo: 'dueño', owner_kind: 'user', owner_id: P1 });
  await memory.crearMemoria(db, C, { contenido: 'de la empresa', tipo: 'negocio' }); // company por default
  const verP1 = (await memory.listMemorias(db, C, { owner: { kind: 'user', id: P1 } })).map((m) => m.contenido);
  const verP2 = (await memory.listMemorias(db, C, { owner: { kind: 'user', id: P2 } })).map((m) => m.contenido);
  expect(verP1.sort()).toEqual(['de la empresa', 'privado de P1'].sort());
  expect(verP2).toEqual(['de la empresa']);
});

test('listMemorias sin owner devuelve solo memoria de empresa (uso legacy/auto-aprender)', async () => {
  const db = await freshDb();
  const C = require('crypto').randomUUID();
  await memory.crearMemoria(db, C, { contenido: 'empresa', tipo: 'negocio' });
  await memory.crearMemoria(db, C, { contenido: 'privado', tipo: 'dueño', owner_kind: 'employee', owner_id: 'e1' });
  const lista = (await memory.listMemorias(db, C)).map((m) => m.contenido);
  expect(lista).toEqual(['empresa']);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd gastos && npx jest tests/agent/memory-scope.test.js`
Expected: FAIL (los nuevos tests fallan; `crearMemoria` ignora owner y `listMemorias` no filtra por persona).

- [ ] **Step 3: Implementar — memory.js**

En `gastos/src/agent/memory.js`, reemplazar `crearMemoria` (líneas 26-36) y `listMemorias` (líneas 37-43) por:

```js
async function crearMemoria(db, companyId, input) {
  const n = normalizeMemoria(input);
  if (!n) return null;
  const ORIGENES = ['kaly', 'dueño', 'auto'];
  const origen = input && ORIGENES.includes(input.origen) ? input.origen : 'kaly';
  const KINDS = ['company', 'user', 'employee'];
  const owner_kind = input && KINDS.includes(input.owner_kind) ? input.owner_kind : 'company';
  const owner_id = owner_kind === 'company' ? null : (input && input.owner_id) || null;
  const r = await db.query(
    "INSERT INTO kaly_memory(company_id, tipo, contenido, origen, owner_kind, owner_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id, tipo, contenido, origen, owner_kind, owner_id, created_at",
    [companyId, n.tipo, n.contenido, origen, owner_kind, owner_id]
  );
  return r.rows[0];
}

// owner: { kind, id } opcional. Sin owner → solo memoria de empresa.
async function listMemorias(db, companyId, { limite = 50, owner = null } = {}) {
  if (owner && owner.kind && owner.id) {
    const r = await db.query(
      "SELECT id, tipo, contenido, origen, owner_kind, created_at FROM kaly_memory WHERE company_id=$1 AND activo=true AND (owner_kind='company' OR (owner_kind=$2 AND owner_id=$3)) ORDER BY created_at DESC LIMIT $4",
      [companyId, owner.kind, owner.id, limite]
    );
    return r.rows;
  }
  const r = await db.query(
    "SELECT id, tipo, contenido, origen, owner_kind, created_at FROM kaly_memory WHERE company_id=$1 AND activo=true AND owner_kind='company' ORDER BY created_at DESC LIMIT $2",
    [companyId, limite]
  );
  return r.rows;
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd gastos && npx jest tests/agent/memory-scope.test.js`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/agent/memory.js gastos/tests/agent/memory-scope.test.js
git commit -m "feat(memoria): crear/listar con eje owner (empresa vs persona)"
```

---

## Task 3: memory.js — borrado con guard + limpieza por alcance

**Files:**
- Modify: `gastos/src/agent/memory.js:44-49`
- Test: `gastos/tests/agent/memory-scope.test.js`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `gastos/tests/agent/memory-scope.test.js`:

```js
test('borrarMemoria con owner: P2 no puede borrar lo privado de P1', async () => {
  const db = await freshDb();
  const C = require('crypto').randomUUID();
  const P1 = require('crypto').randomUUID();
  const P2 = require('crypto').randomUUID();
  const m = await memory.crearMemoria(db, C, { contenido: 'privado P1', owner_kind: 'user', owner_id: P1 });
  const noBorra = await memory.borrarMemoria(db, C, m.id, { owner: { kind: 'user', id: P2 } });
  expect(noBorra).toBe(null);
  const siBorra = await memory.borrarMemoria(db, C, m.id, { owner: { kind: 'user', id: P1 } });
  expect(siBorra && siBorra.id).toBe(m.id);
});

test('borrarMemoriasDe limpia toda la memoria personal de la persona', async () => {
  const db = await freshDb();
  const C = require('crypto').randomUUID();
  const P1 = require('crypto').randomUUID();
  await memory.crearMemoria(db, C, { contenido: 'a', owner_kind: 'user', owner_id: P1 });
  await memory.crearMemoria(db, C, { contenido: 'b', owner_kind: 'user', owner_id: P1 });
  await memory.crearMemoria(db, C, { contenido: 'empresa', tipo: 'negocio' });
  const n = await memory.borrarMemoriasDe(db, C, { ownerKind: 'user', ownerId: P1 });
  expect(n).toBe(2);
  const quedan = (await memory.listMemorias(db, C, { owner: { kind: 'user', id: P1 } })).map((m) => m.contenido);
  expect(quedan).toEqual(['empresa']);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd gastos && npx jest tests/agent/memory-scope.test.js -t "borrar"`
Expected: FAIL (`borrarMemoria` no acepta owner; `borrarMemoriasDe` no existe).

- [ ] **Step 3: Implementar — memory.js**

En `gastos/src/agent/memory.js`, reemplazar `borrarMemoria` (líneas 44-47) por lo siguiente y actualizar el `module.exports`:

```js
// Borra (soft-delete) por id. Si se pasa owner, solo borra si la fila es de
// empresa, o es personal y pertenece a esa persona.
async function borrarMemoria(db, companyId, id, { owner = null } = {}) {
  if (owner && owner.kind && owner.id) {
    const r = await db.query(
      "UPDATE kaly_memory SET activo=false, updated_at=now() WHERE id=$1 AND company_id=$2 AND (owner_kind='company' OR (owner_kind=$3 AND owner_id=$4)) RETURNING id",
      [id, companyId, owner.kind, owner.id]
    );
    return r.rows[0] || null;
  }
  const r = await db.query("UPDATE kaly_memory SET activo=false, updated_at=now() WHERE id=$1 AND company_id=$2 RETURNING id", [id, companyId]);
  return r.rows[0] || null;
}

// Limpia toda la memoria de un alcance. ownerKind='company' limpia la de empresa
// (owner_id se ignora). Devuelve cuántas filas se desactivaron.
async function borrarMemoriasDe(db, companyId, { ownerKind, ownerId }) {
  if (ownerKind === 'company') {
    const r = await db.query("UPDATE kaly_memory SET activo=false, updated_at=now() WHERE company_id=$1 AND owner_kind='company' AND activo=true RETURNING id", [companyId]);
    return r.rows.length;
  }
  const r = await db.query("UPDATE kaly_memory SET activo=false, updated_at=now() WHERE company_id=$1 AND owner_kind=$2 AND owner_id=$3 AND activo=true RETURNING id", [companyId, ownerKind, ownerId]);
  return r.rows.length;
}

module.exports = { normalizeMemoria, formatMemoriaBlock, TIPOS, crearMemoria, listMemorias, borrarMemoria, borrarMemoriasDe };
```

(Eliminar el `module.exports` anterior de la línea 49.)

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd gastos && npx jest tests/agent/memory-scope.test.js`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/agent/memory.js gastos/tests/agent/memory-scope.test.js
git commit -m "feat(memoria): borrado con guard de persona + borrarMemoriasDe"
```

---

## Task 4: getAgentPrefs/setAgentPrefs con company_id

**Files:**
- Modify: `gastos/src/companies/repo.js:83-97`
- Modify: `gastos/src/agent/context.js:14-20`
- Modify: `gastos/src/app/router.js` (handlers GET/PATCH `/agent/prefs`, ~líneas 256-263 del router app)
- Test: `gastos/tests/agent/prefs-scope.test.js` (nuevo)

- [ ] **Step 1: Escribir el test que falla**

Crear `gastos/tests/agent/prefs-scope.test.js`:

```js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createEmployee, getAgentPrefs, setAgentPrefs } = require('../../src/companies/repo');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  return db;
}

test('getAgentPrefs no cruza empresas: empleado de B no se lee desde empresa A', async () => {
  const db = await freshDb();
  const A = (await db.query("INSERT INTO companies(nombre) VALUES('A') RETURNING id")).rows[0].id;
  const B = (await db.query("INSERT INTO companies(nombre) VALUES('B') RETURNING id")).rows[0].id;
  const empB = await createEmployee(db, { company_id: B, nombre: 'Bob' });
  await setAgentPrefs(db, empB.id, B, { nombre: 'Bob', trato: 'señor' });
  // Leer ese empleado pero "desde" la empresa A → no debe devolver nada.
  const cruz = await getAgentPrefs(db, empB.id, A);
  expect(cruz).toEqual({});
  // Desde su propia empresa sí.
  const propio = await getAgentPrefs(db, empB.id, B);
  expect(propio.nombre).toBe('Bob');
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd gastos && npx jest tests/agent/prefs-scope.test.js`
Expected: FAIL (`getAgentPrefs` ignora el 3er argumento y devuelve los prefs igual).

- [ ] **Step 3: Implementar**

En `gastos/src/companies/repo.js`, reemplazar `getAgentPrefs` y `setAgentPrefs` (líneas 83-97) por:

```js
async function getAgentPrefs(db, employeeId, companyId) {
  if (!employeeId) return {};
  const r = await db.query('SELECT agent_prefs FROM employees WHERE id=$1 AND company_id=$2', [employeeId, companyId]);
  return (r.rows[0] && r.rows[0].agent_prefs) || {};
}

async function setAgentPrefs(db, employeeId, companyId, patch) {
  const prev = await getAgentPrefs(db, employeeId, companyId);
  const next = { ...prev };
  if (patch.nombre !== undefined) next.nombre = String(patch.nombre).slice(0, 60);
  if (patch.trato !== undefined) next.trato = String(patch.trato).slice(0, 20);
  if (patch.onboarded) next.onboarded_at = new Date().toISOString();
  if (patch.proactividad !== undefined) next.proactividad = Boolean(patch.proactividad);
  const r = await db.query('UPDATE employees SET agent_prefs=$1 WHERE id=$2 AND company_id=$3 RETURNING agent_prefs', [JSON.stringify(next), employeeId, companyId]);
  return r.rows[0] ? r.rows[0].agent_prefs : null;
}
```

En `gastos/src/agent/context.js`, cambiar la línea 14 (firma) y la línea 16 (llamada). La firma pasa a recibir `owner`, y se llama a `getAgentPrefs` con `companyId`:

```js
async function buildAgentContext(db, { companyId, employeeId, owner = null, now = new Date() }) {
  const [prefs, company, profile, memorias] = await Promise.all([
    getAgentPrefs(db, employeeId, companyId),
    getCompany(db, companyId),
    getCompanyProfile(db, companyId),
    listMemorias(db, companyId, { owner }),
  ]);
```

(El resto de `buildAgentContext` queda igual.)

En `gastos/src/app/router.js`, los handlers de `/agent/prefs` (buscar `getAgentPrefs(db, req.auth.employeeId)` y `setAgentPrefs(db, req.auth.employeeId, req.body || {})`):

```js
router.get('/agent/prefs', async (req, res) => {
  return res.json(await getAgentPrefs(db, req.auth.employeeId, req.auth.companyId));
});
router.patch('/agent/prefs', async (req, res) => {
  const prefs = await setAgentPrefs(db, req.auth.employeeId, req.auth.companyId, req.body || {});
  return res.json({ agent_prefs: prefs });
});
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd gastos && npx jest tests/agent/prefs-scope.test.js tests/agent-prefs.test.js`
Expected: PASS. (Si `tests/agent-prefs.test.js` falla por la nueva firma, actualizar sus llamadas a `getAgentPrefs(db, empId, companyId)`.)

- [ ] **Step 5: Commit**

```bash
git add gastos/src/companies/repo.js gastos/src/agent/context.js gastos/src/app/router.js gastos/tests/agent/prefs-scope.test.js gastos/tests/agent-prefs.test.js
git commit -m "fix(memoria): getAgentPrefs/setAgentPrefs filtran por company_id"
```

---

## Task 5: buildAgentContext recibe la persona + /agent/session pasa owner

**Files:**
- Modify: `gastos/src/app/router.js` (handler `/agent/session`)
- Modify: `gastos/src/panel/router.js` (handler `/agent/session`)
- Test: `gastos/tests/agent/context-aislamiento.test.js` (nuevo)

- [ ] **Step 1: Escribir el test que falla**

Crear `gastos/tests/agent/context-aislamiento.test.js`:

```js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { buildAgentContext } = require('../../src/agent/context');
const memory = require('../../src/agent/memory');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  return db;
}

test('buildAgentContext de empresa A no incluye memoria de empresa B', async () => {
  const db = await freshDb();
  const A = (await db.query("INSERT INTO companies(nombre) VALUES('Pizza A') RETURNING id")).rows[0].id;
  const B = (await db.query("INSERT INTO companies(nombre) VALUES('Pizza B') RETURNING id")).rows[0].id;
  await memory.crearMemoria(db, A, { contenido: 'secreto de A', tipo: 'negocio' });
  await memory.crearMemoria(db, B, { contenido: 'secreto de B', tipo: 'negocio' });
  const ctx = await buildAgentContext(db, { companyId: A, employeeId: null, owner: { kind: 'user', id: 'uA' } });
  expect(ctx.empresaNombre).toBe('Pizza A');
  const contenidos = (ctx.memorias || []).map((m) => m.contenido);
  expect(contenidos).toContain('secreto de A');
  expect(contenidos).not.toContain('secreto de B');
});

test('buildAgentContext incluye la memoria personal de la persona, no la de otra', async () => {
  const db = await freshDb();
  const C = (await db.query("INSERT INTO companies(nombre) VALUES('Pizza C') RETURNING id")).rows[0].id;
  await memory.crearMemoria(db, C, { contenido: 'privado de U1', owner_kind: 'user', owner_id: 'U1' });
  const ctx = await buildAgentContext(db, { companyId: C, employeeId: null, owner: { kind: 'user', id: 'U2' } });
  const contenidos = (ctx.memorias || []).map((m) => m.contenido);
  expect(contenidos).not.toContain('privado de U1');
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd gastos && npx jest tests/agent/context-aislamiento.test.js`
Expected: FAIL en el 2º test (sin `owner`, `buildAgentContext` traía toda la memoria de empresa; ahora debe filtrar). El 1º puede pasar ya.

- [ ] **Step 3: Implementar — pasar owner desde los endpoints**

En `gastos/src/app/router.js`, en el handler `POST /agent/session`, donde llama a `buildAgentContext`:

```js
const context = await buildAgentContext(db, {
  companyId: req.auth.companyId,
  employeeId: req.auth.employeeId,
  owner: { kind: 'employee', id: req.auth.employeeId },
});
```

En `gastos/src/panel/router.js`, en `POST /agent/session`:

```js
const context = await buildAgentContext(db, {
  companyId: req.auth.companyId,
  employeeId: null,
  owner: { kind: 'user', id: req.auth.userId },
});
```

(El resto del handler del panel — superponer `ownerPrefs` y devolver `{ ...tok, context }` — queda igual.)

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd gastos && npx jest tests/agent/context-aislamiento.test.js tests/panel/agent-session.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gastos/src/app/router.js gastos/src/panel/router.js gastos/tests/agent/context-aislamiento.test.js
git commit -m "feat(memoria): el contexto de sesion filtra memoria por persona"
```

---

## Task 6: Endpoints /kaly/memoria del panel — alcance + gestión

**Files:**
- Modify: `gastos/src/panel/router.js` (handlers `/kaly/memoria` GET/POST/DELETE, ~líneas 506-518)
- Test: `gastos/tests/panel/memoria-personal.test.js` (nuevo)

- [ ] **Step 1: Escribir el test que falla**

Crear `gastos/tests/panel/memoria-personal.test.js`:

```js
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createPanelRouter } = require('../../src/panel/router');
const { createUser } = require('../../src/users/repo');
const { hashPassword } = require('../../src/auth/password');

async function setupCompany(nombre, email) {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  const c = await db.query("INSERT INTO companies(nombre) VALUES($1) RETURNING id", [nombre]);
  await createUser(db, { company_id: c.rows[0].id, email, password_hash: await hashPassword('p'), rol: 'owner' });
  const app = express(); app.use(express.json());
  app.use('/api/panel', createPanelRouter({ db }));
  const t = (await request(app).post('/api/panel/login').send({ email, password: 'p' })).body.token;
  return { app, t, db };
}

test('memoria personal: el dueño guarda personal y empresa; GET las separa', async () => {
  const { app, t } = await setupCompany('Pizza X', 'o@x.cl');
  await request(app).post('/api/panel/kaly/memoria').set('Authorization', `Bearer ${t}`)
    .send({ contenido: 'abro de lunes a sábado', alcance: 'empresa' }).expect(201);
  await request(app).post('/api/panel/kaly/memoria').set('Authorization', `Bearer ${t}`)
    .send({ contenido: 'me dicen don José', alcance: 'personal' }).expect(201);
  const r = await request(app).get('/api/panel/kaly/memoria').set('Authorization', `Bearer ${t}`);
  expect(r.body.empresa.map((m) => m.contenido)).toEqual(['abro de lunes a sábado']);
  expect(r.body.personal.map((m) => m.contenido)).toEqual(['me dicen don José']);
});

test('DELETE alcance=personal limpia solo lo personal del caller', async () => {
  const { app, t } = await setupCompany('Pizza Y', 'o@y.cl');
  await request(app).post('/api/panel/kaly/memoria').set('Authorization', `Bearer ${t}`).send({ contenido: 'p1', alcance: 'personal' });
  await request(app).post('/api/panel/kaly/memoria').set('Authorization', `Bearer ${t}`).send({ contenido: 'emp', alcance: 'empresa' });
  const del = await request(app).delete('/api/panel/kaly/memoria?alcance=personal').set('Authorization', `Bearer ${t}`);
  expect(del.status).toBe(200);
  const r = await request(app).get('/api/panel/kaly/memoria').set('Authorization', `Bearer ${t}`);
  expect(r.body.personal).toEqual([]);
  expect(r.body.empresa.map((m) => m.contenido)).toEqual(['emp']);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd gastos && npx jest tests/panel/memoria-personal.test.js`
Expected: FAIL (GET devuelve un array plano, no `{empresa, personal}`; no existe DELETE con `?alcance`).

- [ ] **Step 3: Implementar — panel router**

En `gastos/src/panel/router.js`, reemplazar el bloque de `/kaly/memoria` (GET/POST/DELETE) por:

```js
// Memoria del agente (nivel 2): empresa (compartida) + personal (del dueño).
function ownerDelCaller(req) { return { kind: 'user', id: req.auth.userId }; }

router.get('/kaly/memoria', async (req, res) => {
  const owner = ownerDelCaller(req);
  const todas = await memoryRepo.listMemorias(db, req.auth.companyId, { owner });
  return res.json({
    empresa: todas.filter((m) => m.owner_kind === 'company'),
    personal: todas.filter((m) => m.owner_kind !== 'company'),
  });
});

router.post('/kaly/memoria', async (req, res) => {
  const b = req.body || {};
  const owner = ownerDelCaller(req);
  const esPersonal = b.alcance === 'personal';
  const m = await memoryRepo.crearMemoria(db, req.auth.companyId, {
    tipo: b.tipo, contenido: b.contenido, origen: 'dueño',
    owner_kind: esPersonal ? owner.kind : 'company',
    owner_id: esPersonal ? owner.id : null,
  });
  if (!m) return res.status(400).json({ error: 'contenido_vacio' });
  return res.status(201).json({ accion: 'insertar', memoria: m });
});

router.delete('/kaly/memoria', async (req, res) => {
  const owner = ownerDelCaller(req);
  if (req.query.alcance === 'personal') {
    const n = await memoryRepo.borrarMemoriasDe(db, req.auth.companyId, { ownerKind: owner.kind, ownerId: owner.id });
    return res.json({ ok: true, borradas: n });
  }
  if (req.query.alcance === 'empresa') {
    if (req.auth.rol !== 'owner') return res.status(403).json({ error: 'solo_dueño' });
    const n = await memoryRepo.borrarMemoriasDe(db, req.auth.companyId, { ownerKind: 'company' });
    return res.json({ ok: true, borradas: n });
  }
  return res.status(400).json({ error: 'alcance_requerido' });
});

router.delete('/kaly/memoria/:id', async (req, res) => {
  const owner = ownerDelCaller(req);
  const r = await memoryRepo.borrarMemoria(db, req.auth.companyId, req.params.id, { owner });
  if (!r) return res.status(404).json({ error: 'no_existe' });
  return res.json({ ok: true });
});
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd gastos && npx jest tests/panel/memoria-personal.test.js tests/panel/kaly-endpoints.test.js`
Expected: PASS. (Ajustar `tests/panel/kaly-endpoints.test.js` si asumía GET como array plano: ahora `GET /kaly/memoria` devuelve `{empresa, personal}`.)

- [ ] **Step 5: Commit**

```bash
git add gastos/src/panel/router.js gastos/tests/panel/memoria-personal.test.js gastos/tests/panel/kaly-endpoints.test.js
git commit -m "feat(memoria): panel /kaly/memoria con alcance empresa/personal + limpieza"
```

---

## Task 7: Endpoints /kaly/memoria de la app — alcance + caller

**Files:**
- Modify: `gastos/src/app/router.js` (handlers `/kaly/memoria` GET/POST/DELETE, ~líneas 280-294)
- Test: `gastos/tests/app/memoria-personal.test.js` (nuevo)

- [ ] **Step 1: Escribir el test que falla**

Crear `gastos/tests/app/memoria-personal.test.js`. Reusar el patrón de un test existente de la app que arme el router con un empleado autenticado (ver `gastos/tests/agent-prefs.test.js` para el armado de empleado + token `kind:'employee'`). El test debe afirmar:

```js
// Pseudocódigo de las aserciones (usar el armado de empleado/token de agent-prefs.test.js):
// 1. Empleado E1 guarda { contenido:'mi nota', alcance:'personal' } → 201.
// 2. Empleado E1 guarda { contenido:'horario tienda', alcance:'empresa' } → 201.
// 3. GET /kaly/memoria como E1 → { empresa:[horario], personal:[mi nota] }.
// 4. GET /kaly/memoria como E2 (misma empresa, otro empleado) → personal:[] (no ve la de E1), empresa:[horario].
```

Escribir el test completo siguiendo el armado de `agent-prefs.test.js` (dos empleados con `createEmployee`, tokens con `signToken({ kind:'employee', companyId, employeeId })`), con las 4 aserciones de arriba expresadas como `expect(...)`.

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd gastos && npx jest tests/app/memoria-personal.test.js`
Expected: FAIL (GET array plano; POST sin alcance; no separa personal por empleado).

- [ ] **Step 3: Implementar — app router**

En `gastos/src/app/router.js`, reemplazar los 3 handlers de `/kaly/memoria` (GET/POST/DELETE :id) por la misma forma que el panel, pero con `owner` del empleado y respetando que el POST de la app usa el reconciliador `realGestionar.reconciliar`. El POST debe pasar el owner al hecho:

```js
function ownerDelEmpleado(req) { return { kind: 'employee', id: req.auth.employeeId }; }

router.get('/kaly/memoria', async (req, res) => {
  const owner = ownerDelEmpleado(req);
  const todas = await memoryRepo.listMemorias(db, req.auth.companyId, { owner });
  return res.json({
    empresa: todas.filter((m) => m.owner_kind === 'company'),
    personal: todas.filter((m) => m.owner_kind !== 'company'),
  });
});

router.post('/kaly/memoria', async (req, res) => {
  const b = req.body || {};
  const owner = ownerDelEmpleado(req);
  const esPersonal = b.alcance === 'personal';
  const scope = esPersonal ? { owner_kind: owner.kind, owner_id: owner.id } : { owner_kind: 'company', owner_id: null };
  const origen = b.origen || 'dueño';
  const r = await realGestionar.reconciliar(
    db, req.auth.companyId,
    { ...b, ...scope, origen },
    { juzgar: _juzgarHecho, scope }
  );
  if (!r) return res.status(400).json({ error: 'contenido_vacio' });
  return res.status(r.accion === 'duplicado' ? 200 : 201).json({ accion: r.accion, memoria: r.memoria });
});

router.delete('/kaly/memoria/:id', async (req, res) => {
  const owner = ownerDelEmpleado(req);
  const r = await memoryRepo.borrarMemoria(db, req.auth.companyId, req.params.id, { owner });
  if (!r) return res.status(404).json({ error: 'no_existe' });
  return res.json({ ok: true });
});
```

Y agregar el DELETE por alcance (igual que el panel pero con `ownerDelEmpleado`):

```js
router.delete('/kaly/memoria', async (req, res) => {
  const owner = ownerDelEmpleado(req);
  if (req.query.alcance === 'personal') {
    const n = await memoryRepo.borrarMemoriasDe(db, req.auth.companyId, { ownerKind: owner.kind, ownerId: owner.id });
    return res.json({ ok: true, borradas: n });
  }
  return res.status(400).json({ error: 'alcance_requerido' });
});
```

Nota: `reconciliar` debe propagar `scope` al `crearMemoria`. Ver Task 8.

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd gastos && npx jest tests/app/memoria-personal.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gastos/src/app/router.js gastos/tests/app/memoria-personal.test.js
git commit -m "feat(memoria): app /kaly/memoria con alcance empresa/personal"
```

---

## Task 8: gestionar.js propaga el alcance (owner) al crear/dedup

**Files:**
- Modify: `gastos/src/agent/gestionar.js:67-93`
- Test: `gastos/tests/agent/memory-scope.test.js` (agregar caso)

- [ ] **Step 1: Escribir el test que falla**

Agregar a `gastos/tests/agent/memory-scope.test.js`:

```js
const gestionar = require('../../src/agent/gestionar');

test('reconciliar con scope personal guarda el hecho como personal', async () => {
  const db = await freshDb();
  const C = require('crypto').randomUUID();
  const P1 = require('crypto').randomUUID();
  // juez stub: siempre "insertar" (sin LLM)
  const juzgar = async () => ({ accion: 'insertar' });
  const r = await gestionar.reconciliar(
    db, C,
    { contenido: 'dato privado', tipo: 'dueño', origen: 'dueño', owner_kind: 'user', owner_id: P1 },
    { juzgar, scope: { owner_kind: 'user', owner_id: P1 } }
  );
  expect(r.memoria.owner_kind).toBe('user');
  const verP1 = (await memory.listMemorias(db, C, { owner: { kind: 'user', id: P1 } })).map((m) => m.contenido);
  expect(verP1).toContain('dato privado');
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd gastos && npx jest tests/agent/memory-scope.test.js -t "reconciliar con scope"`
Expected: FAIL (`reconciliar` llama `crearMemoria(db, companyId, { ...n, origen })` sin owner; `r.memoria.owner_kind` sería 'company').

- [ ] **Step 3: Implementar — gestionar.js**

En `gastos/src/agent/gestionar.js`, en la firma de `reconciliar` (línea 67) aceptar `scope`, y en las 3 llamadas a `crearMemoria` (líneas 73, 89, 92) incluir el scope:

```js
async function reconciliar(db, companyId, hechoNuevo, { http, juzgar, scope = {} } = {}) {
  // ... (lógica existente sin cambios hasta cada crearMemoria) ...
  // Reemplazar cada llamada:
  //   const memoria = await crearMemoria(db, companyId, { ...n, origen });
  // por:
  //   const memoria = await crearMemoria(db, companyId, { ...n, origen, ...scope });
```

Aplicar el cambio `{ ...n, origen, ...scope }` en las 3 llamadas a `crearMemoria` dentro de `reconciliar`. Además, el dedup interno usa `listMemorias(db, companyId)` (línea 71): cambiarlo a `listMemorias(db, companyId, { owner: scope.owner_id ? { kind: scope.owner_kind, id: scope.owner_id } : null })` para que la deduplicación compare contra el mismo alcance.

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd gastos && npx jest tests/agent/memory-scope.test.js`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/agent/gestionar.js gastos/tests/agent/memory-scope.test.js
git commit -m "feat(memoria): reconciliar propaga alcance (empresa/personal)"
```

---

## Task 9: Test de aislamiento de sesión (nivel 3) end-to-end

**Files:**
- Test: `gastos/tests/panel/session-aislamiento.test.js` (nuevo)

- [ ] **Step 1: Escribir el test**

Crear `gastos/tests/panel/session-aislamiento.test.js` (usa `KALY_TOKEN_MODE=key` como `agent-session.test.js`):

```js
process.env.KALY_TOKEN_MODE = 'key';
process.env.GEMINI_API_KEY = 'fake-key';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createPanelRouter } = require('../../src/panel/router');
const { createUser } = require('../../src/users/repo');
const { hashPassword } = require('../../src/auth/password');
const memory = require('../../src/agent/memory');

async function setup(nombre, email) {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  const c = await db.query("INSERT INTO companies(nombre) VALUES($1) RETURNING id", [nombre]);
  await createUser(db, { company_id: c.rows[0].id, email, password_hash: await hashPassword('p'), rol: 'owner' });
  const app = express(); app.use(express.json());
  app.use('/api/panel', createPanelRouter({ db }));
  const t = (await request(app).post('/api/panel/login').send({ email, password: 'p' })).body.token;
  return { app, t, companyId: c.rows[0].id, db };
}

test('dos sesiones de cuentas distintas reciben contexto y memoria distintos', async () => {
  const A = await setup('Pizza A', 'a@a.cl');
  const B = await setup('Pizza B', 'b@b.cl');
  await memory.crearMemoria(A.db, A.companyId, { contenido: 'salsa secreta de A', tipo: 'negocio' });
  await memory.crearMemoria(B.db, B.companyId, { contenido: 'salsa secreta de B', tipo: 'negocio' });
  const ra = await request(A.app).post('/api/panel/agent/session').set('Authorization', `Bearer ${A.t}`);
  const rb = await request(B.app).post('/api/panel/agent/session').set('Authorization', `Bearer ${B.t}`);
  expect(ra.body.context.empresaNombre).toBe('Pizza A');
  expect(rb.body.context.empresaNombre).toBe('Pizza B');
  const memA = ra.body.context.memorias.map((m) => m.contenido);
  expect(memA).toContain('salsa secreta de A');
  expect(memA).not.toContain('salsa secreta de B');
});
```

- [ ] **Step 2: Correr y verificar que pasa**

Run: `cd gastos && npx jest tests/panel/session-aislamiento.test.js`
Expected: PASS (con las tareas anteriores ya implementadas). Si falla, revisar que `/agent/session` del panel pase `owner` (Task 5).

- [ ] **Step 3: Commit**

```bash
git add gastos/tests/panel/session-aislamiento.test.js
git commit -m "test(memoria): aislamiento de sesion entre cuentas (nivel 3)"
```

---

## Task 10: Suite completa + despliegue

**Files:** ninguno (verificación + deploy)

- [ ] **Step 1: Correr toda la suite del backend**

Run: `cd gastos && npx jest 2>&1 | tail -25`
Expected: Sin fallos nuevos introducidos por estos cambios. (Las fallas pre-existentes de `tests/panel/lib-v2.test.js` no son de este trabajo; confirmar que el resto pasa.)

- [ ] **Step 2: Verificar que la app móvil sigue compilando (no se tocó su UI, pero sí sus endpoints)**

Run: `cd gastos-app && npx jest tests/gastos/kaly-tools.test.js`
Expected: PASS (los endpoints de memoria que usa la app no cambiaron de ruta; solo agregaron `alcance` opcional).

- [ ] **Step 3: Desplegar el backend**

Run: `node deploy-gastos-wt.js`
Expected: `HEALTH: {"status":"ok",...}` y `=== deploy worktree OK ===`.

- [ ] **Step 4: Verificación en vivo del aislamiento de endpoints**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://gastos.atikodigital.cl/api/panel/kaly/memoria   # 401 sin token
```
Expected: `401`.

- [ ] **Step 5: Commit final (si quedó algo) y cierre**

```bash
git add -A && git commit -m "chore(memoria): cierre tareas memoria 3 niveles" --allow-empty
```

---

## Notas de cierre
- Nivel 1 (conocimiento del sistema): no requiere tareas de código; queda documentado que vive en los prompts (`prompt.js` de KALY/VARAS y `agente-voz.js`). Si se quiere, una mejora futura es extraerlo a un módulo compartido.
- UI de gestión de memoria (ver/borrar desde el panel) queda fuera de alcance: los endpoints (`GET`/`DELETE ?alcance=...`) quedan listos para conectarla después.
