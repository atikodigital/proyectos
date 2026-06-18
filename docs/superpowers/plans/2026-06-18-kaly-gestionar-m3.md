# KALY Gestionar / Reconciliación de Memoria (M3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mantener la memoria de KALY limpia y al día: cada hecho nuevo pasa por un LLM-juez que decide insertar / descartar (duplicado semántico) / reemplazar (contradice uno viejo → archiva el viejo y guarda el nuevo).

**Architecture:** Módulo nuevo `gastos/src/agent/gestionar.js` con `juzgarHecho` (Gemini, http inyectable, calca `extraerHechos`) y `reconciliar` (gateway único sobre `kaly_memory`, usa el soft-delete existente para "reemplazar"). Las 3 vías de escritura (auto al cerrar conversación, `recordar` en vivo, dueño manual) pasan por `reconciliar`. Sin migración de DB, sin pgvector.

**Tech Stack:** Node + Express + Postgres (jest + pg-mem) en `gastos/`. Gemini OpenAI-compat (`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, Bearer `GEMINI_API_KEY`). La app `gastos-app/` NO cambia.

**⚠️ Reglas del repo (Antigravity trabaja `master` en paralelo):**
- Todo en `C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\` (NO el worktree).
- Antes de cada commit: `git rev-parse --abbrev-ref HEAD` = `master`; `git rev-parse --show-toplevel` termina en `HASH IA`.
- SIEMPRE `git add <archivos específicos>` — NUNCA `git add -A`/`.`/`-u`.
- Tests del backend desde `gastos/`.
- **No tocar** el cambio sin commitear de Antigravity en `gastos/public/panel/index.html` (dejarlo como está).

---

### Task 1: `juzgarHecho` (LLM-juez, http inyectable)

Crea el módulo `gestionar.js` con el juez. Recibe el hecho nuevo + las memorias existentes numeradas y devuelve `{ accion, indice }`. Normaliza salidas inválidas a `insertar`. Calca el patrón Gemini de `aprender.js` (axios `http` inyectable, `parseJsonLoose`). **No importa de `aprender.js`** (evita ciclo: `aprender.js` importará `gestionar.js` en Task 3); duplica `parseJsonLoose`/`BASE` como ya hacen `ocr/gemini.js` y `catalog/extraer.js`.

**Files:**
- Create: `gastos/src/agent/gestionar.js`
- Test: `gastos/tests/agent/gestionar-juez.test.js`

- [ ] **Step 1: Write the failing test**

Crea `gastos/tests/agent/gestionar-juez.test.js`:

```js
const { juzgarHecho, normalizeVeredicto } = require('../../src/agent/gestionar');

function fakeHttp(content) {
  return { post: jest.fn().mockResolvedValue({ data: { choices: [{ message: { content } }] } }) };
}

const EXISTENTES = [
  { id: 'a', contenido: 'Cierra los domingos' },
  { id: 'b', contenido: 'Cierra a las 18h' },
];

describe('normalizeVeredicto', () => {
  test('accion válida con indice en rango', () => {
    expect(normalizeVeredicto({ accion: 'duplicado', indice: 1 }, 2)).toEqual({ accion: 'duplicado', indice: 1 });
  });
  test('accion desconocida → insertar', () => {
    expect(normalizeVeredicto({ accion: 'otra', indice: 1 }, 2)).toEqual({ accion: 'insertar', indice: null });
  });
  test('indice fuera de rango → insertar', () => {
    expect(normalizeVeredicto({ accion: 'reemplaza', indice: 9 }, 2)).toEqual({ accion: 'insertar', indice: null });
  });
  test('reemplaza sin indice → insertar', () => {
    expect(normalizeVeredicto({ accion: 'reemplaza', indice: null }, 2)).toEqual({ accion: 'insertar', indice: null });
  });
});

describe('juzgarHecho', () => {
  test('parsea duplicado del juez', async () => {
    const http = fakeHttp('{ "accion": "duplicado", "indice": 1 }');
    const v = await juzgarHecho({ hechoNuevo: { contenido: 'No atiende los domingos' }, existentes: EXISTENTES, http });
    expect(v).toEqual({ accion: 'duplicado', indice: 1 });
  });
  test('parsea reemplaza del juez', async () => {
    const http = fakeHttp('```json\n{ "accion": "reemplaza", "indice": 2 }\n```');
    const v = await juzgarHecho({ hechoNuevo: { contenido: 'Ahora cierra a las 20h' }, existentes: EXISTENTES, http });
    expect(v).toEqual({ accion: 'reemplaza', indice: 2 });
  });
  test('incluye los hechos existentes numerados en el prompt', async () => {
    const http = fakeHttp('{ "accion": "insertar", "indice": null }');
    await juzgarHecho({ hechoNuevo: { contenido: 'Vende pan' }, existentes: EXISTENTES, http });
    const enviado = http.post.mock.calls[0][1].messages[0].content;
    expect(enviado).toContain('1. Cierra los domingos');
    expect(enviado).toContain('2. Cierra a las 18h');
    expect(enviado).toContain('Vende pan');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/gestionar-juez.test.js 2>&1 | tail -20`
Expected: FAIL — `Cannot find module '../../src/agent/gestionar'`.

- [ ] **Step 3: Write minimal implementation**

Crea `gastos/src/agent/gestionar.js`:

```js
// Gestionar (M3): reconcilia cada hecho nuevo contra la memoria existente
// (dedupe semántico + contradicciones) usando un LLM-juez. Reusa kaly_memory
// y el soft-delete (borrarMemoria) para "reemplazar". Sin pgvector.
const axios = require('axios');
const { normalizeMemoria, listMemorias, crearMemoria, borrarMemoria } = require('./memory');

const BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

function parseJsonLoose(text) {
  const s = String(text || '');
  const fenced = s.replace(/```json/gi, '```').split('```');
  const candidates = [s, ...fenced];
  for (const c of candidates) {
    const start = c.indexOf('{');
    const end = c.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(c.slice(start, end + 1)); } catch { /* sigue */ }
    }
  }
  return {};
}

const ACCIONES = ['insertar', 'duplicado', 'reemplaza'];

function normalizeVeredicto(data, n) {
  const accion = ACCIONES.includes(data && data.accion) ? data.accion : 'insertar';
  let indice = Number(data && data.indice);
  if (!Number.isInteger(indice) || indice < 1 || indice > n) indice = null;
  if (accion === 'insertar' || indice === null) return { accion: 'insertar', indice: null };
  return { accion, indice };
}

function buildJuezPrompt(hechoNuevo, existentes) {
  const lista = existentes.map((m, i) => `${i + 1}. ${m.contenido}`).join('\n');
  return [
    'Eres el gestor de memoria de KALY, la asistente de una pyme chilena.',
    'Tengo una lista de hechos que YA SÉ del negocio, y un HECHO NUEVO.',
    'Decide la relación del hecho nuevo con la lista:',
    '- "insertar": información nueva, no está en la lista y no contradice nada.',
    '- "duplicado": significa lo mismo que un hecho de la lista, aunque esté redactado distinto (ej. "cierra domingos" = "no atiende los domingos").',
    '- "reemplaza": contradice un hecho de la lista — mismo tema, valor distinto (ej. cambió un horario, un precio, una dirección).',
    'Devuelve SOLO un JSON: { "accion": "insertar|duplicado|reemplaza", "indice": <número del hecho de la lista, o null si insertar> }.',
    'HECHOS QUE YA SÉ:',
    lista,
    `HECHO NUEVO: ${hechoNuevo.contenido}`,
  ].join('\n');
}

async function juzgarHecho({ hechoNuevo, existentes, http } = {}) {
  const client = http || axios;
  const model = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
  const key = process.env.GEMINI_API_KEY;
  const lista = existentes || [];
  const body = {
    model,
    messages: [{ role: 'user', content: buildJuezPrompt(hechoNuevo, lista) }],
    temperature: 0,
  };
  const res = await client.post(BASE, body, {
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    timeout: 30000,
  });
  const content = (res && res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message && res.data.choices[0].message.content) || '';
  return normalizeVeredicto(parseJsonLoose(content), lista.length);
}

module.exports = { juzgarHecho, normalizeVeredicto, parseJsonLoose };
```

> Nota: `normalizeMemoria`, `listMemorias`, `crearMemoria`, `borrarMemoria` se importan ahora aunque `reconciliar` (Task 2) los usa; ESLint puede marcarlos "unused" en este paso — es scaffolding para Task 2, no los borres. jest no falla por eso.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/gestionar-juez.test.js 2>&1 | tail -20`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD   # master
git add gastos/src/agent/gestionar.js gastos/tests/agent/gestionar-juez.test.js
git commit -m "feat(kaly-m3): juzgarHecho (LLM-juez insertar/duplicado/reemplaza)"
```

---

### Task 2: `reconciliar` (gateway sobre kaly_memory)

El gateway único: normaliza, lista existentes, juzga, y actúa (insertar / no-insertar duplicado / archivar viejo + insertar). Degrada suave si el juez falla. Respeta `origen`.

**Files:**
- Modify: `gastos/src/agent/gestionar.js`
- Test: `gastos/tests/agent/gestionar-db.test.js`

- [ ] **Step 1: Write the failing test**

Crea `gastos/tests/agent/gestionar-db.test.js` (usa el patrón pg-mem + `migrate` idéntico al de `gastos/tests/agent/aprender-db.test.js`):

```js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { reconciliar } = require('../../src/agent/gestionar');
const { listMemorias } = require('../../src/agent/memory');

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

const CO = '00000000-0000-0000-0000-0000000000aa';
const OTRA = '00000000-0000-0000-0000-0000000000bb';

describe('reconciliar', () => {
  let db;
  beforeEach(async () => { db = await freshDb(); });

  test('sin existentes → inserta sin llamar al juez', async () => {
    const juzgar = jest.fn();
    const r = await reconciliar(db, CO, { tipo: 'negocio', contenido: 'Vende pan', origen: 'auto' }, { juzgar });
    expect(r.accion).toBe('insertar');
    expect(juzgar).not.toHaveBeenCalled();
    const mem = await listMemorias(db, CO);
    expect(mem).toHaveLength(1);
    expect(mem[0].origen).toBe('auto');
  });

  test('juez "insertar" → crea fila', async () => {
    await db.query("INSERT INTO kaly_memory(company_id, tipo, contenido, origen) VALUES($1,'negocio','Vende pan','dueño')", [CO]);
    const juzgar = jest.fn().mockResolvedValue({ accion: 'insertar', indice: null });
    const r = await reconciliar(db, CO, { tipo: 'negocio', contenido: 'Atiende sábados', origen: 'kaly' }, { juzgar });
    expect(r.accion).toBe('insertar');
    const mem = await listMemorias(db, CO);
    expect(mem).toHaveLength(2);
  });

  test('juez "duplicado" → NO crea fila', async () => {
    await db.query("INSERT INTO kaly_memory(company_id, tipo, contenido, origen) VALUES($1,'negocio','Cierra domingos','dueño')", [CO]);
    const juzgar = jest.fn().mockResolvedValue({ accion: 'duplicado', indice: 1 });
    const r = await reconciliar(db, CO, { tipo: 'negocio', contenido: 'No atiende los domingos', origen: 'auto' }, { juzgar });
    expect(r.accion).toBe('duplicado');
    const mem = await listMemorias(db, CO);
    expect(mem).toHaveLength(1);
    expect(mem[0].contenido).toBe('Cierra domingos');
  });

  test('juez "reemplaza" → archiva el viejo y crea el nuevo', async () => {
    await db.query("INSERT INTO kaly_memory(company_id, tipo, contenido, origen) VALUES($1,'negocio','Cierra a las 18h','dueño')", [CO]);
    const juzgar = jest.fn().mockResolvedValue({ accion: 'reemplaza', indice: 1 });
    const r = await reconciliar(db, CO, { tipo: 'negocio', contenido: 'Cierra a las 20h', origen: 'kaly' }, { juzgar });
    expect(r.accion).toBe('reemplaza');
    expect(r.reemplazoId).toBeTruthy();
    const mem = await listMemorias(db, CO); // activo=true
    expect(mem).toHaveLength(1);
    expect(mem[0].contenido).toBe('Cierra a las 20h');
  });

  test('juez lanza error → inserta igual (degradación suave)', async () => {
    await db.query("INSERT INTO kaly_memory(company_id, tipo, contenido, origen) VALUES($1,'negocio','Algo','dueño')", [CO]);
    const juzgar = jest.fn().mockRejectedValue(new Error('gemini down'));
    const r = await reconciliar(db, CO, { tipo: 'negocio', contenido: 'Cosa nueva', origen: 'auto' }, { juzgar });
    expect(r.accion).toBe('insertar');
    expect(await listMemorias(db, CO)).toHaveLength(2);
  });

  test('contenido vacío → null', async () => {
    const r = await reconciliar(db, CO, { tipo: 'negocio', contenido: '   ', origen: 'auto' }, { juzgar: jest.fn() });
    expect(r).toBeNull();
  });

  test('scoped: no ve ni toca memorias de otra empresa', async () => {
    await db.query("INSERT INTO kaly_memory(company_id, tipo, contenido, origen) VALUES($1,'negocio','Secreto de B','dueño')", [OTRA]);
    const juzgar = jest.fn().mockResolvedValue({ accion: 'insertar', indice: null });
    await reconciliar(db, CO, { tipo: 'negocio', contenido: 'Hecho de A', origen: 'auto' }, { juzgar });
    expect(juzgar).not.toHaveBeenCalled(); // CO no tenía existentes
    expect(await listMemorias(db, OTRA)).toHaveLength(1);
    expect(await listMemorias(db, CO)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/gestionar-db.test.js 2>&1 | tail -25`
Expected: FAIL — `reconciliar is not a function`.

- [ ] **Step 3: Write minimal implementation**

En `gastos/src/agent/gestionar.js`, agrega `reconciliar` antes de `module.exports`:

```js
async function reconciliar(db, companyId, hechoNuevo, { http, juzgar } = {}) {
  const n = normalizeMemoria(hechoNuevo);
  if (!n) return null;
  const origen = hechoNuevo && hechoNuevo.origen;
  const existentes = await listMemorias(db, companyId);
  if (existentes.length === 0) {
    const memoria = await crearMemoria(db, companyId, { ...n, origen });
    return { accion: 'insertar', memoria };
  }
  const juzgarFn = juzgar || juzgarHecho;
  let veredicto;
  try {
    veredicto = await juzgarFn({ hechoNuevo: n, existentes, http });
  } catch (_e) {
    veredicto = { accion: 'insertar', indice: null };
  }
  const objetivo = veredicto && veredicto.indice ? existentes[veredicto.indice - 1] : null;
  if (veredicto && veredicto.accion === 'duplicado' && objetivo) {
    return { accion: 'duplicado', memoria: objetivo };
  }
  if (veredicto && veredicto.accion === 'reemplaza' && objetivo) {
    await borrarMemoria(db, companyId, objetivo.id);
    const memoria = await crearMemoria(db, companyId, { ...n, origen });
    return { accion: 'reemplaza', memoria, reemplazoId: objetivo.id };
  }
  const memoria = await crearMemoria(db, companyId, { ...n, origen });
  return { accion: 'insertar', memoria };
}
```

Y cambia el export a:

```js
module.exports = { juzgarHecho, reconciliar, normalizeVeredicto, parseJsonLoose };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/gestionar-db.test.js 2>&1 | tail -25`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD   # master
git add gastos/src/agent/gestionar.js gastos/tests/agent/gestionar-db.test.js
git commit -m "feat(kaly-m3): reconciliar (gateway insertar/duplicado/reemplaza, soft-delete)"
```

---

### Task 3: `aprenderDeConversacion` rutea por `reconciliar`

Reemplaza el dedupe-por-texto de M2 por el gateway `reconciliar` (ahora maneja duplicado semántico **y** contradicciones). `juzgar` se inyecta (default `juzgarHecho`). `creados` = hechos con accion `insertar` o `reemplaza`.

**Files:**
- Modify: `gastos/src/agent/aprender.js:71-93`
- Test: `gastos/tests/agent/aprender-db.test.js` (actualizar para inyectar `juzgar`)

- [ ] **Step 1: Update the tests (que ahora fallan con el código viejo)**

Reemplaza COMPLETO el bloque `describe('aprenderDeConversacion', ...)` de `gastos/tests/agent/aprender-db.test.js` (líneas 26 al final) por:

```js
describe('aprenderDeConversacion', () => {
  let db;

  beforeEach(async () => {
    db = await freshDb();
  });

  test('skip si la conversación no es sustancial (<4 turnos)', async () => {
    const extraer = jest.fn();
    const r = await aprenderDeConversacion(db, COMPANY_ID, { transcripcion: [{ role: 'user', text: 'hola' }], extraer });
    expect(r).toEqual({ creados: 0, skip: true });
    expect(extraer).not.toHaveBeenCalled();
  });

  test('crea los hechos extraídos con origen "auto"', async () => {
    const extraer = jest.fn().mockResolvedValue([
      { tipo: 'negocio', contenido: 'Atiende lunes a sábado' },
      { tipo: 'negocio', contenido: 'Vende empanadas' },
    ]);
    const juzgar = jest.fn().mockResolvedValue({ accion: 'insertar', indice: null });
    const r = await aprenderDeConversacion(db, COMPANY_ID, { transcripcion: TRANS4, extraer, juzgar });
    expect(r.creados).toBe(2);
    const mem = await listMemorias(db, COMPANY_ID);
    expect(mem).toHaveLength(2);
    expect(mem.every((m) => m.origen === 'auto')).toBe(true);
  });

  test('reconcilia: el juez marca un hecho como duplicado y no se inserta', async () => {
    await db.query("INSERT INTO kaly_memory(company_id, tipo, contenido, origen) VALUES($1,'negocio','Vende empanadas','dueño')", [COMPANY_ID]);
    const extraer = jest.fn().mockResolvedValue([
      { tipo: 'negocio', contenido: 'vende empanadas' },        // duplicado
      { tipo: 'negocio', contenido: 'Atiende lunes a sábado' }, // nuevo
    ]);
    const juzgar = jest.fn()
      .mockResolvedValueOnce({ accion: 'duplicado', indice: 1 })
      .mockResolvedValueOnce({ accion: 'insertar', indice: null });
    const r = await aprenderDeConversacion(db, COMPANY_ID, { transcripcion: TRANS4, extraer, juzgar });
    expect(r.creados).toBe(1);
    const mem = await listMemorias(db, COMPANY_ID);
    expect(mem.map((m) => m.contenido).sort()).toEqual(['Atiende lunes a sábado', 'Vende empanadas']);
  });

  test('si el extractor falla, no crea nada y reporta error', async () => {
    const extraer = jest.fn().mockRejectedValue(new Error('gemini down'));
    const r = await aprenderDeConversacion(db, COMPANY_ID, { transcripcion: TRANS4, extraer });
    expect(r.creados).toBe(0);
    expect(r.error).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/aprender-db.test.js 2>&1 | tail -25`
Expected: FAIL — el código viejo usa dedupe-por-texto, no llama a `juzgar`; el test "duplicado" inserta de más (creados 2 ≠ 1) o el juez mock queda sin usar.

- [ ] **Step 3: Update the implementation**

En `gastos/src/agent/aprender.js`:

(a) Tras los requires de arriba (junto a `const { listMemorias, crearMemoria, ... } = require('./memory');`), agrega:

```js
const { reconciliar } = require('./gestionar');
```

(b) **Elimina** la función `normTxt` (líneas 71-73 — ya no se usa).

(c) Reemplaza COMPLETA la función `aprenderDeConversacion` (líneas 75-93) por:

```js
async function aprenderDeConversacion(db, companyId, { transcripcion, http, extraer, juzgar } = {}) {
  if (!esSustancial(transcripcion)) return { creados: 0, skip: true };
  const extraerFn = extraer || extraerHechos;
  const memoriaActual = await listMemorias(db, companyId);
  let hechos;
  try {
    hechos = await extraerFn({ transcripcion, memoriaActual, http });
  } catch (_e) {
    return { creados: 0, error: true };
  }
  let creados = 0;
  const acciones = [];
  for (const h of hechos || []) {
    const r = await reconciliar(db, companyId, { ...h, origen: 'auto' }, { http, juzgar });
    if (r) acciones.push(r.accion);
    if (r && (r.accion === 'insertar' || r.accion === 'reemplaza')) creados += 1;
  }
  return { creados, acciones };
}
```

(d) `crearMemoria` ya no se usa directamente en `aprender.js` (lo usa `gestionar.js`). Quita `crearMemoria` del `require('./memory')` si quedó sin usar para no dejar import muerto. Verifica con: el require debe quedar `const { listMemorias } = require('./memory');` (más lo que siga usándose). `normalizeMemoria`/`formatMemoriaBlock` siguen usándose en `extraerHechos` — NO los quites.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/aprender-db.test.js tests/agent/aprender-extraer.test.js tests/agent/aprender-pure.test.js 2>&1 | tail -20`
Expected: PASS (todas).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD   # master
git add gastos/src/agent/aprender.js gastos/tests/agent/aprender-db.test.js
git commit -m "feat(kaly-m3): aprenderDeConversacion rutea por reconciliar (dedupe+contradicción)"
```

---

### Task 4: `POST /api/app/kaly/memoria` rutea por `reconciliar` + inyección del juez

El endpoint que cubre el `recordar` en vivo y el guardado manual del dueño ahora reconcilia. `juzgarHecho` se inyecta en `createAppRouter` (como `extraerHechos`); `/kaly/aprender` pasa `juzgar:_juzgarHecho`. Status: 201 si insertar/reemplaza (hubo fila), 200 si duplicado.

**Files:**
- Modify: `gastos/src/app/router.js` (require ~29, firma `createAppRouter` ~40, default inyectable ~48, ruta POST `/kaly/memoria` ~278, ruta `/kaly/aprender` ~289)
- Test: `gastos/tests/agent/gestionar-route.test.js` (nuevo)

- [ ] **Step 1: Write the failing test**

Crea `gastos/tests/agent/gestionar-route.test.js` (mismo patrón de montaje que `gastos/tests/agent/memoria-routes.test.js`):

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
  return c.rows[0].id;
}
async function token(a) { return (await request(a).post('/api/app/login').send({ usuario: 'juan', password: 'clave' })).body.token; }

describe('POST /api/app/kaly/memoria con reconciliación', () => {
  test('primer hecho (memoria vacía) → 201 accion insertar', async () => {
    const db = await freshDb(); await seed(db);
    const a = express(); a.use(express.json()); a.use('/api/app', createAppRouter({ db }));
    const t = await token(a);
    const res = await request(a).post('/api/app/kaly/memoria').set('Authorization', `Bearer ${t}`).send({ tipo: 'negocio', contenido: 'Cierra a las 18h' });
    expect(res.status).toBe(201);
    expect(res.body.accion).toBe('insertar');
  });

  test('hecho que contradice uno existente → reemplaza (juez inyectado)', async () => {
    const db = await freshDb(); const companyId = await seed(db);
    await db.query("INSERT INTO kaly_memory(company_id, tipo, contenido, origen) VALUES($1,'negocio','Cierra a las 18h','dueño')", [companyId]);
    const juzgarHecho = jest.fn().mockResolvedValue({ accion: 'reemplaza', indice: 1 });
    const a = express(); a.use(express.json()); a.use('/api/app', createAppRouter({ db, juzgarHecho }));
    const t = await token(a);
    const res = await request(a).post('/api/app/kaly/memoria').set('Authorization', `Bearer ${t}`).send({ tipo: 'negocio', contenido: 'Cierra a las 20h' });
    expect(res.status).toBe(201);
    expect(res.body.accion).toBe('reemplaza');
    const lista = await request(a).get('/api/app/kaly/memoria').set('Authorization', `Bearer ${t}`);
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0].contenido).toBe('Cierra a las 20h');
    expect(juzgarHecho).toHaveBeenCalled();
  });

  test('hecho duplicado → 200 accion duplicado, no crea fila', async () => {
    const db = await freshDb(); const companyId = await seed(db);
    await db.query("INSERT INTO kaly_memory(company_id, tipo, contenido, origen) VALUES($1,'negocio','Cierra domingos','dueño')", [companyId]);
    const juzgarHecho = jest.fn().mockResolvedValue({ accion: 'duplicado', indice: 1 });
    const a = express(); a.use(express.json()); a.use('/api/app', createAppRouter({ db, juzgarHecho }));
    const t = await token(a);
    const res = await request(a).post('/api/app/kaly/memoria').set('Authorization', `Bearer ${t}`).send({ tipo: 'negocio', contenido: 'No atiende los domingos' });
    expect(res.status).toBe(200);
    expect(res.body.accion).toBe('duplicado');
    const lista = await request(a).get('/api/app/kaly/memoria').set('Authorization', `Bearer ${t}`);
    expect(lista.body).toHaveLength(1);
  });

  test('contenido vacío → 400', async () => {
    const db = await freshDb(); await seed(db);
    const a = express(); a.use(express.json()); a.use('/api/app', createAppRouter({ db }));
    const t = await token(a);
    const res = await request(a).post('/api/app/kaly/memoria').set('Authorization', `Bearer ${t}`).send({ tipo: 'negocio', contenido: '   ' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/gestionar-route.test.js 2>&1 | tail -25`
Expected: FAIL — el POST viejo devuelve 201 con la memoria directa (sin `accion`); el caso "duplicado"/"reemplaza" no se cumple.

- [ ] **Step 3: Write the implementation**

En `gastos/src/app/router.js`:

(a) Junto al require `const realAprender = require('../agent/aprender');` (línea ~29), agrega:

```js
const realGestionar = require('../agent/gestionar');
```

(b) En la firma de `createAppRouter` (línea ~40), agrega `juzgarHecho` a la destructuración:

```js
function createAppRouter({ db, extractExpense, createLiveToken, sendText, extractCartola, componer, extraerProductos, extractLibroSii, varasGemini, extraerHechos, juzgarHecho } = {}) {
```

(c) Junto a `const _extraerHechos = extraerHechos || realAprender.extraerHechos;` (línea ~48), agrega:

```js
  const _juzgarHecho = juzgarHecho || realGestionar.juzgarHecho;
```

(d) Reemplaza la ruta `POST /kaly/memoria` (líneas ~278-282) por:

```js
  router.post('/kaly/memoria', async (req, res) => {
    const origen = (req.body && req.body.origen) || 'dueño';
    const r = await realGestionar.reconciliar(db, req.auth.companyId, { ...(req.body || {}), origen }, { juzgar: _juzgarHecho });
    if (!r) return res.status(400).json({ error: 'contenido_vacio' });
    return res.status(r.accion === 'duplicado' ? 200 : 201).json({ accion: r.accion, memoria: r.memoria });
  });
```

(e) Reemplaza la ruta `POST /kaly/aprender` (líneas ~289-293) por:

```js
  router.post('/kaly/aprender', async (req, res) => {
    const { transcripcion } = req.body || {};
    const r = await realAprender.aprenderDeConversacion(db, req.auth.companyId, { transcripcion, extraer: _extraerHechos, juzgar: _juzgarHecho });
    return res.json({ creados: r.creados });
  });
```

- [ ] **Step 4: Run test to verify it passes (+ que memoria-routes y aprender-route siguen verdes)**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/gestionar-route.test.js tests/agent/memoria-routes.test.js tests/agent/aprender-route.test.js 2>&1 | tail -20`
Expected: PASS (todas). `memoria-routes` sigue verde porque el insert en memoria vacía da 201 y solo chequea status; `aprender-route` sigue verde porque inserta en memoria vacía (el juez no se llama).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD   # master
git add gastos/src/app/router.js gastos/tests/agent/gestionar-route.test.js
git commit -m "feat(kaly-m3): POST /kaly/memoria + /kaly/aprender ruteados por reconciliar (juez inyectable)"
```

---

### Task 5: Suite completa verde + build

**Files:** (ninguno nuevo — verificación)

- [ ] **Step 1: Backend — suite completa**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest 2>&1 | tail -12`
Expected: PASS — todas las suites verdes (las 139 previas + gestionar-juez + gestionar-db + gestionar-route).

- [ ] **Step 2: App — suite completa (no debe haber cambiado nada, pero verificamos)**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest 2>&1 | tail -8`
Expected: PASS — sin cambios en la app, todo verde.

- [ ] **Step 3: App — build**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx vite build 2>&1 | tail -6`
Expected: build OK (`✓ built`).

- [ ] **Step 4: Commit (solo si algún ajuste fue necesario)**

Si los pasos 1-3 pasaron sin cambios, no hay nada que commitear. Si hubo un fix, `git add <archivo específico>` + `fix(kaly-m3): ...`.

---

## Self-Review

**1. Spec coverage:**
- `juzgarHecho` (Gemini, http inyectable, prompt con existentes numeradas, JSON {accion,indice}, normaliza inválidos→insertar) → Task 1 ✅
- `reconciliar` (normalize→null, listMemorias fresco, sin existentes→insert, juez try/catch→insert, duplicado/reemplaza/insertar, respeta origen, devuelve {accion,memoria?,reemplazoId?}) → Task 2 ✅
- `aprenderDeConversacion` rutea por reconciliar (origen auto, juzgar inyectable, creados=insertar+reemplaza) → Task 3 ✅
- `POST /kaly/memoria` + `/kaly/aprender` ruteados por reconciliar, `juzgarHecho` inyectable en createAppRouter → Task 4 ✅
- Sin migración de DB (reusa kaly_memory + soft-delete) → ningún task crea tabla/columna ✅
- App sin cambios (MemoriaKalyView ignora el return del POST) → ningún task toca la app ✅
- Suite + build → Task 5 ✅

**2. Placeholder scan:** Sin "TBD"/"TODO". Las referencias a "mismo patrón pg-mem que aprender-db/memoria-routes" son por reutilizar el helper real del repo (mostrado completo en los tests), no placeholders.

**3. Type consistency:** `juzgarHecho({hechoNuevo, existentes, http})` → `{accion, indice}`; `reconciliar(db, companyId, hechoNuevo, {http, juzgar})` → `{accion, memoria?, reemplazoId?}`; `aprenderDeConversacion(..., {transcripcion, http, extraer, juzgar})`; createAppRouter inyecta `juzgarHecho`, el endpoint pasa `juzgar:_juzgarHecho`. `normalizeVeredicto(data, n)`. Acciones `insertar|duplicado|reemplaza` consistentes en todos los tasks. `origen` se preserva vía `{...n, origen}` (normalizeMemoria descarta origen, por eso se re-añade). ✅
