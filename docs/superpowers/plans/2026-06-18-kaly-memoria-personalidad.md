# Memoria de KALY (M1) + Personalidad (M4) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **UBICACIÓN:** Todo en `C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\` (repo independiente, branch `master`). Antes de commitear: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git rev-parse --show-toplevel && git branch --show-current` → toplevel termina en `HASH IA`, branch `master`. `git add <archivos específicos>` (NO `git add -A`; **Antigravity/"varas" trabaja la misma rama en paralelo**). READ los archivos actuales antes de editar. Windows; Bash tool con comillas para rutas con espacios.

**Goal:** KALY recuerda hechos de cada cliente (los aprende en vivo, los usa en cada sesión, el dueño los gestiona) y tiene una personalidad configurable por cliente desde el admin.

**Architecture:** Tabla `kaly_memory` (por `company_id`) + `companies.kaly_persona` (jsonb). `buildAgentContext` (backend) inyecta `memorias` + `persona` al contexto que ya entrega `/agent/session`; `prompt.js` (app) compone el system prompt con ellos. Tool `recordar` para guardar en vivo; pantalla en Ajustes para el dueño; mini-form en el admin para Atiko. Para la KALY **autenticada de la app** (no la pública de la landing).

**Tech Stack:** Node/Express/Postgres, jest+pg-mem; React/Capacitor, jest+RTL.

Spec: `HASH IA\docs\superpowers\specs\2026-06-18-kaly-memoria-personalidad-design.md`.

## Estructura de archivos
- `gastos/src/agent/memory.js` — NEW: `normalizeMemoria`, `formatMemoriaBlock` (puros) + `crearMemoria`/`listMemorias`/`borrarMemoria` (DB).
- `gastos/src/db/schema.sql` + `migrate.js` — MOD: tabla `kaly_memory` + columna `companies.kaly_persona`.
- `gastos/src/app/router.js` — MOD: `GET/POST/DELETE /api/app/kaly/memoria`.
- `gastos/src/admin/router.js` + `admin/repo.js` — MOD: `PATCH /api/admin/clientes/:id/kaly-persona`.
- `gastos/src/companies/repo.js` — MOD: `getCompanyProfile` devuelve `kaly_persona`.
- `gastos/src/agent/context.js` — MOD: `buildAgentContext` agrega `memorias` + `persona`.
- `gastos/public/admin/` — MOD: mini-form de persona.
- `gastos-app/src/gastos/api.js` — MOD: `kalyMemorias/kalyRecordar/kalyBorrarMemoria`.
- `gastos-app/src/gastos/kaly/tools.js` — MOD: tool `recordar`.
- `gastos-app/src/gastos/kaly/prompt.js` + `persona-base.js` — MOD/NEW: composición + override.
- `gastos-app/src/gastos/MemoriaKalyView.jsx` — NEW: pantalla en Ajustes.

---

## Task 1: Puros `normalizeMemoria` + `formatMemoriaBlock`

**Files:** Create `gastos/src/agent/memory.js`, Test `gastos/tests/agent/memory-pure.test.js`.

- [ ] **Step 1: Test que falla** — `gastos/tests/agent/memory-pure.test.js`:
```js
const { normalizeMemoria, formatMemoriaBlock } = require('../../src/agent/memory');

test('normalizeMemoria: tipo válido o "hecho", contenido recortado', () => {
  expect(normalizeMemoria({ tipo: 'negocio', contenido: '  Cierra domingos  ' })).toEqual({ tipo: 'negocio', contenido: 'Cierra domingos' });
  expect(normalizeMemoria({ tipo: 'xxx', contenido: 'algo' }).tipo).toBe('hecho');
  expect(normalizeMemoria({ contenido: 'x'.repeat(600) }).contenido.length).toBe(500);
});

test('normalizeMemoria: sin contenido → null', () => {
  expect(normalizeMemoria({ contenido: '   ' })).toBeNull();
  expect(normalizeMemoria({})).toBeNull();
});

test('formatMemoriaBlock: agrupa por tipo; vacío → ""', () => {
  expect(formatMemoriaBlock([])).toBe('');
  const b = formatMemoriaBlock([
    { tipo: 'negocio', contenido: 'Cierra domingos' },
    { tipo: 'negocio', contenido: 'Vende tortas' },
    { tipo: 'dueño', contenido: 'Se llama José' },
  ]);
  expect(b).toContain('Cierra domingos');
  expect(b).toContain('Vende tortas');
  expect(b).toContain('Se llama José');
});
```

- [ ] **Step 2: Verificar FAIL** — `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\gastos" && npx jest tests/agent/memory-pure.test.js` → FAIL.

- [ ] **Step 3: Implementar** — `gastos/src/agent/memory.js`:
```js
// Memoria del cliente para KALY: hechos por empresa (kaly_memory).
const TIPOS = ['negocio', 'dueño', 'preferencia', 'hecho'];

function normalizeMemoria(input) {
  input = input || {};
  const contenido = String(input.contenido || '').trim().slice(0, 500);
  if (!contenido) return null;
  const tipo = TIPOS.includes(input.tipo) ? input.tipo : 'hecho';
  return { tipo, contenido };
}

function formatMemoriaBlock(memorias) {
  const arr = (Array.isArray(memorias) ? memorias : []).filter((m) => m && m.contenido);
  if (!arr.length) return '';
  const porTipo = {};
  for (const m of arr) { (porTipo[m.tipo || 'hecho'] = porTipo[m.tipo || 'hecho'] || []).push(m.contenido); }
  const etiqueta = { negocio: 'Del negocio', 'dueño': 'Del dueño', preferencia: 'Preferencias', hecho: 'Otros' };
  let out = '## Lo que sé de este negocio\n';
  for (const t of TIPOS) {
    if (!porTipo[t]) continue;
    out += `- ${etiqueta[t]}: ${porTipo[t].join('; ')}\n`;
  }
  return out.trim();
}

module.exports = { normalizeMemoria, formatMemoriaBlock, TIPOS };
```

- [ ] **Step 4: Verificar PASS** — `npx jest tests/agent/memory-pure.test.js` → PASS (3).

- [ ] **Step 5: Commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git rev-parse --show-toplevel && git branch --show-current && git add gastos/src/agent/memory.js gastos/tests/agent/memory-pure.test.js && git commit -m "feat(kaly-memory): normalizeMemoria + formatMemoriaBlock (puros)"
```

---

## Task 2: Tabla `kaly_memory` + repo (crear/listar/borrar)

**Files:** Modify `gastos/src/db/schema.sql`, `gastos/src/db/migrate.js`, `gastos/src/agent/memory.js`, Test `gastos/tests/agent/memory-db.test.js`.

- [ ] **Step 1: Test que falla** — `gastos/tests/agent/memory-db.test.js`:
```js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { crearMemoria, listMemorias, borrarMemoria } = require('../../src/agent/memory');

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

test('crear/listar/borrar memorias scoped por empresa', async () => {
  const db = await freshDb();
  const A = '00000000-0000-0000-0000-0000000000aa';
  const B = '00000000-0000-0000-0000-0000000000bb';
  await crearMemoria(db, A, { tipo: 'negocio', contenido: 'Cierra domingos', origen: 'kaly' });
  await crearMemoria(db, A, { tipo: 'dueño', contenido: 'Se llama José', origen: 'dueño' });
  await crearMemoria(db, B, { tipo: 'hecho', contenido: 'otra empresa' });

  const listaA = await listMemorias(db, A);
  expect(listaA.map((m) => m.contenido).sort()).toEqual(['Cierra domingos', 'Se llama José']);
  expect(listaA[0]).toHaveProperty('id');

  await borrarMemoria(db, A, listaA[0].id);
  expect((await listMemorias(db, A)).length).toBe(1);
  // no afecta a B
  expect((await listMemorias(db, B)).length).toBe(1);
});

test('crearMemoria ignora contenido vacío', async () => {
  const db = await freshDb();
  const A = '00000000-0000-0000-0000-0000000000aa';
  const r = await crearMemoria(db, A, { contenido: '  ' });
  expect(r).toBeNull();
  expect((await listMemorias(db, A)).length).toBe(0);
});
```

- [ ] **Step 2: Verificar FAIL** — `npx jest tests/agent/memory-db.test.js` → FAIL.

- [ ] **Step 3: Implementar**

(a) En `gastos/src/db/schema.sql`, agrega la tabla (al final del archivo):
```sql
CREATE TABLE IF NOT EXISTS kaly_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  tipo text NOT NULL DEFAULT 'hecho',
  contenido text NOT NULL,
  origen text NOT NULL DEFAULT 'kaly',
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
(b) En `gastos/src/db/migrate.js`, agrega un array `MEMORY_DDL` y córrelo en `migrate` con try/catch (estilo `V2_COLUMNS`):
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
];
```
y dentro de `migrate(db)`, después del loop de `KALY_COLUMNS`, agrega:
```js
  for (const stmt of MEMORY_DDL) {
    try { await db.query(stmt); } catch (e) { /* pg-mem / ya existe */ }
  }
```
(c) En `gastos/src/agent/memory.js`, agrega las funciones de DB (antes de `module.exports`) y expórtalas:
```js
async function crearMemoria(db, companyId, input) {
  const n = normalizeMemoria(input);
  if (!n) return null;
  const origen = input && input.origen === 'dueño' ? 'dueño' : 'kaly';
  const r = await db.query(
    "INSERT INTO kaly_memory(company_id, tipo, contenido, origen) VALUES($1,$2,$3,$4) RETURNING id, tipo, contenido, origen, created_at",
    [companyId, n.tipo, n.contenido, origen]
  );
  return r.rows[0];
}
async function listMemorias(db, companyId, { limite = 50 } = {}) {
  const r = await db.query(
    "SELECT id, tipo, contenido, origen, created_at FROM kaly_memory WHERE company_id=$1 AND activo=true ORDER BY created_at DESC LIMIT $2",
    [companyId, limite]
  );
  return r.rows;
}
async function borrarMemoria(db, companyId, id) {
  const r = await db.query("UPDATE kaly_memory SET activo=false, updated_at=now() WHERE id=$1 AND company_id=$2 RETURNING id", [id, companyId]);
  return r.rows[0] || null;
}
```
Agrega `crearMemoria, listMemorias, borrarMemoria` al `module.exports`.

- [ ] **Step 4: Verificar PASS** — `npx jest tests/agent/memory-db.test.js` luego `npx jest` (suite backend completa) → todo verde.

- [ ] **Step 5: Commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git add gastos/src/db/schema.sql gastos/src/db/migrate.js gastos/src/agent/memory.js gastos/tests/agent/memory-db.test.js && git commit -m "feat(kaly-memory): tabla kaly_memory + crear/listar/borrar + columna kaly_persona"
```

---

## Task 3: Endpoints `/api/app/kaly/memoria`

**Files:** Modify `gastos/src/app/router.js`, Test `gastos/tests/agent/memoria-routes.test.js`.

- [ ] **Step 1: Test que falla** — `gastos/tests/agent/memoria-routes.test.js` (calca el helper pg-mem+supertest+login de otro test de rutas de app, p.ej. `tests/onboarding/company-routes.test.js`):
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
function app(db) { const a = express(); a.use(express.json()); a.use('/api/app', createAppRouter({ db })); return a; }
async function token(a) { return (await request(a).post('/api/app/login').send({ usuario: 'juan', password: 'clave' })).body.token; }

test('POST crea, GET lista, DELETE borra (scoped + auth)', async () => {
  const db = await freshDb(); await seed(db); const a = app(db);
  const t = await token(a); const auth = (r) => r.set('Authorization', `Bearer ${t}`);

  await auth(request(a).post('/api/app/kaly/memoria').send({ tipo: 'negocio', contenido: 'Cierra domingos' })).expect(201);
  const lista = await auth(request(a).get('/api/app/kaly/memoria')).expect(200);
  expect(lista.body).toHaveLength(1);
  expect(lista.body[0].contenido).toBe('Cierra domingos');

  await auth(request(a).delete(`/api/app/kaly/memoria/${lista.body[0].id}`)).expect(200);
  expect((await auth(request(a).get('/api/app/kaly/memoria')).expect(200)).body).toHaveLength(0);
});

test('kaly/memoria exige token', async () => {
  const db = await freshDb(); await seed(db); const a = app(db);
  await request(a).get('/api/app/kaly/memoria').expect(401);
  await request(a).post('/api/app/kaly/memoria').send({ contenido: 'x' }).expect(401);
});
```

- [ ] **Step 2: Verificar FAIL** — `npx jest tests/agent/memoria-routes.test.js` → FAIL (404).

- [ ] **Step 3: Implementar** — READ `gastos/src/app/router.js`. Importa el repo de memoria arriba (junto a otros require): `const memoryRepo = require('../agent/memory');`. Agrega bajo el middleware de auth de empleado (junto a `/agent/session`):
```js
  router.get('/kaly/memoria', async (req, res) => {
    return res.json(await memoryRepo.listMemorias(db, req.auth.companyId));
  });
  router.post('/kaly/memoria', async (req, res) => {
    const m = await memoryRepo.crearMemoria(db, req.auth.companyId, { ...(req.body || {}), origen: (req.body && req.body.origen) || 'dueño' });
    if (!m) return res.status(400).json({ error: 'contenido_vacio' });
    return res.status(201).json(m);
  });
  router.delete('/kaly/memoria/:id', async (req, res) => {
    const r = await memoryRepo.borrarMemoria(db, req.auth.companyId, req.params.id);
    if (!r) return res.status(404).json({ error: 'no_existe' });
    return res.json({ ok: true });
  });
```
Usa el nombre real del companyId del auth (`req.auth.companyId`).

- [ ] **Step 4: Verificar PASS** — `npx jest tests/agent/memoria-routes.test.js` luego `npx jest` → verde.

- [ ] **Step 5: Commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git add gastos/src/app/router.js gastos/tests/agent/memoria-routes.test.js && git commit -m "feat(kaly-memory): endpoints GET/POST/DELETE /api/app/kaly/memoria"
```

---

## Task 4: Persona — columna ya creada (T2) + repo + endpoint admin

**Files:** Modify `gastos/src/companies/repo.js`, `gastos/src/admin/repo.js`, `gastos/src/admin/router.js`, Test `gastos/tests/agent/persona-admin.test.js`.

- [ ] **Step 1: Test que falla** — `gastos/tests/agent/persona-admin.test.js`:
```js
process.env.JWT_SECRET = 'test-secret';
process.env.GASTOS_ADMIN_USER = 'atiko';
process.env.GASTOS_ADMIN_PASSWORD = 'secreto';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createAdminRouter } = require('../../src/admin/router');
const { getCompanyProfile } = require('../../src/companies/repo');

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
function app(db) { const a = express(); a.use(express.json()); a.use('/api/admin', createAdminRouter({ db })); return a; }
async function adminToken(a) { return (await request(a).post('/api/admin/login').send({ usuario: 'atiko', password: 'secreto' })).body.token; }

test('admin setea kaly_persona y getCompanyProfile la devuelve', async () => {
  const db = await freshDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const id = c.rows[0].id;
  const a = app(db); const t = await adminToken(a);
  await request(a).patch(`/api/admin/clientes/${id}/kaly-persona`).set('Authorization', `Bearer ${t}`)
    .send({ nombre: 'Sofía', tono: 'cercano', instrucciones: 'Usa emojis con moderación' }).expect(200);
  const prof = await getCompanyProfile(db, id);
  expect(prof.kaly_persona).toEqual({ nombre: 'Sofía', tono: 'cercano', instrucciones: 'Usa emojis con moderación' });
});

test('kaly-persona exige admin', async () => {
  const db = await freshDb();
  const a = app(db);
  await request(a).patch('/api/admin/clientes/x/kaly-persona').send({ nombre: 'x' }).expect(401);
});
```

- [ ] **Step 2: Verificar FAIL** — `npx jest tests/agent/persona-admin.test.js` → FAIL.

- [ ] **Step 3: Implementar**

(a) `gastos/src/companies/repo.js`: en `getCompanyProfile` (creado en el onboarding) agrega `kaly_persona` al SELECT. READ la función; cambia el SELECT para incluir `kaly_persona`:
```js
  const r = await db.query('SELECT id, nombre, rut, giro, owner_nombre, owner_whatsapp, onboarded_at, kaly_persona, created_at FROM companies WHERE id=$1', [companyId]);
```
Y agrega `setKalyPersona`:
```js
async function setKalyPersona(db, companyId, persona) {
  const p = {
    nombre: String((persona && persona.nombre) || '').slice(0, 40) || undefined,
    tono: String((persona && persona.tono) || '').slice(0, 40) || undefined,
    instrucciones: String((persona && persona.instrucciones) || '').slice(0, 500) || undefined,
  };
  const clean = JSON.stringify(p);
  await db.query('UPDATE companies SET kaly_persona=$2 WHERE id=$1', [companyId, clean]);
  return getCompanyProfile(db, companyId);
}
```
Exporta `setKalyPersona`. (La columna `kaly_persona` ya se creó en T2.)

(b) `gastos/src/admin/repo.js`: agrega un wrapper `setKalyPersona(db, companyId, persona)` que llame a `companies/repo.setKalyPersona` (o impórtalo directo en el router). Simplest: en el router importa de companies/repo.

(c) `gastos/src/admin/router.js`: agrega la ruta (bajo `router.use(requireAuth, requireKind('admin'))`, junto a `/clientes/:id/plan`):
```js
  router.patch('/clientes/:id/kaly-persona', async (req, res) => {
    const { setKalyPersona } = require('../companies/repo');
    const r = await setKalyPersona(db, req.params.id, req.body || {});
    if (!r) return res.status(404).json({ error: 'no_existe' });
    return res.json({ ok: true, kaly_persona: r.kaly_persona });
  });
```

- [ ] **Step 4: Verificar PASS** — `npx jest tests/agent/persona-admin.test.js` luego `npx jest` → verde.

- [ ] **Step 5: Commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git add gastos/src/companies/repo.js gastos/src/admin/router.js gastos/src/admin/repo.js gastos/tests/agent/persona-admin.test.js && git commit -m "feat(kaly-persona): setKalyPersona + PATCH /api/admin/clientes/:id/kaly-persona"
```

---

## Task 5: `buildAgentContext` agrega memorias + persona

**Files:** Modify `gastos/src/agent/context.js`, Test `gastos/tests/agent/context-memory.test.js`.

- [ ] **Step 1: Test que falla** — `gastos/tests/agent/context-memory.test.js`:
```js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { crearMemoria } = require('../../src/agent/memory');
const { buildAgentContext } = require('../../src/agent/context');

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

test('buildAgentContext incluye memorias y persona', async () => {
  const db = await freshDb();
  const c = await db.query("INSERT INTO companies(nombre, kaly_persona) VALUES('Pyme', '{\"nombre\":\"Sofía\"}') RETURNING id");
  const cid = c.rows[0].id;
  const e = await db.query("INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'J','j','x') RETURNING id", [cid]);
  await crearMemoria(db, cid, { tipo: 'negocio', contenido: 'Cierra domingos' });

  const ctx = await buildAgentContext(db, { companyId: cid, employeeId: e.rows[0].id });
  expect(ctx.memorias.map((m) => m.contenido)).toContain('Cierra domingos');
  expect(ctx.persona).toEqual({ nombre: 'Sofía' });
});
```

- [ ] **Step 2: Verificar FAIL** — `npx jest tests/agent/context-memory.test.js` → FAIL.

- [ ] **Step 3: Implementar** — READ `gastos/src/agent/context.js`. Importa `listMemorias` y usa `getCompanyProfile` (que ahora trae `kaly_persona`) o lee la persona. Cambios: agrega al `Promise.all`/consultas la carga de memorias y persona, y agrégalas al objeto devuelto:
```js
const { listMemorias } = require('./memory');
const { getCompanyProfile } = require('../companies/repo');
// dentro de buildAgentContext, junto a las otras cargas:
const [prefs, company, profile, memorias] = await Promise.all([
  getAgentPrefs(db, employeeId),
  getCompany(db, companyId),
  getCompanyProfile(db, companyId),
  listMemorias(db, companyId),
]);
// ... y en el return agrega:
  memorias,
  persona: (profile && profile.kaly_persona) || {},
```
(Mantén el resto del return igual. `getCompany` ya se usaba para `empresaNombre`.)

- [ ] **Step 4: Verificar PASS** — `npx jest tests/agent/context-memory.test.js` luego `npx jest` → verde.

- [ ] **Step 5: Commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git add gastos/src/agent/context.js gastos/tests/agent/context-memory.test.js && git commit -m "feat(kaly-memory): buildAgentContext incluye memorias + persona"
```

---

## Task 6: Tool `recordar` + métodos api.js

**Files:** Modify `gastos-app/src/gastos/kaly/tools.js`, `gastos-app/src/gastos/api.js`, Test `gastos-app/tests/gastos/kaly-tools.test.js` (append).

- [ ] **Step 1: Test que falla** — en `gastos-app/tests/gastos/kaly-tools.test.js`: agrega `kalyRecordar: jest.fn()` al mock de `api` (objeto del `jest.mock('../../src/gastos/api', ...)`), sube el conteo de `TOOL_DECLARATIONS` (+1) y agrega:
```js
test('recordar llama api.kalyRecordar con contenido y tipo', async () => {
  api.kalyRecordar.mockResolvedValue({ id: 'm1', contenido: 'Cierra domingos' });
  const result = await executeTool('recordar', { tipo: 'negocio', contenido: 'Cierra domingos' });
  expect(api.kalyRecordar).toHaveBeenCalledWith({ tipo: 'negocio', contenido: 'Cierra domingos' });
  expect(result).toEqual({ ok: true, contenido: 'Cierra domingos' });
});
```
READ el test para el nombre exacto del conteo de TOOL_DECLARATIONS (ajusta el número +1) y el mock de api.

- [ ] **Step 2: Verificar FAIL** — `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\gastos-app" && npx jest tests/gastos/kaly-tools.test.js` → FAIL.

- [ ] **Step 3: Implementar**

(a) `gastos-app/src/gastos/api.js` (calca el helper `req`): agrega
```js
  kalyMemorias() { return req('/api/app/kaly/memoria'); },
  kalyRecordar(m) { return req('/api/app/kaly/memoria', { method: 'POST', body: m }); },
  kalyBorrarMemoria(id) { return req(`/api/app/kaly/memoria/${id}`, { method: 'DELETE' }); },
```
(b) `gastos-app/src/gastos/kaly/tools.js`: agrega la declaración al final de `TOOL_DECLARATIONS`:
```js
  { name: 'recordar', description: 'Guarda un dato importante del negocio o del dueño para recordarlo en futuras conversaciones (ej. horarios, preferencias, datos del dueño).', parameters: { type: 'OBJECT', properties: { contenido: { type: 'STRING', description: 'el dato a recordar, en una frase' }, tipo: { type: 'STRING', enum: ['negocio', 'dueño', 'preferencia', 'hecho'] } }, required: ['contenido'] } }
```
y la rama en `executeTool` (antes de `return { error: 'tool_desconocida' }`):
```js
    if (name === 'recordar') {
      const r = await api.kalyRecordar({ tipo: args.tipo, contenido: args.contenido });
      return { ok: true, contenido: r.contenido };
    }
```

- [ ] **Step 4: Verificar PASS** — `npx jest tests/gastos/kaly-tools.test.js` luego `npm run build` → verde + build OK.

- [ ] **Step 5: Commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git add gastos-app/src/gastos/kaly/tools.js gastos-app/src/gastos/api.js gastos-app/tests/gastos/kaly-tools.test.js && git commit -m "feat(kaly-memory-app): tool recordar + api memoria"
```

---

## Task 7: Personalidad base + composición en `prompt.js`

**Files:** Create `gastos-app/src/gastos/kaly/persona-base.js`, Modify `gastos-app/src/gastos/kaly/prompt.js`, Test `gastos-app/tests/gastos/kaly-prompt.test.js`.

- [ ] **Step 1: Test que falla** — `gastos-app/tests/gastos/kaly-prompt.test.js`:
```js
import { buildSystemPrompt } from '../../src/gastos/kaly/prompt';

test('inyecta el bloque de memorias cuando hay', () => {
  const p = buildSystemPrompt({ memorias: [{ tipo: 'negocio', contenido: 'Cierra domingos' }] });
  expect(p).toContain('Lo que sé de este negocio');
  expect(p).toContain('Cierra domingos');
});

test('sin memorias no rompe ni mete el bloque', () => {
  const p = buildSystemPrompt({});
  expect(p).not.toContain('Lo que sé de este negocio');
});

test('aplica el nombre de persona override', () => {
  const p = buildSystemPrompt({ persona: { nombre: 'Sofía' } });
  expect(p).toContain('Sofía');
});
```

- [ ] **Step 2: Verificar FAIL** — `npx jest tests/gastos/kaly-prompt.test.js` → FAIL.

- [ ] **Step 3: Implementar** — READ `gastos-app/src/gastos/kaly/prompt.js` completo.

(a) Crea `gastos-app/src/gastos/kaly/persona-base.js` con el nombre/identidad configurable extraídos:
```js
// Identidad base de KALY (lo configurable). El resto de protocolos sigue en prompt.js.
export function personaBase(persona = {}) {
  const nombre = (persona && persona.nombre) || 'Kaly';
  const tono = (persona && persona.tono) || 'profesional, proactivo, amable y eficiente';
  const extra = (persona && persona.instrucciones) ? `\n- Indicaciones del negocio: ${persona.instrucciones}` : '';
  return { nombre, tono, extra };
}
```
(b) En `prompt.js` `buildSystemPrompt(context)`:
  - importa `import { personaBase } from './persona-base.js';` y `import { formatMemoriaBlock } from '...';` — OJO: `formatMemoriaBlock` está en el BACKEND (`gastos/src/agent/memory.js`, CommonJS). NO lo importes desde la app. En su lugar, **define una copia mínima** del formateador en `prompt.js` (o en persona-base.js) para la app, o formatea inline. Implementación inline en prompt.js:
```js
function bloqueMemorias(memorias) {
  const arr = (Array.isArray(memorias) ? memorias : []).filter((m) => m && m.contenido);
  if (!arr.length) return '';
  return '\n## Lo que sé de este negocio\n' + arr.map((m) => `- ${m.contenido}`).join('\n') + '\n';
}
```
  - Al inicio de `buildSystemPrompt`, saca `const { memorias = [], persona = {} } = context || {};` y `const pb = personaBase(persona);`.
  - Usa `pb.nombre` donde el prompt dice el nombre del agente ("Eres Kaly…" → `Eres ${pb.nombre}…`), y agrega `pb.extra` en el bloque de tono, y `${pb.tono}` donde corresponda. (Mantén TODO el resto del prompt igual.)
  - Inserta `${bloqueMemorias(memorias)}` justo antes del `${resumenBloque}` (o donde calce naturalmente, después de los protocolos).
  - Agrega al texto de herramientas: "Usa la herramienta `recordar` cuando el dueño te diga un dato del negocio que valga la pena recordar (horarios, preferencias, datos suyos) o te pida recordarlo; confírmalo en una frase."

- [ ] **Step 4: Verificar PASS** — `npx jest tests/gastos/kaly-prompt.test.js` luego `npm run build` → verde + build OK.

- [ ] **Step 5: Commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git add gastos-app/src/gastos/kaly/persona-base.js gastos-app/src/gastos/kaly/prompt.js gastos-app/tests/gastos/kaly-prompt.test.js && git commit -m "feat(kaly): persona base configurable + bloque de memorias en el prompt"
```

---

## Task 8: Pantalla "Memoria de KALY" en la app

**Files:** Create `gastos-app/src/gastos/MemoriaKalyView.jsx`, Modify donde está Ajustes/config en la app, Test `gastos-app/tests/gastos/MemoriaKalyView.test.jsx`.

- [ ] **Step 1: Test que falla** — `gastos-app/tests/gastos/MemoriaKalyView.test.jsx`:
```jsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
jest.mock('../../src/gastos/api', () => ({ api: { kalyMemorias: jest.fn(), kalyRecordar: jest.fn(), kalyBorrarMemoria: jest.fn() } }));
import { api } from '../../src/gastos/api';
import MemoriaKalyView from '../../src/gastos/MemoriaKalyView.jsx';

beforeEach(() => {
  jest.clearAllMocks();
  api.kalyMemorias.mockResolvedValue([{ id: 'm1', tipo: 'negocio', contenido: 'Cierra domingos' }]);
  api.kalyRecordar.mockResolvedValue({ id: 'm2', tipo: 'hecho', contenido: 'Nuevo dato' });
  api.kalyBorrarMemoria.mockResolvedValue({ ok: true });
});

test('lista las memorias y agrega una nueva', async () => {
  render(<MemoriaKalyView />);
  await screen.findByText(/Cierra domingos/i);
  fireEvent.change(screen.getByPlaceholderText(/Qué quieres que KALY recuerde/i), { target: { value: 'Nuevo dato' } });
  fireEvent.click(screen.getByText(/Agregar/i));
  await waitFor(() => expect(api.kalyRecordar).toHaveBeenCalledWith(expect.objectContaining({ contenido: 'Nuevo dato' })));
});
```

- [ ] **Step 2: Verificar FAIL** — `npx jest tests/gastos/MemoriaKalyView.test.jsx` → FAIL.

- [ ] **Step 3: Implementar** — `gastos-app/src/gastos/MemoriaKalyView.jsx`:
```jsx
import React, { useEffect, useState } from 'react';
import { api } from './api';

const GOLD = '#C9A24B';
const TIPOS = ['negocio', 'dueño', 'preferencia', 'hecho'];

export default function MemoriaKalyView() {
  const [items, setItems] = useState([]);
  const [contenido, setContenido] = useState('');
  const [tipo, setTipo] = useState('negocio');
  const [err, setErr] = useState('');

  async function cargar() { try { setItems(await api.kalyMemorias()); } catch (e) { setErr('No pude cargar la memoria'); } }
  useEffect(() => { cargar(); }, []);

  async function agregar() {
    if (!contenido.trim()) return;
    try { await api.kalyRecordar({ tipo, contenido: contenido.trim() }); setContenido(''); cargar(); }
    catch (e) { setErr('No se pudo guardar'); }
  }
  async function borrar(id) { try { await api.kalyBorrarMemoria(id); cargar(); } catch (e) { setErr('No se pudo borrar'); } }

  return (
    <div style={{ padding: 12 }}>
      <h2 style={{ color: GOLD, fontWeight: 900 }}>Memoria de KALY</h2>
      <p style={{ fontSize: 13, opacity: 0.7 }}>Lo que KALY sabe de tu negocio. Puedes agregar o borrar.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0' }}>
        {items.map((m) => (
          <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, background: '#ffffff10', borderRadius: 10, padding: 10 }}>
            <div><span style={{ color: GOLD, fontSize: 11 }}>{m.tipo}</span><div>{m.contenido}</div></div>
            <button onClick={() => borrar(m.id)} style={{ background: 'transparent', color: '#ff6b6b', border: 0 }}>Borrar</button>
          </div>
        ))}
        {!items.length && <div style={{ opacity: 0.6 }}>Todavía no hay nada. Háblale a KALY o agrega algo aquí.</div>}
      </div>
      <div style={{ background: '#ffffff08', borderRadius: 12, padding: 12 }}>
        <input placeholder="¿Qué quieres que KALY recuerde?" value={contenido} onChange={(e) => setContenido(e.target.value)} style={{ width: '100%', padding: 9, borderRadius: 8, marginBottom: 8 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ flex: 1, padding: 9, borderRadius: 8 }}>
            {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={agregar} style={{ background: GOLD, color: '#000', fontWeight: 800, borderRadius: 10, padding: '9px 16px', border: 0 }}>Agregar</button>
        </div>
        {err ? <div style={{ color: '#ff6b6b', fontSize: 13, marginTop: 8 }}>{err}</div> : null}
      </div>
    </div>
  );
}
```
**Montaje:** READ `gastos-app/src/gastos/GastosApp.jsx` (y/o donde estén "Ajustes"/config en la app). Agrega un acceso a `MemoriaKalyView` (un botón/entrada "Memoria de KALY" en la zona de Ajustes/config, siguiendo el patrón de navegación existente — p.ej. junto al botón "Configurar mi negocio" del onboarding, o en una vista de ajustes). Importa `MemoriaKalyView` y muéstralo cuando se selecciona esa entrada. No inventes un router nuevo; usa el patrón de estado existente.

- [ ] **Step 4: Verificar PASS** — `npx jest tests/gastos/MemoriaKalyView.test.jsx` luego `npx jest` (suite app) → verde, y `npm run build` → OK.

- [ ] **Step 5: Commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git add gastos-app/src/gastos/MemoriaKalyView.jsx gastos-app/src/gastos/GastosApp.jsx gastos-app/tests/gastos/MemoriaKalyView.test.jsx && git commit -m "feat(kaly-memory-app): pantalla Memoria de KALY (lista/agregar/borrar)"
```

---

## Task 9: mini-form de persona en el admin + verificación final

**Files:** Modify `gastos/public/admin/` (HTML/JS del panel admin).

- [ ] **Step 1: mini-form de persona** — READ `gastos/public/admin/index.html` (y su JS). Agrega, en la ficha/acciones de cada cliente, un mini-form **"Personalidad de KALY"** con 3 campos (nombre, tono, instrucciones) y un botón Guardar que haga `PATCH /api/admin/clientes/:id/kaly-persona` con el token admin (reusa el `fetch` con `Authorization: Bearer` que ya usa el panel). Si el panel admin es muy básico, agrega al menos un prompt/inputs simples para esos 3 campos por cliente. (Sin tests automáticos del HTML; se valida manualmente.)

- [ ] **Step 2: Suite backend** — `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\gastos" && npx jest` → PASS.
- [ ] **Step 3: Suite app + build** — `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\gastos-app" && npx jest && npm run build` → PASS + OK.
- [ ] **Step 4: Commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git add gastos/public/admin/ && git commit -m "feat(kaly-persona): mini-form de personalidad por cliente en el admin"
```

---

## Notas de despliegue (con el usuario después)
- Backend: `HASH IA\deploy-gastos-wt.js` (tabla `kaly_memory` + columna `kaly_persona` se crean solas idempotentes). App: rebuild APK (subir versionCode) + `upload-apk-wt.js`. Admin se sirve con el backend.

## Self-review (hecho)
- **Cobertura del spec:** tabla kaly_memory + repo (T2) ✅; puros normalize/format (T1) ✅; endpoints app memoria (T3) ✅; tool recordar + api (T6) ✅; recall en buildAgentContext (T5) ✅; persona base + override + composición prompt (T7) ✅; columna kaly_persona + endpoint admin + getCompanyProfile (T2/T4) ✅; pantalla dueño en Ajustes (T8) ✅; mini-form admin (T9) ✅; multi-tenant scoped + soft delete + degradación suave (T2/T3/T5) ✅; tests por pieza ✅.
- **Sin placeholders:** código completo en memory.js, endpoints, tool, context, prompt, MemoriaKalyView. El montaje en Ajustes (T8) y el HTML admin (T9) se adaptan al código real (READ + seguir patrón), con código de comportamiento explícito.
- **Consistencia:** `normalizeMemoria`/`formatMemoriaBlock` (T1) usados por el repo (T2); `crearMemoria/listMemorias/borrarMemoria` (T2) → endpoints (T3) → `api.kalyRecordar/kalyMemorias/kalyBorrarMemoria` (T6) → pantalla (T8) y tool `recordar` (T6); `buildAgentContext` devuelve `{memorias, persona}` (T5) consumidos por `buildSystemPrompt` (T7); `kaly_persona` jsonb {nombre,tono,instrucciones} seteado en admin (T4) y leído por `getCompanyProfile` (T4) y context (T5).
