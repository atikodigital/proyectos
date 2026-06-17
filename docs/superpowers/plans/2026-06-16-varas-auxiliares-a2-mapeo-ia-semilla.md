# VARAS Auxiliares — Fase A2: Mapeo IA + semilla por rubro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada línea de un gasto quede asignada a un **auxiliar** (insumo): match determinístico contra el catálogo existente (por nombre/sinónimos), y para lo no reconocido una llamada a la IA que mapea a un auxiliar existente o propone uno nuevo (canónico) con naturaleza+unidad+cuenta. Más una **semilla por rubro** del catálogo inicial. El `auxiliar_id` de `expense_lineas` se rellena en el intake.

**Architecture:** Capa determinística primero (barata, exacta): normaliza la descripción y la matchea contra `auxiliares.nombre`/`sinonimos`. Lo no matcheado va en UNA llamada a Gemini (inyectable) que devuelve, por línea, el auxiliar (existente o nuevo). El orquestador `mapearLineas` resuelve cada línea a un `auxiliar_id` (crea auxiliares `sugerido` cuando hace falta y agrega la descripción cruda como sinónimo para futuros matches deterministas). El intake mapea las líneas ANTES de persistirlas. Si la IA falla, las líneas quedan con `auxiliar_id` null (no rompe). Semilla por rubro: IA genera un set inicial según el `giro` de la empresa (idempotente). Multi-tenant por `company_id`.

**Tech Stack:** Node/Express, Postgres/pg-mem, Jest. Gemini OpenAI-compat (inyectable, igual patrón que `match/componer.js`). Sin deps nuevas.

**Repo:** `C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA` (canónico, su propio git). Tests: `cd "...\HASH IA\gastos" && npx jest`. Commit con `git -c user.name="José Antonio Olguín" -c user.email="atikodigital@gmail.com"`. Confirmar `git -C "...\HASH IA" rev-parse --show-toplevel` ends in `HASH IA`.

**Depende de A1:** `auxiliares/repo.js` (createAuxiliar/listAuxiliares), `expenses/lineas-repo.js` (createLineas/getLineas), `domain/lineas.js`, intake con líneas.

---

## File Structure

**Crear:**
- `gastos/src/auxiliares/mapear.js` — `normalizarDescripcion` + `matchExistente` (puros) + `buildPromptMapeo`/`parseMapeo`/`componerMapeo` (IA) + `mapearLineas` (orquestador).
- `gastos/src/auxiliares/semilla.js` — `sembrarPorRubro` (IA, idempotente).
- Tests: `gastos/tests/auxiliares/normalizar.test.js`, `mapear-ia.test.js`, `mapear.test.js`, `semilla.test.js`.

**Modificar:**
- `gastos/src/auxiliares/repo.js` — `findMatch`, `addSinonimo`, `getById`.
- `gastos/src/db/migrate.js` — `ALTER TABLE companies ADD COLUMN IF NOT EXISTS giro text`.
- `gastos/src/companies/repo.js` — `getGiro`, `setGiro`.
- `gastos/src/expenses/intake.js` — mapear líneas (set `auxiliar_id`) antes de `createLineas`.
- Test: `gastos/tests/auxiliares/intake-auxiliar.test.js`.

---

## Task 1: Normalización + match determinístico (puros)

**Files:**
- Create: `gastos/src/auxiliares/mapear.js`
- Test: `gastos/tests/auxiliares/normalizar.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/auxiliares/normalizar.test.js
const { normalizarDescripcion, matchExistente } = require('../../src/auxiliares/mapear');

test('normalizarDescripcion baja, quita tildes, números, unidades y tamaños', () => {
  expect(normalizarDescripcion('Harina de Trigo 25kg')).toBe('harina de trigo');
  expect(normalizarDescripcion('HARINA 100 KILOS')).toBe('harina');
  expect(normalizarDescripcion('Levadura seca x3')).toBe('levadura seca');
});

test('matchExistente encuentra por nombre o por sinónimo (normalizado)', () => {
  const aux = [
    { id: 'a1', nombre: 'Harina', sinonimos: ['harina de trigo', 'harina 0000'] },
    { id: 'a2', nombre: 'Levadura', sinonimos: [] },
  ];
  expect(matchExistente('Harina de trigo 25kg', aux).id).toBe('a1');
  expect(matchExistente('HARINA 100 kilos', aux).id).toBe('a1'); // por nombre normalizado
  expect(matchExistente('Levadura seca', aux).id).toBe('a2');    // contiene "levadura"
  expect(matchExistente('Mantequilla', aux)).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/auxiliares/normalizar.test.js`
Expected: FAIL — Cannot find module.

- [ ] **Step 3: Write minimal implementation**

```javascript
// gastos/src/auxiliares/mapear.js
// Mapea líneas de factura a auxiliares (insumos). Capa determinística + IA.

// Normaliza una descripción a una "clave" comparable: minúsculas, sin tildes,
// sin números/unidades/tamaños/multiplicadores, espacios colapsados.
function normalizarDescripcion(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')      // tildes
    .replace(/\b\d+([.,]\d+)?\s*(kg|kgs|kilo|kilos|g|gr|grs|l|lt|lts|litro|litros|ml|cc|kwh|kw|m3|m2|un|und|unidad|unidades|cc|pack|caja|cajas|saco|sacos)\b/g, ' ') // cantidad+unidad
    .replace(/\bx\s*\d+\b/g, ' ')                          // multiplicador "x3"
    .replace(/\b\d+\b/g, ' ')                              // números sueltos
    .replace(/[^a-z0-9 ]/g, ' ')                           // símbolos
    .replace(/\s+/g, ' ')
    .trim();
}

// Busca un auxiliar existente cuyo nombre o sinónimo coincida con la descripción
// normalizada (igualdad o inclusión por tokens). Devuelve el auxiliar o null.
function matchExistente(descripcion, auxiliares) {
  const d = normalizarDescripcion(descripcion);
  if (!d) return null;
  for (const a of (auxiliares || [])) {
    const claves = [normalizarDescripcion(a.nombre), ...((a.sinonimos || []).map(normalizarDescripcion))].filter(Boolean);
    for (const k of claves) {
      if (!k) continue;
      if (d === k || d.includes(k) || k.includes(d)) return a;
    }
  }
  return null;
}

module.exports = { normalizarDescripcion, matchExistente };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/auxiliares/normalizar.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/auxiliares/mapear.js gastos/tests/auxiliares/normalizar.test.js
git commit -m "feat(varas-aux): normalizar descripción + match determinístico de auxiliar"
```

---

## Task 2: Repo de auxiliares — findMatch, addSinonimo, getById

**Files:**
- Modify: `gastos/src/auxiliares/repo.js`
- Test: `gastos/tests/auxiliares/repo.test.js` (extender)

- [ ] **Step 1: Write the failing test** (append al archivo)

```javascript
test('findMatch encuentra por nombre/sinónimo; addSinonimo agrega y persiste', async () => {
  const db = await makeDb();
  const a = await repo.createAuxiliar(db, COMPANY, { nombre: 'Harina', sinonimos: ['harina 0000'] });
  // match por nombre
  expect((await repo.findMatch(db, COMPANY, 'Harina de trigo 25kg')).id).toBe(a.id);
  // agrega sinónimo nuevo y vuelve a matchear por él
  await repo.addSinonimo(db, a.id, 'harina selecta');
  const got = await repo.getById(db, a.id);
  expect(got.sinonimos).toContain('harina selecta');
  expect((await repo.findMatch(db, COMPANY, 'HARINA SELECTA premium')).id).toBe(a.id);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/auxiliares/repo.test.js`
Expected: FAIL — `repo.findMatch is not a function`.

- [ ] **Step 3: Write minimal implementation** (append a `repo.js`, antes de `module.exports`; importar normalizar arriba)

Al tope del archivo: `const { matchExistente } = require('./mapear');`

```javascript
async function getById(db, id) {
  await ensureAuxiliaresTable(db);
  const r = await db.query(`SELECT ${COLS} FROM auxiliares WHERE id=$1`, [id]);
  return r.rows[0] || null;
}

async function findMatch(db, companyId, descripcion) {
  const lista = await listAuxiliares(db, companyId);
  return matchExistente(descripcion, lista);
}

async function addSinonimo(db, id, sinonimo) {
  const a = await getById(db, id);
  if (!a) return null;
  const s = String(sinonimo || '').trim();
  const set = new Set([...(Array.isArray(a.sinonimos) ? a.sinonimos : []), s].filter(Boolean));
  const arr = [...set];
  const r = await db.query(`UPDATE auxiliares SET sinonimos=$2::jsonb WHERE id=$1 RETURNING ${COLS}`, [id, JSON.stringify(arr)]);
  return r.rows[0] || null;
}
```

Actualizar `module.exports` para incluir `getById, findMatch, addSinonimo`.

> Nota: `repo.js` y `mapear.js` se requieren mutuamente (repo importa `matchExistente` de mapear; mapear NO importa repo en este task). Sin ciclo: mapear no requiere repo.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/auxiliares/repo.test.js`
Expected: PASS (los previos + el nuevo).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/auxiliares/repo.js gastos/tests/auxiliares/repo.test.js
git commit -m "feat(varas-aux): repo findMatch/addSinonimo/getById"
```

---

## Task 3: Capa IA del mapeo (`componerMapeo`)

**Files:**
- Modify: `gastos/src/auxiliares/mapear.js`
- Test: `gastos/tests/auxiliares/mapear-ia.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/auxiliares/mapear-ia.test.js
const { buildPromptMapeo, parseMapeo, componerMapeo } = require('../../src/auxiliares/mapear');

test('buildPromptMapeo incluye líneas, catálogo y giro, y pide JSON por índice', () => {
  const p = buildPromptMapeo({
    lineas: [{ idx: 0, descripcion: 'Mantequilla sin sal 1kg' }],
    auxiliares: [{ nombre: 'Harina' }],
    giro: 'pizzería',
  });
  expect(p).toMatch(/pizzer/i);
  expect(p).toMatch(/Mantequilla/);
  expect(p).toMatch(/Harina/);
  expect(p).toMatch(/idx/);
});

test('parseMapeo tolera fences y normaliza', () => {
  const out = parseMapeo('```json\n{"mapeos":[{"idx":0,"auxiliar":"Mantequilla","existe":false,"naturaleza":"insumo","unidad":"kg"}]}\n```');
  expect(out.length).toBe(1);
  expect(out[0].auxiliar).toBe('Mantequilla');
  expect(out[0].existe).toBe(false);
});

test('componerMapeo usa el http inyectado', async () => {
  const fakeHttp = { post: async () => ({ data: { choices: [{ message: { content: '{"mapeos":[{"idx":0,"auxiliar":"Mantequilla","existe":false,"naturaleza":"insumo","unidad":"kg"}]}' } }] } }) };
  const r = await componerMapeo({ lineas: [{ idx: 0, descripcion: 'Mantequilla' }], auxiliares: [], giro: '' }, { http: fakeHttp, apiKey: 'x' });
  expect(r[0].auxiliar).toBe('Mantequilla');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/auxiliares/mapear-ia.test.js`
Expected: FAIL — funciones no existen.

- [ ] **Step 3: Write minimal implementation** (append a `mapear.js`)

```javascript
const axios = require('axios');
const BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

function buildPromptMapeo({ lineas = [], auxiliares = [], giro = '' } = {}) {
  const cat = auxiliares.map((a) => a.nombre).filter(Boolean);
  return [
    'Eres el clasificador de insumos de una contabilidad analítica.',
    giro ? ('El rubro del negocio es: ' + giro + '.') : '',
    'Tienes un CATÁLOGO de auxiliares (insumos) existentes: ' + JSON.stringify(cat) + '.',
    'Para cada LÍNEA de factura, asígnala a un auxiliar del catálogo si corresponde (mismo insumo, agrupando tamaños/marcas), o propone uno NUEVO con un nombre CANÓNICO y corto (ej. "Harina", "Mantequilla", "Electricidad").',
    'Líneas: ' + JSON.stringify(lineas) + '.',
    'Responde SOLO JSON { "mapeos": [ { "idx": <n>, "auxiliar": "<nombre canónico>", "existe": true|false, "naturaleza": "insumo|servicio|energia|otro", "unidad": "kg|g|L|ml|kWh|m3|m2|un|hora|fijo", "cuentaClave": "<opcional>" } ] }.',
    'No inventes insumos que no estén en la línea. Un nombre canónico por insumo.',
  ].filter(Boolean).join('\n');
}

function parseMapeo(content) {
  let obj = {};
  const s = String(content || '');
  const fenced = s.replace(/```json/gi, '```').split('```');
  for (const c of [s, ...fenced]) {
    const a = c.indexOf('{'); const b = c.lastIndexOf('}');
    if (a >= 0 && b > a) { try { obj = JSON.parse(c.slice(a, b + 1)); break; } catch { /* sigue */ } }
  }
  const arr = Array.isArray(obj.mapeos) ? obj.mapeos : [];
  return arr.map((m) => ({
    idx: Number(m.idx),
    auxiliar: String(m.auxiliar || '').trim(),
    existe: !!m.existe,
    naturaleza: m.naturaleza || 'insumo',
    unidad: m.unidad || 'un',
    cuentaClave: m.cuentaClave || null,
  })).filter((m) => Number.isFinite(m.idx) && m.auxiliar);
}

async function componerMapeo(payload, { http = axios, apiKey = process.env.GEMINI_API_KEY, model } = {}) {
  const m = model || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  const body = { model: m, messages: [{ role: 'user', content: buildPromptMapeo(payload) }], temperature: 0.1 };
  const res = await http.post(BASE, body, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 30000 });
  const content = res && res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message && res.data.choices[0].message.content || '';
  return parseMapeo(content);
}
```

Actualizar `module.exports` para incluir `buildPromptMapeo, parseMapeo, componerMapeo`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/auxiliares/mapear-ia.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/auxiliares/mapear.js gastos/tests/auxiliares/mapear-ia.test.js
git commit -m "feat(varas-aux): capa IA de mapeo línea→auxiliar (inyectable)"
```

---

## Task 4: Orquestador `mapearLineas`

**Files:**
- Modify: `gastos/src/auxiliares/mapear.js`
- Test: `gastos/tests/auxiliares/mapear.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/auxiliares/mapear.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const repo = require('../../src/auxiliares/repo');
const { mapearLineas } = require('../../src/auxiliares/mapear');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';

test('mapea por match determinístico al auxiliar existente (sin IA)', async () => {
  const db = await makeDb();
  const harina = await repo.createAuxiliar(db, COMPANY, { nombre: 'Harina', unidad_principal: 'kg' });
  const lineas = [{ descripcion: 'Harina de trigo 25kg', cantidad: 2, unidad: 'kg', total: 11900 }];
  const componer = async () => { throw new Error('no debería llamar IA'); };
  const out = await mapearLineas(db, COMPANY, lineas, { componer });
  expect(out[0].auxiliar_id).toBe(harina.id);
});

test('línea desconocida → IA propone auxiliar nuevo (sugerido) y se asigna', async () => {
  const db = await makeDb();
  const lineas = [{ descripcion: 'Mantequilla sin sal 1kg', cantidad: 1, unidad: 'kg', total: 5950 }];
  const componer = async () => ([{ idx: 0, auxiliar: 'Mantequilla', existe: false, naturaleza: 'insumo', unidad: 'kg', cuentaClave: null }]);
  const out = await mapearLineas(db, COMPANY, lineas, { componer });
  expect(out[0].auxiliar_id).toBeTruthy();
  const lista = await repo.listAuxiliares(db, COMPANY);
  expect(lista.find((a) => a.nombre === 'Mantequilla')).toBeTruthy();
  // la descripción cruda quedó como sinónimo para futuros matches
  const aux = await repo.getById(db, out[0].auxiliar_id);
  expect(aux.sinonimos.join(' ').toLowerCase()).toContain('mantequilla');
});

test('si la IA falla, las líneas no matcheadas quedan con auxiliar_id null (no rompe)', async () => {
  const db = await makeDb();
  const lineas = [{ descripcion: 'Algo raro', cantidad: 1, unidad: 'un', total: 1000 }];
  const componer = async () => { throw new Error('ia_down'); };
  const out = await mapearLineas(db, COMPANY, lineas, { componer });
  expect(out[0].auxiliar_id).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/auxiliares/mapear.test.js`
Expected: FAIL — `mapearLineas is not a function`.

- [ ] **Step 3: Write minimal implementation** (append a `mapear.js`; importa repo y cuentas)

Al tope (después de los require existentes): `const auxRepo = require('./repo'); const { getCuentaId } = require('../contabilidad/cuentas');`

```javascript
// Devuelve las líneas con `auxiliar_id` asignado. Crea auxiliares 'sugerido' cuando hace falta.
// `componer` inyectable (default componerMapeo). Si la IA falla, las no matcheadas quedan null.
async function mapearLineas(db, companyId, lineas, { giro = '', componer } = {}) {
  const _componer = componer || ((payload) => componerMapeo(payload, {}));
  const out = (lineas || []).map((l) => ({ ...l, auxiliar_id: null }));

  // 1) Match determinístico contra el catálogo existente.
  const pendientes = [];
  for (let i = 0; i < out.length; i++) {
    const hit = await auxRepo.findMatch(db, companyId, out[i].descripcion);
    if (hit) { out[i].auxiliar_id = hit.id; }
    else { pendientes.push({ idx: i, descripcion: out[i].descripcion }); }
  }
  if (!pendientes.length) return out;

  // 2) IA para lo no reconocido (una llamada). Si falla, quedan null.
  let mapeos = [];
  try {
    const auxiliares = await auxRepo.listAuxiliares(db, companyId);
    mapeos = await _componer({ lineas: pendientes, auxiliares, giro });
  } catch (e) { return out; }

  for (const m of mapeos) {
    const i = m.idx;
    if (i == null || !out[i]) continue;
    // ¿existe ya por nombre? (la IA puede decir "existe" o proponer uno que ya está)
    let aux = await auxRepo.findMatch(db, companyId, m.auxiliar);
    if (!aux) {
      let cuenta_id = null;
      if (m.cuentaClave) { try { cuenta_id = await getCuentaId(db, companyId, m.cuentaClave); } catch (e) { cuenta_id = null; } }
      aux = await auxRepo.createAuxiliar(db, companyId, {
        nombre: m.auxiliar, naturaleza: m.naturaleza, unidad_principal: m.unidad, cuenta_id, estado: 'sugerido',
        sinonimos: [out[i].descripcion],
      });
    } else {
      // agrega la descripción cruda como sinónimo para futuros matches deterministas
      try { await auxRepo.addSinonimo(db, aux.id, out[i].descripcion); } catch (e) { /* noop */ }
    }
    out[i].auxiliar_id = aux.id;
  }
  return out;
}
```

Actualizar `module.exports` para incluir `mapearLineas`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/auxiliares/mapear.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/auxiliares/mapear.js gastos/tests/auxiliares/mapear.test.js
git commit -m "feat(varas-aux): orquestador mapearLineas (det + IA, crea sugeridos)"
```

---

## Task 5: Semilla por rubro + giro de la empresa

**Files:**
- Modify: `gastos/src/db/migrate.js` (columna `giro`)
- Modify: `gastos/src/companies/repo.js` (`getGiro`, `setGiro`)
- Create: `gastos/src/auxiliares/semilla.js`
- Test: `gastos/tests/auxiliares/semilla.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/auxiliares/semilla.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const repo = require('../../src/auxiliares/repo');
const { sembrarPorRubro } = require('../../src/auxiliares/semilla');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';

test('sembrarPorRubro crea los auxiliares que sugiere la IA, idempotente', async () => {
  const db = await makeDb();
  const componer = async () => ([
    { nombre: 'Harina', naturaleza: 'insumo', unidad: 'kg' },
    { nombre: 'Levadura', naturaleza: 'insumo', unidad: 'un' },
    { nombre: 'Electricidad', naturaleza: 'energia', unidad: 'kWh' },
  ]);
  const n = await sembrarPorRubro(db, COMPANY, 'pizzería', { componer });
  expect(n).toBe(3);
  const lista = await repo.listAuxiliares(db, COMPANY);
  expect(lista.map((a) => a.nombre).sort()).toEqual(['Electricidad', 'Harina', 'Levadura']);
  // idempotente: 2ª vez no duplica
  const n2 = await sembrarPorRubro(db, COMPANY, 'pizzería', { componer });
  expect(n2).toBe(0);
  expect((await repo.listAuxiliares(db, COMPANY)).length).toBe(3);
});

test('si la IA falla, sembrarPorRubro no rompe y devuelve 0', async () => {
  const db = await makeDb();
  const componer = async () => { throw new Error('ia_down'); };
  const n = await sembrarPorRubro(db, COMPANY, 'x', { componer });
  expect(n).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/auxiliares/semilla.test.js`
Expected: FAIL — Cannot find module.

- [ ] **Step 3: Write minimal implementation**

(a) En `gastos/src/db/migrate.js`, agregar a `V2_COLUMNS` (o a un arreglo de ALTERs tolerantes) la línea:
```javascript
  "ALTER TABLE companies ADD COLUMN IF NOT EXISTS giro text",
```
(b) En `gastos/src/companies/repo.js`, agregar y exportar:
```javascript
async function getGiro(db, companyId) {
  const r = await db.query('SELECT giro FROM companies WHERE id=$1', [companyId]);
  return r.rows[0] ? (r.rows[0].giro || '') : '';
}
async function setGiro(db, companyId, giro) {
  await db.query('UPDATE companies SET giro=$2 WHERE id=$1', [companyId, String(giro || '').trim()]);
  return true;
}
```
(c) Crear `gastos/src/auxiliares/semilla.js`:
```javascript
// Semilla de auxiliares por rubro. La IA propone el set inicial según el giro.
const axios = require('axios');
const auxRepo = require('./repo');
const { matchExistente } = require('./mapear');
const BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

function buildPromptSemilla(giro) {
  return [
    'Eres un contador que arma el catálogo inicial de insumos (auxiliares) de un negocio.',
    'Rubro: ' + (giro || 'general') + '.',
    'Lista entre 8 y 20 insumos/servicios típicos del rubro, con nombre canónico corto.',
    'Responde SOLO JSON { "auxiliares": [ { "nombre": "Harina", "naturaleza": "insumo|servicio|energia|otro", "unidad": "kg|L|kWh|m3|un|hora|fijo" } ] }.',
  ].join('\n');
}

function parseSemilla(content) {
  let obj = {};
  const s = String(content || '');
  const fenced = s.replace(/```json/gi, '```').split('```');
  for (const c of [s, ...fenced]) {
    const a = c.indexOf('{'); const b = c.lastIndexOf('}');
    if (a >= 0 && b > a) { try { obj = JSON.parse(c.slice(a, b + 1)); break; } catch { /* sigue */ } }
  }
  const arr = Array.isArray(obj.auxiliares) ? obj.auxiliares : [];
  return arr.map((x) => ({ nombre: String(x.nombre || '').trim(), naturaleza: x.naturaleza || 'insumo', unidad: x.unidad || 'un' })).filter((x) => x.nombre);
}

async function _componerSemilla(giro, { http = axios, apiKey = process.env.GEMINI_API_KEY, model } = {}) {
  const m = model || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  const body = { model: m, messages: [{ role: 'user', content: buildPromptSemilla(giro) }], temperature: 0.2 };
  const res = await http.post(BASE, body, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 30000 });
  const content = res && res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message && res.data.choices[0].message.content || '';
  return parseSemilla(content);
}

// Crea los auxiliares sugeridos por la IA para el rubro. Idempotente (no duplica por nombre).
async function sembrarPorRubro(db, companyId, giro, { componer } = {}) {
  const _componer = componer || ((g) => _componerSemilla(g, {}));
  let propuestos = [];
  try { propuestos = await _componer(giro); } catch (e) { return 0; }
  const existentes = await auxRepo.listAuxiliares(db, companyId);
  let creados = 0;
  for (const p of propuestos) {
    if (matchExistente(p.nombre, existentes)) continue;
    await auxRepo.createAuxiliar(db, companyId, { nombre: p.nombre, naturaleza: p.naturaleza, unidad_principal: p.unidad, estado: 'sugerido' });
    existentes.push({ nombre: p.nombre, sinonimos: [] });
    creados++;
  }
  return creados;
}

module.exports = { sembrarPorRubro, buildPromptSemilla, parseSemilla };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/auxiliares/semilla.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/db/migrate.js gastos/src/companies/repo.js gastos/src/auxiliares/semilla.js gastos/tests/auxiliares/semilla.test.js
git commit -m "feat(varas-aux): semilla de auxiliares por rubro + giro de la empresa"
```

---

## Task 6: Enganchar el mapeo en el intake + cierre

**Files:**
- Modify: `gastos/src/expenses/intake.js`
- Test: `gastos/tests/auxiliares/intake-auxiliar.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/auxiliares/intake-auxiliar.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { intakeFromImage } = require('../../src/expenses/intake');
const lineasRepo = require('../../src/expenses/lineas-repo');
const auxRepo = require('../../src/auxiliares/repo');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await db.query("INSERT INTO companies (id, nombre) VALUES ($1, 'Test')", [COMPANY]);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';

test('el intake mapea las líneas a auxiliares (auxiliar_id queda seteado)', async () => {
  const db = await makeDb();
  await auxRepo.createAuxiliar(db, COMPANY, { nombre: 'Harina', unidad_principal: 'kg' });
  const extract = async () => ({
    tipo: 'gasto', proveedor: 'Distribuidora', fecha: '2026-06-10', neto: 10000, iva: 1900, total: 11900,
    categoria: 'Mercadería e insumos del giro',
    lineas: [{ descripcion: 'Harina de trigo 25kg', cantidad: 2, unidad: 'kg', neto: 10000, iva: 1900, total: 11900 }],
  });
  const mapear = async (_db, _company, lineas) => lineas.map((l) => ({ ...l, auxiliar_id: 'forzado' })); // no usado: ver nota
  const { expense } = await intakeFromImage({
    db, companyId: COMPANY, employeeId: null, imageBuffer: Buffer.from('x'), mimeType: 'image/jpeg',
    canal: 'app', extract, storeImage: () => null,
    // mapeo real (det) sin IA: la línea matchea "Harina" existente
    mapearAux: async (lineas) => {
      const { mapearLineas } = require('../../src/auxiliares/mapear');
      return mapearLineas(db, COMPANY, lineas, { componer: async () => { throw new Error('no IA'); } });
    },
  });
  const lineas = await lineasRepo.getLineas(db, expense.id);
  expect(lineas[0].auxiliar_id).toBeTruthy();
});
```

> Nota: el intake debe aceptar un `mapearAux` inyectable (default: usa `mapearLineas` real con `getGiro`). Ajustar el test a la firma que implementes; lo esencial: tras el intake, la línea tiene `auxiliar_id` no nulo.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/auxiliares/intake-auxiliar.test.js`
Expected: FAIL — `auxiliar_id` null.

- [ ] **Step 3: Write minimal implementation**

En `gastos/src/expenses/intake.js`:
- Importar arriba: `const { mapearLineas } = require('../auxiliares/mapear'); const { getGiro } = require('../companies/repo');`
- Agregar `mapearAux` a los parámetros desestructurados de `intakeFromImage({ ... , mapearAux })`.
- Reemplazar el bloque de persistencia de líneas (de A1) por uno que mapea primero:
```javascript
  if (expense && Array.isArray(extracted.lineas) && extracted.lineas.length) {
    let lineas = extracted.lineas;
    try {
      const _map = mapearAux || (async (ls) => {
        let giro = ''; try { giro = await getGiro(db, companyId); } catch (e) { giro = ''; }
        return mapearLineas(db, companyId, ls, { giro });
      });
      lineas = await _map(lineas);
    } catch (e) { lineas = extracted.lineas; }
    try { await createLineas(db, expense.id, lineas); } catch (e) { /* noop */ }
  }
```
(`createLineas` ya guarda `auxiliar_id` si viene en la línea — verificar en `lineas-repo.js` que toma `l.auxiliar_id`; sí lo hace.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/auxiliares/intake-auxiliar.test.js`
Expected: PASS.

- [ ] **Step 5: Suite completa + commit**

Run: `cd gastos && npx jest`
Expected: PASS — todo verde, sin regresión (intake/expenses/whatsapp incluidos).

```bash
git add gastos/src/expenses/intake.js gastos/tests/auxiliares/intake-auxiliar.test.js
git commit -m "feat(varas-aux): el intake mapea las lineas a auxiliares"
```

---

## Notas de cierre A2

- **Costo:** 1 llamada IA por factura (solo para líneas no reconocidas por match determinístico). El match determinístico cubre lo repetido (mismos insumos), así que con el tiempo casi no llama IA.
- **Seguro:** si la IA falla, `auxiliar_id` queda null y el alta del gasto no se rompe.
- **Pendiente A3:** desglose confirmable en la app (ConfirmScreen muestra líneas→auxiliar→cantidad, permite corregir/reasignar) + CRUD de auxiliares en el panel (renombrar/fusionar/borrar/recolgar a cuenta) + setear el `giro` de la empresa desde el panel + botón "sembrar auxiliares por rubro".
- **Pendiente A4:** reportes de consumo/evolución por auxiliar + tools conversacionales de VARAS.
- **Deploy:** backend puro, migración aditiva (columna `giro` + tablas de A1). Desplegar con `node deploy-gastos-wt.js` desde `HASH IA\` (idealmente junto con A3 para valor visible). Sin APK (no hay UI nueva aún).
- ⚠️ Trabajar SOLO en `HASH IA\`.
