# KALY Aprender Automático (M2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que KALY aprenda sola: al cerrar una conversación sustancial, un LLM lee la transcripción + la memoria actual y guarda en `kaly_memory` (origen `auto`) los hechos nuevos del negocio/dueño, sin que KALY tenga que llamar la tool `recordar`.

**Architecture:** Backend `gastos/src/agent/aprender.js` con tres funciones (`esSustancial` pura, `extraerHechos` vía Gemini OpenAI-compat calcando `catalog/extraer.js`, `aprenderDeConversacion` que orquesta sobre `memory.js`). Endpoint `POST /api/app/kaly/aprender` (auth empleado, scoped, extractor inyectable como `extractExpense`/`extraerProductos`). La app (`KalyAgent.jsx`) acumula los turnos de la charla y, al cerrar, si hay ≥4 turnos, llama `api.kalyAprender` fire-and-forget. La transcripción NO se persiste.

**Tech Stack:** Node + Express + Postgres (jest + pg-mem) en `gastos/`; React 18 + Capacitor + Vite (jest + RTL + jsdom) en `gastos-app/`. Gemini vía OpenAI-compat (`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, Bearer `GEMINI_API_KEY`).

**⚠️ Reglas del repo (Antigravity trabaja la misma rama `master` en paralelo):**
- Todo en `C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\` (NO el worktree).
- Antes de cada commit: `git rev-parse --abbrev-ref HEAD` debe ser `master` y `git rev-parse --show-toplevel` debe terminar en `HASH IA`.
- SIEMPRE `git add <archivos específicos>` — NUNCA `git add -A` ni `git add .`.
- Comandos de test desde la subcarpeta correcta (`gastos/` o `gastos-app/`).

---

### Task 1: `crearMemoria` acepta origen `auto`

`crearMemoria` hoy fuerza el origen a `dueño` o `kaly` (cualquier otro cae a `kaly`). M2 necesita un tercer origen `auto`. Lo ampliamos con una whitelist.

**Files:**
- Modify: `gastos/src/agent/memory.js:29`
- Test: `gastos/tests/agent/memory-db.test.js`

- [ ] **Step 1: Write the failing test**

Añade este test al final del `describe` existente en `gastos/tests/agent/memory-db.test.js` (usa el mismo helper de DB pg-mem que ya emplean los otros tests del archivo — reutiliza el `beforeEach`/`db`/`companyId` ya definidos arriba en ese archivo):

```js
test('crearMemoria acepta origen "auto"', async () => {
  const m = await crearMemoria(db, companyId, { tipo: 'negocio', contenido: 'Atiende sábados', origen: 'auto' });
  expect(m.origen).toBe('auto');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/memory-db.test.js -t "origen \"auto\"" 2>&1 | tail -20`
Expected: FAIL — `expect(received).toBe('auto')` recibe `'kaly'`.

- [ ] **Step 3: Write minimal implementation**

En `gastos/src/agent/memory.js`, reemplaza la línea 29 (dentro de `crearMemoria`):

```js
  const origen = input && input.origen === 'dueño' ? 'dueño' : 'kaly';
```

por:

```js
  const ORIGENES = ['kaly', 'dueño', 'auto'];
  const origen = input && ORIGENES.includes(input.origen) ? input.origen : 'kaly';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/memory-db.test.js 2>&1 | tail -20`
Expected: PASS (todos los tests del archivo, incluido el nuevo).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD   # debe imprimir: master
git add gastos/src/agent/memory.js gastos/tests/agent/memory-db.test.js
git commit -m "feat(kaly-m2): crearMemoria acepta origen 'auto'"
```

---

### Task 2: `esSustancial` (puro)

Decide si vale la pena gastar una llamada LLM: solo si la conversación tiene ≥4 turnos con texto real. Un "turno" = un elemento `{ role, text }` con `text` no vacío.

**Files:**
- Create: `gastos/src/agent/aprender.js`
- Test: `gastos/tests/agent/aprender-pure.test.js`

- [ ] **Step 1: Write the failing test**

Crea `gastos/tests/agent/aprender-pure.test.js`:

```js
const { esSustancial } = require('../../src/agent/aprender');

describe('esSustancial', () => {
  test('true con 4 o más turnos con texto', () => {
    const t = [
      { role: 'user', text: 'hola kaly' },
      { role: 'kaly', text: 'hola, ¿en qué te ayudo?' },
      { role: 'user', text: 'atiendo de 9 a 18' },
      { role: 'kaly', text: 'anotado' },
    ];
    expect(esSustancial(t)).toBe(true);
  });

  test('false con menos de 4 turnos', () => {
    expect(esSustancial([{ role: 'user', text: 'hola' }, { role: 'kaly', text: 'hola' }])).toBe(false);
  });

  test('ignora turnos vacíos o sin texto', () => {
    const t = [
      { role: 'user', text: 'hola' },
      { role: 'kaly', text: '' },
      { role: 'user', text: '   ' },
      { role: 'kaly', text: 'chao' },
    ];
    expect(esSustancial(t)).toBe(false); // solo 2 con texto real
  });

  test('false con entrada no-array', () => {
    expect(esSustancial(null)).toBe(false);
    expect(esSustancial(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/aprender-pure.test.js 2>&1 | tail -20`
Expected: FAIL — `Cannot find module '../../src/agent/aprender'`.

- [ ] **Step 3: Write minimal implementation**

Crea `gastos/src/agent/aprender.js`:

```js
// Aprender automático (M2): al cerrar una conversación sustancial, extrae los
// hechos nuevos del negocio/dueño y los guarda en kaly_memory (origen 'auto').
const axios = require('axios');
const { listMemorias, crearMemoria, normalizeMemoria, formatMemoriaBlock } = require('./memory');

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

function esSustancial(transcripcion) {
  const arr = Array.isArray(transcripcion) ? transcripcion : [];
  const conTexto = arr.filter((t) => t && String(t.text || '').trim());
  return conTexto.length >= 4;
}

module.exports = { esSustancial, parseJsonLoose };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/aprender-pure.test.js 2>&1 | tail -20`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD   # master
git add gastos/src/agent/aprender.js gastos/tests/agent/aprender-pure.test.js
git commit -m "feat(kaly-m2): esSustancial (umbral 4 turnos) en agent/aprender"
```

---

### Task 3: `extraerHechos` (Gemini, http inyectable)

Llama a Gemini (OpenAI-compat) con la transcripción + la memoria actual y devuelve `[{tipo, contenido}]` ya normalizados. Calca el patrón de `catalog/extraer.js` (axios `http` inyectable, Bearer key, `parseJsonLoose`, modelo texto). Recibe `memoriaActual` para que el LLM no repita lo ya sabido.

**Files:**
- Modify: `gastos/src/agent/aprender.js`
- Test: `gastos/tests/agent/aprender-extraer.test.js`

- [ ] **Step 1: Write the failing test**

Crea `gastos/tests/agent/aprender-extraer.test.js`:

```js
const { extraerHechos } = require('../../src/agent/aprender');

function fakeHttp(content) {
  return { post: jest.fn().mockResolvedValue({ data: { choices: [{ message: { content } }] } }) };
}

const TRANSCRIPCION = [
  { role: 'user', text: 'atiendo de lunes a sábado de 9 a 18' },
  { role: 'kaly', text: 'perfecto, lo anoto' },
  { role: 'user', text: 'vendo empanadas y pan amasado' },
  { role: 'kaly', text: 'genial' },
];

describe('extraerHechos', () => {
  test('parsea el JSON de Gemini y normaliza los hechos', async () => {
    const http = fakeHttp('{ "hechos": [ { "tipo": "negocio", "contenido": "Atiende lunes a sábado 9-18" }, { "tipo": "negocio", "contenido": "Vende empanadas y pan amasado" } ] }');
    const out = await extraerHechos({ transcripcion: TRANSCRIPCION, memoriaActual: [], http });
    expect(out).toEqual([
      { tipo: 'negocio', contenido: 'Atiende lunes a sábado 9-18' },
      { tipo: 'negocio', contenido: 'Vende empanadas y pan amasado' },
    ]);
  });

  test('descarta hechos inválidos (sin contenido) y normaliza tipo desconocido a "hecho"', async () => {
    const http = fakeHttp('{ "hechos": [ { "tipo": "negocio", "contenido": "" }, { "tipo": "rarito", "contenido": "El dueño se llama José" } ] }');
    const out = await extraerHechos({ transcripcion: TRANSCRIPCION, memoriaActual: [], http });
    expect(out).toEqual([{ tipo: 'hecho', contenido: 'El dueño se llama José' }]);
  });

  test('devuelve [] cuando no hay hechos', async () => {
    const http = fakeHttp('{ "hechos": [] }');
    const out = await extraerHechos({ transcripcion: TRANSCRIPCION, memoriaActual: [], http });
    expect(out).toEqual([]);
  });

  test('incluye la memoria actual en el prompt enviado a Gemini', async () => {
    const http = fakeHttp('{ "hechos": [] }');
    await extraerHechos({
      transcripcion: TRANSCRIPCION,
      memoriaActual: [{ tipo: 'negocio', contenido: 'Vende empanadas y pan amasado' }],
      http,
    });
    const body = http.post.mock.calls[0][1];
    const enviado = body.messages[0].content;
    expect(enviado).toContain('Vende empanadas y pan amasado');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/aprender-extraer.test.js 2>&1 | tail -20`
Expected: FAIL — `extraerHechos is not a function`.

- [ ] **Step 3: Write minimal implementation**

En `gastos/src/agent/aprender.js`, agrega estas funciones antes de `module.exports` y amplía el export:

```js
function buildExtractPrompt(memoriaActual) {
  const memTxt = formatMemoriaBlock(memoriaActual) || '(sin memoria previa)';
  return [
    'Eres el extractor de memoria de KALY, la asistente de una pyme chilena.',
    'Lee la conversación entre el dueño y KALY y extrae SOLO hechos DURADEROS del negocio o del dueño',
    '(horarios, productos/servicios, ubicación, formas de pago, preferencias, datos del dueño).',
    'NADA de saludos, chit-chat ni cosas del momento.',
    'NO repitas hechos que ya estén en esta memoria actual:',
    memTxt,
    'Devuelve SOLO un JSON con esta forma exacta: { "hechos": [{ "tipo": "negocio|dueño|preferencia|hecho", "contenido": "<frase corta>" }] }.',
    'Si no hay nada nuevo que valga la pena recordar, devuelve { "hechos": [] }.',
  ].join(' ');
}

function transcripcionToText(transcripcion) {
  const arr = Array.isArray(transcripcion) ? transcripcion : [];
  return arr
    .map((t) => `${t && t.role === 'kaly' ? 'KALY' : 'Dueño'}: ${String((t && t.text) || '').trim()}`)
    .filter((l) => l.length > 7)
    .join('\n');
}

async function extraerHechos({ transcripcion, memoriaActual, http } = {}) {
  const client = http || axios;
  const model = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
  const key = process.env.GEMINI_API_KEY;
  const body = {
    model,
    messages: [
      { role: 'user', content: `${buildExtractPrompt(memoriaActual)}\n\nCONVERSACIÓN:\n${transcripcionToText(transcripcion)}` },
    ],
    temperature: 0.1,
  };
  const res = await client.post(BASE, body, {
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    timeout: 30000,
  });
  const content = (res && res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message && res.data.choices[0].message.content) || '';
  const data = parseJsonLoose(content);
  const arr = Array.isArray(data && data.hechos) ? data.hechos : [];
  return arr.map((h) => normalizeMemoria(h)).filter(Boolean);
}
```

Y cambia el export final a:

```js
module.exports = { esSustancial, extraerHechos, parseJsonLoose };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/aprender-extraer.test.js 2>&1 | tail -20`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD   # master
git add gastos/src/agent/aprender.js gastos/tests/agent/aprender-extraer.test.js
git commit -m "feat(kaly-m2): extraerHechos via Gemini (http inyectable, memoria en prompt)"
```

---

### Task 4: `aprenderDeConversacion` (orquestador, pg-mem)

Junta todo: si no es sustancial, no hace nada. Si lo es, lista la memoria actual, extrae hechos, descarta los casi-idénticos a lo existente (dedupe por texto normalizado, red de seguridad) y crea los nuevos con `origen: 'auto'`. El extractor es inyectable (`opts.extraer`) para testear sin pegarle a Gemini; por defecto usa el `extraerHechos` real.

**Files:**
- Modify: `gastos/src/agent/aprender.js`
- Test: `gastos/tests/agent/aprender-db.test.js`

- [ ] **Step 1: Write the failing test**

Crea `gastos/tests/agent/aprender-db.test.js`. Usa pg-mem igual que `gastos/tests/agent/memory-db.test.js` — abre ese archivo y copia su patrón exacto de setup (cómo crea el `db`, la tabla `kaly_memory` y el `companyId`). Estructura esperada:

```js
const { newDb } = require('pg-mem');
const { aprenderDeConversacion } = require('../../src/agent/aprender');
const { listMemorias } = require('../../src/agent/memory');

const companyId = '11111111-1111-1111-1111-111111111111';

function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  mem.public.registerFunction({ name: 'now', returns: 'timestamp', impure: true, implementation: () => new Date() });
  mem.public.none(`CREATE TABLE kaly_memory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid,
    tipo text DEFAULT 'hecho',
    contenido text,
    origen text DEFAULT 'kaly',
    activo boolean DEFAULT true,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
  );`);
  return mem.adapters.createPg().Pool ? new (mem.adapters.createPg().Pool)() : mem.adapters.createPg();
}

const TRANS4 = [
  { role: 'user', text: 'atiendo de lunes a sábado' },
  { role: 'kaly', text: 'anotado' },
  { role: 'user', text: 'vendo empanadas' },
  { role: 'kaly', text: 'genial' },
];

describe('aprenderDeConversacion', () => {
  test('skip si la conversación no es sustancial (<4 turnos)', async () => {
    const db = makeDb();
    const extraer = jest.fn();
    const r = await aprenderDeConversacion(db, companyId, { transcripcion: [{ role: 'user', text: 'hola' }], extraer });
    expect(r).toEqual({ creados: 0, skip: true });
    expect(extraer).not.toHaveBeenCalled();
  });

  test('crea los hechos extraídos con origen "auto"', async () => {
    const db = makeDb();
    const extraer = jest.fn().mockResolvedValue([
      { tipo: 'negocio', contenido: 'Atiende lunes a sábado' },
      { tipo: 'negocio', contenido: 'Vende empanadas' },
    ]);
    const r = await aprenderDeConversacion(db, companyId, { transcripcion: TRANS4, extraer });
    expect(r.creados).toBe(2);
    const mem = await listMemorias(db, companyId);
    expect(mem).toHaveLength(2);
    expect(mem.every((m) => m.origen === 'auto')).toBe(true);
  });

  test('dedupe: descarta hechos casi-idénticos a la memoria existente', async () => {
    const db = makeDb();
    await db.query("INSERT INTO kaly_memory(company_id, tipo, contenido, origen) VALUES($1,'negocio','Vende empanadas','dueño')", [companyId]);
    const extraer = jest.fn().mockResolvedValue([
      { tipo: 'negocio', contenido: 'vende empanadas' },        // duplicado (case/espacios)
      { tipo: 'negocio', contenido: 'Atiende lunes a sábado' }, // nuevo
    ]);
    const r = await aprenderDeConversacion(db, companyId, { transcripcion: TRANS4, extraer });
    expect(r.creados).toBe(1);
    const mem = await listMemorias(db, companyId);
    expect(mem.map((m) => m.contenido).sort()).toEqual(['Atiende lunes a sábado', 'Vende empanadas']);
  });

  test('si el extractor falla, no crea nada y reporta error', async () => {
    const db = makeDb();
    const extraer = jest.fn().mockRejectedValue(new Error('gemini down'));
    const r = await aprenderDeConversacion(db, companyId, { transcripcion: TRANS4, extraer });
    expect(r.creados).toBe(0);
    expect(r.error).toBe(true);
  });
});
```

> Si el patrón pg-mem de `memory-db.test.js` difiere del `makeDb()` de arriba (p. ej. registra otras funciones o crea la tabla de otra forma), usa el de `memory-db.test.js` — es la fuente de verdad de cómo levantar la DB en este repo.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/aprender-db.test.js 2>&1 | tail -25`
Expected: FAIL — `aprenderDeConversacion is not a function`.

- [ ] **Step 3: Write minimal implementation**

En `gastos/src/agent/aprender.js`, agrega antes de `module.exports`:

```js
function normTxt(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function aprenderDeConversacion(db, companyId, { transcripcion, http, extraer } = {}) {
  if (!esSustancial(transcripcion)) return { creados: 0, skip: true };
  const extraerFn = extraer || extraerHechos;
  const memoriaActual = await listMemorias(db, companyId);
  const existentes = new Set(memoriaActual.map((m) => normTxt(m.contenido)));
  let hechos;
  try {
    hechos = await extraerFn({ transcripcion, memoriaActual, http });
  } catch (_e) {
    return { creados: 0, error: true };
  }
  const nuevos = (hechos || []).filter((h) => h && !existentes.has(normTxt(h.contenido)));
  const creados = [];
  for (const h of nuevos) {
    const m = await crearMemoria(db, companyId, { ...h, origen: 'auto' });
    if (m) creados.push(m);
  }
  return { creados: creados.length, hechos: creados };
}
```

Y actualiza el export final a:

```js
module.exports = { esSustancial, extraerHechos, aprenderDeConversacion, parseJsonLoose };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/aprender-db.test.js 2>&1 | tail -25`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD   # master
git add gastos/src/agent/aprender.js gastos/tests/agent/aprender-db.test.js
git commit -m "feat(kaly-m2): aprenderDeConversacion (skip/extraer/dedupe/crear origen auto)"
```

---

### Task 5: Endpoint `POST /api/app/kaly/aprender`

Expone el aprendizaje a la app. Auth empleado (ya cubierto por el middleware del router app), scoped por `req.auth.companyId`. El extractor `extraerHechos` se inyecta en `createAppRouter` (como `extractExpense`/`extraerProductos`) para poder testear el endpoint sin Gemini.

**Files:**
- Modify: `gastos/src/app/router.js:28` (require), `:40` (firma `createAppRouter`), `:46-47` (default del inyectable), y zona de rutas kaly (`:285`)
- Test: `gastos/tests/agent/aprender-route.test.js`

- [ ] **Step 1: Write the failing test**

Crea `gastos/tests/agent/aprender-route.test.js`. Abre `gastos/tests/agent/memoria-routes.test.js` y copia su patrón exacto de montaje (cómo construye la app Express con `createAppRouter`, cómo simula la auth de empleado / setea `req.auth`, y cómo levanta la DB pg-mem con la tabla `kaly_memory`). Estructura esperada:

```js
// Reutiliza el helper de montaje de memoria-routes.test.js (app + auth empleado + db pg-mem con kaly_memory).
const request = require('supertest');

// ...setup idéntico a memoria-routes.test.js, pero inyectando un extraerHechos mock:
// const extraerHechos = jest.fn().mockResolvedValue([{ tipo: 'negocio', contenido: 'Atiende sábados' }]);
// const router = createAppRouter({ db, extraerHechos, /* ...demás mocks que ya use ese archivo */ });

describe('POST /api/app/kaly/aprender', () => {
  test('401 sin token de empleado', async () => {
    // Igual que el test de 401 en memoria-routes.test.js (sin Authorization)
    const res = await request(appSinAuth).post('/api/app/kaly/aprender').send({ transcripcion: [] });
    expect(res.status).toBe(401);
  });

  test('aprende y devuelve { creados } (scoped por empresa, extractor inyectado)', async () => {
    const res = await request(app)
      .post('/api/app/kaly/aprender')
      .set('Authorization', `Bearer ${tokenEmpleado}`)
      .send({ transcripcion: [
        { role: 'user', text: 'atiendo sábados' },
        { role: 'kaly', text: 'anotado' },
        { role: 'user', text: 'vendo pan' },
        { role: 'kaly', text: 'genial' },
      ] });
    expect(res.status).toBe(200);
    expect(res.body.creados).toBe(1);
    expect(extraerHechos).toHaveBeenCalled();
  });

  test('conversación no sustancial → { creados: 0 } sin llamar al extractor', async () => {
    const res = await request(app)
      .post('/api/app/kaly/aprender')
      .set('Authorization', `Bearer ${tokenEmpleado}`)
      .send({ transcripcion: [{ role: 'user', text: 'hola' }] });
    expect(res.status).toBe(200);
    expect(res.body.creados).toBe(0);
  });
});
```

> El nombre exacto de las variables de montaje (`app`, `appSinAuth`, `tokenEmpleado`, cómo se obtiene `db`) debe copiarse de `memoria-routes.test.js` para que el setup de auth y DB sea idéntico. Inyecta el mock con la key `extraerHechos` en `createAppRouter`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/aprender-route.test.js 2>&1 | tail -25`
Expected: FAIL — 404 en el POST (la ruta no existe todavía).

- [ ] **Step 3: Write minimal implementation**

En `gastos/src/app/router.js`:

(a) Junto al require de la línea 28 (`const { extraerProductos: realExtraerProductos } = require('../catalog/extraer');`), agrega:

```js
const realAprender = require('../agent/aprender');
```

(b) En la firma de `createAppRouter` (línea 40), agrega `extraerHechos` a la destructuración:

```js
function createAppRouter({ db, extractExpense, createLiveToken, sendText, extractCartola, componer, extraerProductos, extractLibroSii, varasGemini, extraerHechos } = {}) {
```

(c) Junto a los defaults de inyectables (cerca de la línea 46-47), agrega:

```js
  const _extraerHechos = extraerHechos || realAprender.extraerHechos;
```

(d) Después del bloque de rutas `/kaly/memoria` (tras la línea 285, antes de `router.post('/agent/resumen-whatsapp', ...)`), agrega:

```js
  router.post('/kaly/aprender', async (req, res) => {
    const { transcripcion } = req.body || {};
    const r = await realAprender.aprenderDeConversacion(db, req.auth.companyId, { transcripcion, extraer: _extraerHechos });
    return res.json({ creados: r.creados });
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/aprender-route.test.js 2>&1 | tail -25`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD   # master
git add gastos/src/app/router.js gastos/tests/agent/aprender-route.test.js
git commit -m "feat(kaly-m2): endpoint POST /api/app/kaly/aprender (extractor inyectable, scoped)"
```

---

### Task 6: App — `api.kalyAprender` + `KalyAgent` acumula turnos y aprende al cerrar

La app junta los turnos de la conversación y, al cerrar (`stop` o `onClose`), si hay ≥4 turnos llama `api.kalyAprender` sin esperar (fire-and-forget; errores ignorados). Luego limpia el buffer.

**Files:**
- Modify: `gastos-app/src/gastos/api.js:104` (tras `kalyBorrarMemoria`)
- Modify: `gastos-app/src/gastos/kaly/KalyAgent.jsx`
- Test: `gastos-app/tests/gastos/api.test.js` (un caso), `gastos-app/tests/gastos/KalyAgent.test.jsx` (dos casos)

- [ ] **Step 1: Write the failing test (api.js)**

Abre `gastos-app/tests/gastos/api.test.js` y mira cómo testea los otros métodos `req`-based (mock de `fetch`, assert de URL/method/body). Agrega un test análogo:

```js
test('kalyAprender hace POST a /api/app/kaly/aprender con la transcripción', async () => {
  // Sigue el mismo patrón de mock de fetch que usan los demás tests del archivo.
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ creados: 2 }) });
  const payload = { transcripcion: [{ role: 'user', text: 'hola' }] };
  const out = await api.kalyAprender(payload);
  expect(out).toEqual({ creados: 2 });
  const [url, opts] = global.fetch.mock.calls[0];
  expect(url).toContain('/api/app/kaly/aprender');
  expect(opts.method).toBe('POST');
  expect(JSON.parse(opts.body)).toEqual(payload);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest tests/gastos/api.test.js -t "kalyAprender" 2>&1 | tail -20`
Expected: FAIL — `api.kalyAprender is not a function`.

- [ ] **Step 3: Write minimal implementation (api.js)**

En `gastos-app/src/gastos/api.js`, tras la línea 104 (`kalyBorrarMemoria`), dentro del objeto `api`, agrega:

```js
  kalyAprender(payload) { return req('/api/app/kaly/aprender', { method: 'POST', body: payload }); },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest tests/gastos/api.test.js -t "kalyAprender" 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 5: Write the failing test (KalyAgent)**

En `gastos-app/tests/gastos/KalyAgent.test.jsx`, agrega `kalyAprender: jest.fn().mockResolvedValue({ creados: 0 })` al objeto `api` del `jest.mock('../../src/gastos/api', ...)` (junto a `agentSession`). Luego agrega estos dos tests al final del archivo:

```js
test('(9) al cerrar con ≥4 turnos → llama api.kalyAprender con la transcripción acumulada', async () => {
  await act(async () => { render(<KalyAgent />); });
  await waitFor(() => expect(openLiveSession).toHaveBeenCalledTimes(1));

  // Acumula 4 turnos (user/kaly alternados) vía las callbacks de live.js
  act(() => {
    lastLiveOpts.onUserTranscript('atiendo de 9 a 18');
    lastLiveOpts.onAgentTranscript('anotado');
    lastLiveOpts.onUserTranscript('vendo empanadas');
    lastLiveOpts.onAgentTranscript('genial');
  });

  // Cierra la sesión (close manual → stop)
  act(() => { lastLiveOpts.onClose(); });

  expect(api.kalyAprender).toHaveBeenCalledTimes(1);
  const arg = api.kalyAprender.mock.calls[0][0];
  expect(Array.isArray(arg.transcripcion)).toBe(true);
  expect(arg.transcripcion.length).toBeGreaterThanOrEqual(4);
});

test('(10) al cerrar con <4 turnos → NO llama api.kalyAprender', async () => {
  await act(async () => { render(<KalyAgent />); });
  await waitFor(() => expect(openLiveSession).toHaveBeenCalledTimes(1));

  act(() => {
    lastLiveOpts.onUserTranscript('hola');
    lastLiveOpts.onAgentTranscript('hola, ¿en qué te ayudo?');
  });
  act(() => { lastLiveOpts.onClose(); });

  expect(api.kalyAprender).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest tests/gastos/KalyAgent.test.jsx -t "kalyAprender" 2>&1 | tail -25`
Expected: FAIL — `api.kalyAprender` no se llamó (turnos no acumulados / flush no implementado).

- [ ] **Step 7: Write minimal implementation (KalyAgent.jsx)**

En `gastos-app/src/gastos/kaly/KalyAgent.jsx`:

(a) Junto a los otros `useRef` (cerca de la línea 36), agrega un buffer de turnos:

```js
  const turnosRef = useRef([]);
```

(b) Justo después de la definición de `armSilenceTimer` (antes de `aplicarMute`, ~línea 46), agrega los helpers:

```js
  function pushTurn(role, text) {
    const t = String(text || '').trim();
    if (!t) return;
    const arr = turnosRef.current;
    const last = arr[arr.length - 1];
    if (last && last.role === role) last.text = `${last.text} ${t}`;
    else arr.push({ role, text: t });
  }
  function flushAprender() {
    const turnos = turnosRef.current;
    turnosRef.current = [];
    if (turnos.length >= 4) { api.kalyAprender({ transcripcion: turnos }).catch(() => {}); }
  }
```

(c) En `stop` (useCallback, ~línea 53), llama a `flushAprender()` al inicio:

```js
  const stop = useCallback(() => {
    flushAprender();
    clearSilenceTimer();
    if (sessionRef.current) { sessionRef.current.close(); sessionRef.current = null; }
    setState('off');
    setMessages([]);
  }, []);
```

(d) En `onUserTranscript` (~línea 84), agrega `pushTurn('user', text);` como primera línea del cuerpo:

```js
      const onUserTranscript = (text) => {
        pushTurn('user', text);
        clearSilenceTimer();
        setMessages((prev) => [...prev, { sender: 'user', text }]);
        if (esSilenciar(text)) { aplicarMute(true); return; }
        if (esNegativa(text)) setTimeout(() => stop(), 2500);
      };
```

(e) En `onAgentTranscript` (~línea 90), agrega `pushTurn('kaly', text);` como primera línea:

```js
      const onAgentTranscript = (text) => {
        pushTurn('kaly', text);
        setMessages((prev) => {
```

(f) En `onClose` (~línea 108), llama a `flushAprender()` antes de limpiar:

```js
      const onClose = () => { flushAprender(); sessionRef.current = null; setState('off'); setMessages([]); };
```

> Nota: `flushAprender`/`pushTurn` son funciones declaradas dentro del componente (no `useCallback`), así que `stop`/`start` pueden referenciarlas sin agregarlas a sus arrays de dependencias. No modifiques los deps existentes de `stop` ni de `start`.

- [ ] **Step 8: Run test to verify it passes**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest tests/gastos/KalyAgent.test.jsx 2>&1 | tail -25`
Expected: PASS (los 10 tests del archivo, incluidos los 2 nuevos).

- [ ] **Step 9: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD   # master
git add gastos-app/src/gastos/api.js gastos-app/src/gastos/kaly/KalyAgent.jsx gastos-app/tests/gastos/api.test.js gastos-app/tests/gastos/KalyAgent.test.jsx
git commit -m "feat(kaly-m2): app acumula turnos y aprende al cerrar (api.kalyAprender)"
```

---

### Task 7: Suite completa verde + build

Verifica que nada se rompió en backend ni app, y que la app compila.

**Files:** (ninguno nuevo — solo verificación)

- [ ] **Step 1: Backend — suite completa**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest 2>&1 | tail -15`
Expected: PASS — todas las suites verdes (las previas 412+ más los nuevos tests de aprender).

- [ ] **Step 2: App — suite completa**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest 2>&1 | tail -15`
Expected: PASS — todas las suites verdes (172+ más los nuevos).

- [ ] **Step 3: App — build**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx vite build 2>&1 | tail -15`
Expected: build OK (`✓ built in ...`), sin errores.

- [ ] **Step 4: Commit (si hubo algún ajuste de verificación)**

Si los pasos 1-3 no requirieron cambios, no hay nada que commitear (la verificación pasa con lo ya commiteado). Si hubo un fix, commitéalo con `git add <archivo>` específico y mensaje `test(kaly-m2): ...` o `fix(kaly-m2): ...`.

---

## Self-Review

**1. Spec coverage:**
- `esSustancial` (≥4 turnos) → Task 2 ✅
- `extraerHechos` (Gemini OpenAI-compat, http inyectable, memoria en prompt, normaliza, JSON `{hechos}`) → Task 3 ✅
- `aprenderDeConversacion` (skip / listMemorias / extraer / dedupe texto / crearMemoria origen `auto`) → Task 4 ✅ (+ origen `auto` habilitado en Task 1)
- Endpoint `POST /api/app/kaly/aprender` (auth empleado, scoped, extractor inyectable) → Task 5 ✅
- App: `KalyAgent` acumula turnos, al cerrar (≥4) llama `api.kalyAprender` fire-and-forget; `api.kalyAprender` → Task 6 ✅
- Transcripción NO se persiste → no hay tabla ni INSERT de transcripción en ningún task ✅
- Suite verde + build → Task 7 ✅

**2. Placeholder scan:** Sin "TBD"/"TODO". Los puntos donde se pide "copiar el patrón de memory-db.test.js / memoria-routes.test.js" son por la variación real de los helpers pg-mem/auth del repo (la fuente de verdad es ese archivo), no placeholders de lógica — la lógica de cada test y de cada implementación está completa y mostrada.

**3. Type consistency:** `esSustancial(transcripcion)`, `extraerHechos({transcripcion, memoriaActual, http})`, `aprenderDeConversacion(db, companyId, {transcripcion, http, extraer})`, `crearMemoria(db, companyId, {tipo, contenido, origen})`, `listMemorias(db, companyId)`, `api.kalyAprender(payload)` — consistentes entre tasks. Turnos siempre `{role, text}` con `role` `'user'|'kaly'`. Origen nuevo `'auto'` en whitelist (Task 1) y usado en Task 4. Inyectable `extraerHechos` en `createAppRouter` y `extraer` en `aprenderDeConversacion` — el router pasa `extraer: _extraerHechos`. ✅
