# KALY Proactividad (M5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que KALY, al saludar, mencione SOLA una señal útil derivada del resumen vivo del negocio + la memoria (ej. "este mes vas con saldo negativo" o "no me has contado tu horario"), con un switch on/off para el dueño.

**Architecture:** Backend puro `gastos/src/agent/senales.js` (`construirSenales(context)`) que `buildAgentContext` calcula e inyecta en el contexto (solo si la proactividad está ON). La app (`prompt.js`) abre el saludo con `senales[0]`. El switch vive en `agent_prefs` (jsonb, sin migración) con un toggle en la app. Sin pgvector, sin LLM extra.

**Tech Stack:** Node + Express + Postgres (jest + pg-mem) en `gastos/`. React 18 + Capacitor + Vite (jest + RTL) en `gastos-app/`.

**⚠️ Reglas del repo (Antigravity trabaja `master` en paralelo):**
- Todo en `C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\` (NO el worktree).
- Antes de cada commit: `git rev-parse --abbrev-ref HEAD` = `master`; `git rev-parse --show-toplevel` termina en `HASH IA`.
- SIEMPRE `git add <archivos específicos>` — NUNCA `git add -A`/`.`/`-u`.
- **No tocar** `gastos/public/panel/index.html` (cambio sin commitear de Antigravity).
- Tests backend desde `gastos/`, app desde `gastos-app/`.

---

### Task 1: `construirSenales` (puro)

Calcula las señales proactivas priorizadas a partir del contexto (resumen + memorias). Plata primero, luego huecos de memoria. Función pura, sin DB.

**Files:**
- Create: `gastos/src/agent/senales.js`
- Test: `gastos/tests/agent/senales.test.js`

- [ ] **Step 1: Write the failing test**

Crea `gastos/tests/agent/senales.test.js`:

```js
const { construirSenales } = require('../../src/agent/senales');

const MEM_COMPLETA = [
  { contenido: 'Atiende de lunes a sábado de 9 a 18' },
  { contenido: 'Queda en Av. Siempre Viva 742' },
  { contenido: 'Acepta efectivo y transferencia' },
];

describe('construirSenales', () => {
  test('saldo negativo → primera señal es la de saldo', () => {
    const s = construirSenales({ resumen: { saldo: -5000, pendientesPago: 0, countGastos: 2, countIngresos: 1 }, memorias: MEM_COMPLETA });
    expect(s[0]).toMatch(/saldo negativo/i);
  });

  test('gastos pendientes de pago → señal con el número', () => {
    const s = construirSenales({ resumen: { saldo: 1000, pendientesPago: 3, countGastos: 5, countIngresos: 2 }, memorias: MEM_COMPLETA });
    expect(s.join(' ')).toMatch(/3 gastos confirmados sin marcar como pagados/i);
  });

  test('1 pendiente → singular', () => {
    const s = construirSenales({ resumen: { saldo: 1000, pendientesPago: 1, countGastos: 5, countIngresos: 2 }, memorias: MEM_COMPLETA });
    expect(s.join(' ')).toMatch(/1 gasto confirmado sin marcar como pagado\b/i);
  });

  test('mes sin movimientos → señal de "aún no registras"', () => {
    const s = construirSenales({ resumen: { saldo: 0, pendientesPago: 0, countGastos: 0, countIngresos: 0 }, memorias: MEM_COMPLETA });
    expect(s.join(' ')).toMatch(/aún no registras movimientos/i);
  });

  test('huecos de memoria: detecta falta de horario/dirección/pagos', () => {
    const s = construirSenales({ resumen: { saldo: 1000, pendientesPago: 0, countGastos: 3, countIngresos: 1 }, memorias: [{ contenido: 'Vende empanadas' }] });
    const txt = s.join(' | ');
    expect(txt).toMatch(/horario/i);
    expect(txt).toMatch(/dónde queda/i);
    expect(txt).toMatch(/formas de pago/i);
  });

  test('memoria con horario presente → NO sugiere horario', () => {
    const s = construirSenales({ resumen: { saldo: 1000, pendientesPago: 0, countGastos: 3, countIngresos: 1 }, memorias: [{ contenido: 'Abre de lunes a viernes' }, { contenido: 'Queda en calle Falsa 123' }, { contenido: 'Paga con tarjeta' }] });
    expect(s.join(' ')).not.toMatch(/horario/i);
  });

  test('memoria vacía → una sola señal "sé poco" (no las 3 de huecos)', () => {
    const s = construirSenales({ resumen: { saldo: 1000, pendientesPago: 0, countGastos: 3, countIngresos: 1 }, memorias: [] });
    expect(s.join(' ')).toMatch(/sé poco de tu negocio/i);
    expect(s.join(' ')).not.toMatch(/horario de atención/i);
  });

  test('negocio sano + memoria completa → []', () => {
    const s = construirSenales({ resumen: { saldo: 5000, pendientesPago: 0, countGastos: 4, countIngresos: 3 }, memorias: MEM_COMPLETA });
    expect(s).toEqual([]);
  });

  test('contexto vacío no rompe', () => {
    expect(Array.isArray(construirSenales())).toBe(true);
    expect(Array.isArray(construirSenales({}))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/senales.test.js 2>&1 | tail -20`
Expected: FAIL — `Cannot find module '../../src/agent/senales'`.

- [ ] **Step 3: Write minimal implementation**

Crea `gastos/src/agent/senales.js`:

```js
// Señales proactivas (M5): a partir del contexto (resumen + memorias) arma
// frases cortas y priorizadas que KALY puede mencionar al saludar. Función pura.
function tieneTema(memorias, re) {
  return (Array.isArray(memorias) ? memorias : []).some((m) => m && re.test(String(m.contenido || '')));
}

function construirSenales(context = {}) {
  const resumen = context.resumen || {};
  const memorias = Array.isArray(context.memorias) ? context.memorias : [];
  const out = [];

  // 1) Plata (prioridad alta)
  if (Number(resumen.saldo) < 0) {
    out.push('este mes vas con saldo negativo (gastaste más de lo que ingresó)');
  }
  if (Number(resumen.pendientesPago) > 0) {
    const n = Number(resumen.pendientesPago);
    out.push(`tienes ${n} gasto${n === 1 ? '' : 's'} confirmado${n === 1 ? '' : 's'} sin marcar como pagado${n === 1 ? '' : 's'}`);
  }
  if (Number(resumen.countGastos || 0) === 0 && Number(resumen.countIngresos || 0) === 0) {
    out.push('este mes aún no registras movimientos');
  }

  // 2) Huecos de memoria
  if (memorias.length === 0) {
    out.push('todavía sé poco de tu negocio, cuéntame algo para ayudarte mejor');
  } else {
    if (!tieneTema(memorias, /horari|abre|cierra|atiend|lunes|s[áa]bado|domingo/i)) out.push('no me has contado tu horario de atención');
    if (!tieneTema(memorias, /direcci|ubica|queda en|local en|calle|avenida/i)) out.push('no sé bien dónde queda tu negocio');
    if (!tieneTema(memorias, /pago|transfer|efectivo|tarjeta|débito|crédito/i)) out.push('no sé qué formas de pago aceptas');
  }

  return out;
}

module.exports = { construirSenales };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/senales.test.js 2>&1 | tail -20`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD   # master
git add gastos/src/agent/senales.js gastos/tests/agent/senales.test.js
git commit -m "feat(kaly-m5): construirSenales (señales proactivas priorizadas, puro)"
```

---

### Task 2: `buildAgentContext` inyecta señales + `setAgentPrefs` acepta `proactividad`

El contexto suma `senales` (solo si proactividad ON) y `proactividad`. `setAgentPrefs` guarda el flag en `agent_prefs` (jsonb, sin migración).

**Files:**
- Modify: `gastos/src/agent/context.js`
- Modify: `gastos/src/companies/repo.js` (función `setAgentPrefs`)
- Test: `gastos/tests/agent/context-senales.test.js` (nuevo), `gastos/tests/companies/repo-prefs.test.js` (nuevo o el que exista para prefs)

- [ ] **Step 1: Write the failing tests**

Crea `gastos/tests/agent/context-senales.test.js`. Usa el patrón pg-mem + `migrate` de `gastos/tests/agent/context-memory.test.js` (ábrelo para copiar el helper exacto de `freshDb`, cómo crea company+employee, e inserta expenses). Estructura:

```js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { buildAgentContext } = require('../../src/agent/context');
const { setAgentPrefs } = require('../../src/companies/repo');

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
  const e = await db.query("INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'J','juan','h') RETURNING id", [c.rows[0].id]);
  return { companyId: c.rows[0].id, employeeId: e.rows[0].id };
}

describe('buildAgentContext + señales', () => {
  test('incluye senales (array) y proactividad=true por defecto', async () => {
    const db = await freshDb();
    const { companyId, employeeId } = await seed(db);
    const ctx = await buildAgentContext(db, { companyId, employeeId });
    expect(Array.isArray(ctx.senales)).toBe(true);
    expect(ctx.proactividad).toBe(true);
    // empresa nueva sin memoria → debe sugerir algo (memoria vacía)
    expect(ctx.senales.length).toBeGreaterThan(0);
  });

  test('proactividad=false → senales vacías y flag false', async () => {
    const db = await freshDb();
    const { companyId, employeeId } = await seed(db);
    await setAgentPrefs(db, employeeId, { proactividad: false });
    const ctx = await buildAgentContext(db, { companyId, employeeId });
    expect(ctx.senales).toEqual([]);
    expect(ctx.proactividad).toBe(false);
  });
});
```

Crea `gastos/tests/companies/repo-prefs.test.js` (mismo `freshDb`; o agrega el caso al test de prefs existente si lo hay — busca con `grep -rl setAgentPrefs gastos/tests`):

```js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { setAgentPrefs, getAgentPrefs } = require('../../src/companies/repo');

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

test('setAgentPrefs guarda proactividad boolean', async () => {
  const db = await freshDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const e = await db.query("INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'J','juan','h') RETURNING id", [c.rows[0].id]);
  const id = e.rows[0].id;
  await setAgentPrefs(db, id, { proactividad: false });
  expect((await getAgentPrefs(db, id)).proactividad).toBe(false);
  await setAgentPrefs(db, id, { proactividad: true });
  expect((await getAgentPrefs(db, id)).proactividad).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/context-senales.test.js tests/companies/repo-prefs.test.js 2>&1 | tail -20`
Expected: FAIL — `ctx.senales` undefined / `proactividad` not stored.

- [ ] **Step 3: Implement**

(a) En `gastos/src/agent/context.js`:
- Agrega el require arriba (junto a `const { listMemorias } = require('./memory');`):
```js
const { construirSenales } = require('./senales');
```
- En `buildAgentContext`, cambia el `return { ... }` final para construir el contexto, calcular proactividad y añadir señales. Reemplaza el `return {...}` por:
```js
  const proactividad = prefs.proactividad !== false;
  const ctx = {
    nombre: prefs.nombre || '',
    trato: prefs.trato || '',
    onboarded: Boolean(prefs.onboarded_at),
    saludoHora: saludoHora(now),
    empresaNombre: (company && company.nombre) || '',
    resumen: { ...s, pendientesPago: pend.rows[0].n },
    memorias,
    persona: (profile && profile.kaly_persona) || {},
    proactividad,
  };
  ctx.senales = proactividad ? construirSenales(ctx) : [];
  return ctx;
```

(b) En `gastos/src/companies/repo.js`, dentro de `setAgentPrefs`, agrega esta línea junto a los otros `if (patch.X !== undefined)` (antes del `UPDATE`):
```js
  if (patch.proactividad !== undefined) next.proactividad = Boolean(patch.proactividad);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/context-senales.test.js tests/companies/repo-prefs.test.js tests/agent/context-memory.test.js 2>&1 | tail -20`
Expected: PASS (incluye el test de context-memory existente, que no debe romperse).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD   # master
git add gastos/src/agent/context.js gastos/src/companies/repo.js gastos/tests/agent/context-senales.test.js gastos/tests/companies/repo-prefs.test.js
git commit -m "feat(kaly-m5): buildAgentContext inyecta señales + setAgentPrefs.proactividad"
```

---

### Task 3: `GET /api/app/agent/prefs`

El toggle de la app necesita leer el estado actual de las prefs. Agrega el GET (el PATCH ya existe).

**Files:**
- Modify: `gastos/src/app/router.js` (junto al `router.patch('/agent/prefs', ...)` ~línea 256)
- Test: `gastos/tests/agent/prefs-route.test.js` (nuevo)

- [ ] **Step 1: Write the failing test**

Crea `gastos/tests/agent/prefs-route.test.js` (patrón de montaje idéntico a `gastos/tests/agent/memoria-routes.test.js`):

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

describe('GET /api/app/agent/prefs', () => {
  test('401 sin token', async () => {
    const db = await freshDb(); await seed(db);
    await request(app(db)).get('/api/app/agent/prefs').expect(401);
  });

  test('devuelve las prefs (incl. proactividad tras PATCH)', async () => {
    const db = await freshDb(); await seed(db); const a = app(db);
    const t = await token(a);
    await request(a).patch('/api/app/agent/prefs').set('Authorization', `Bearer ${t}`).send({ proactividad: false }).expect(200);
    const res = await request(a).get('/api/app/agent/prefs').set('Authorization', `Bearer ${t}`).expect(200);
    expect(res.body.proactividad).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/prefs-route.test.js 2>&1 | tail -20`
Expected: FAIL — el GET devuelve 404 (no existe).

- [ ] **Step 3: Implement**

En `gastos/src/app/router.js`, justo ANTES del `router.patch('/agent/prefs', ...)` (línea ~256), agrega:

```js
  router.get('/agent/prefs', async (req, res) => {
    return res.json(await getAgentPrefs(db, req.auth.employeeId));
  });
```

`getAgentPrefs` ya está importado al tope del archivo (línea 2: `const { getEmployeeByUsuario, getAgentPrefs, setAgentPrefs, ... } = require('../companies/repo');`). Verifícalo antes de implementar; si no estuviera, agrégalo a esa destructuración.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/agent/prefs-route.test.js 2>&1 | tail -20`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD   # master
git add gastos/src/app/router.js gastos/tests/agent/prefs-route.test.js
git commit -m "feat(kaly-m5): GET /api/app/agent/prefs (lee prefs para el toggle)"
```

---

### Task 4: App `prompt.js` — saludo proactivo

`instruccionInicial('saludo')` abre con `senales[0]` si existe; `buildSystemPrompt` agrega un bloque corto recordando mencionar solo una. Los demás motivos NO cambian.

**Files:**
- Modify: `gastos-app/src/gastos/kaly/prompt.js`
- Test: `gastos-app/tests/gastos/kaly-prompt.test.js`

- [ ] **Step 1: Write the failing tests**

Agrega al final de `gastos-app/tests/gastos/kaly-prompt.test.js` (revisa cómo importa `instruccionInicial`/`buildSystemPrompt` arriba del archivo y sigue ese estilo):

```js
describe('M5 saludo proactivo', () => {
  test('instruccionInicial saludo con señal la menciona', () => {
    const txt = instruccionInicial({ saludoHora: 'dia', nombre: 'José', trato: 'señor', senales: ['este mes vas con saldo negativo'] }, 'saludo');
    expect(txt).toMatch(/saldo negativo/i);
  });

  test('instruccionInicial saludo sin señales → saludo genérico (sin inventar)', () => {
    const txt = instruccionInicial({ saludoHora: 'dia', nombre: 'José', trato: 'señor', senales: [] }, 'saludo');
    expect(txt).toMatch(/en qué trabajaremos hoy|Necesita ayuda/i);
    expect(txt).not.toMatch(/saldo negativo/i);
  });

  test('instruccionInicial onboarding NO cambia con señales', () => {
    const txt = instruccionInicial({ senales: ['lo que sea'] }, 'onboarding');
    expect(txt).toMatch(/onboarding completo/i);
    expect(txt).not.toMatch(/lo que sea/i);
  });

  test('buildSystemPrompt incluye bloque Saludo proactivo cuando hay señales', () => {
    const p = buildSystemPrompt({ senales: ['no me has contado tu horario de atención'], memorias: [], resumen: {} });
    expect(p).toMatch(/Saludo proactivo/i);
    expect(p).toMatch(/horario de atención/i);
  });

  test('buildSystemPrompt omite el bloque sin señales', () => {
    const p = buildSystemPrompt({ senales: [], memorias: [], resumen: {} });
    expect(p).not.toMatch(/Saludo proactivo/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest tests/gastos/kaly-prompt.test.js -t "proactivo" 2>&1 | tail -20`
Expected: FAIL — el saludo no menciona la señal / no hay bloque "Saludo proactivo".

- [ ] **Step 3: Implement**

En `gastos-app/src/gastos/kaly/prompt.js`:

(a) Agrega un helper `bloqueSenales` junto a `bloqueMemorias` (cerca de la línea 12):
```js
function bloqueSenales(senales) {
  const arr = (Array.isArray(senales) ? senales : []).filter(Boolean);
  if (!arr.length) return '';
  return '\n## Saludo proactivo\nAl saludar, abre mencionando de forma breve y natural SOLO esto (una sola cosa, en tu tono, sin agobiar): "' + arr[0] + '". Luego ofrece ayuda.\n';
}
```

(b) En `buildSystemPrompt`, agrega `senales = []` a la destructuración de `context`:
```js
  const {
    nombre = '',
    trato = '',
    empresaNombre = '',
    resumen = {},
    memorias = [],
    persona = {},
    senales = [],
  } = context;
```

(c) En el `return` de `buildSystemPrompt`, justo después de `${resumenBloque}` (línea ~139), agrega en la siguiente línea:
```
${bloqueSenales(senales)}
```
(es decir, queda `${bloqueMemorias(memorias)}` / `${resumenBloque}` / `${bloqueSenales(senales)}` consecutivos en el template).

(d) En `instruccionInicial`, reemplaza SOLO la rama `if (motivo === 'saludo')` por:
```js
  if (motivo === 'saludo') {
    const senal = Array.isArray(context.senales) && context.senales[0];
    if (senal) {
      return `Enciende el micrófono y saluda breve: 'Hola, ${saludo}${nombreLabel}'. Menciona enseguida, en tu tono y sin agobiar: '${senal}'. Luego ofrece ayuda con algo como '¿En qué trabajamos hoy?'.`;
    }
    return `Enciende el micrófono y di exactamente: 'Hola, ${saludo}${nombreLabel}, ¿en qué trabajaremos hoy?' o '¿Necesita ayuda?'`;
  }
```
NO toques las ramas `onboarding`, `inactividad` ni `manual`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest tests/gastos/kaly-prompt.test.js 2>&1 | tail -20`
Expected: PASS (los nuevos + los existentes del archivo).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD   # master
git add gastos-app/src/gastos/kaly/prompt.js gastos-app/tests/gastos/kaly-prompt.test.js
git commit -m "feat(kaly-m5): saludo proactivo en prompt.js (instruccionInicial + bloque)"
```

---

### Task 5: App — toggle "KALY proactiva" + `api.getAgentPrefs`

Componente self-contained que lee el estado (GET prefs) y lo cambia (PATCH). Montado en un punto estable.

**Files:**
- Modify: `gastos-app/src/gastos/api.js` (agregar `getAgentPrefs`)
- Create: `gastos-app/src/gastos/kaly/ProactividadToggle.jsx`
- Modify: el archivo donde se monte (ver Step 7)
- Test: `gastos-app/tests/gastos/api.test.js` (1 caso), `gastos-app/tests/gastos/ProactividadToggle.test.jsx` (nuevo)

- [ ] **Step 1: Write the failing test (api.js)**

En `gastos-app/tests/gastos/api.test.js`, agrega (siguiendo el patrón de mock de `fetch` del archivo):
```js
test('getAgentPrefs hace GET a /api/app/agent/prefs', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ proactividad: false }) });
  const out = await api.getAgentPrefs();
  expect(out).toEqual({ proactividad: false });
  const [url, opts] = global.fetch.mock.calls[0];
  expect(url).toContain('/api/app/agent/prefs');
  expect(opts.method === undefined || opts.method === 'GET').toBe(true);
});
```

- [ ] **Step 2: Run → FAIL**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest tests/gastos/api.test.js -t "getAgentPrefs" 2>&1 | tail -20`
Expected: FAIL — `api.getAgentPrefs is not a function`.

- [ ] **Step 3: Implement (api.js)**

En `gastos-app/src/gastos/api.js`, junto a `agentPrefs(patch)` (línea ~46), agrega:
```js
  getAgentPrefs() { return req('/api/app/agent/prefs'); },
```

- [ ] **Step 4: Run → PASS**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest tests/gastos/api.test.js -t "getAgentPrefs" 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 5: Write the failing test (toggle component)**

Crea `gastos-app/tests/gastos/ProactividadToggle.test.jsx`:
```js
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';

jest.mock('../../src/gastos/api', () => ({
  api: {
    getAgentPrefs: jest.fn().mockResolvedValue({ proactividad: true }),
    agentPrefs: jest.fn().mockResolvedValue({ proactividad: false }),
  },
}));
import { api } from '../../src/gastos/api';
import ProactividadToggle from '../../src/gastos/kaly/ProactividadToggle.jsx';

beforeEach(() => { jest.clearAllMocks(); });

test('carga el estado inicial desde getAgentPrefs', async () => {
  await act(async () => { render(<ProactividadToggle />); });
  await waitFor(() => expect(api.getAgentPrefs).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('checkbox')).toBeChecked();
});

test('al togglear llama agentPrefs con el nuevo valor', async () => {
  api.getAgentPrefs.mockResolvedValueOnce({ proactividad: true });
  await act(async () => { render(<ProactividadToggle />); });
  await waitFor(() => expect(api.getAgentPrefs).toHaveBeenCalled());
  await act(async () => { fireEvent.click(screen.getByRole('checkbox')); });
  expect(api.agentPrefs).toHaveBeenCalledWith({ proactividad: false });
});
```

- [ ] **Step 6: Run → FAIL**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest tests/gastos/ProactividadToggle.test.jsx 2>&1 | tail -20`
Expected: FAIL — `Cannot find module '.../ProactividadToggle.jsx'`.

- [ ] **Step 7: Implement the component**

Crea `gastos-app/src/gastos/kaly/ProactividadToggle.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { api } from '../api';

export default function ProactividadToggle() {
  const [on, setOn] = useState(true);

  useEffect(() => {
    let vivo = true;
    api.getAgentPrefs()
      .then((p) => { if (vivo) setOn(p?.proactividad !== false); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  function toggle() {
    const nv = !on;
    setOn(nv);
    api.agentPrefs({ proactividad: nv }).catch(() => {});
  }

  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#a1a1aa', cursor: 'pointer' }}>
      <input type="checkbox" checked={on} onChange={toggle} />
      KALY proactiva (te comenta algo útil al saludar)
    </label>
  );
}
```

- [ ] **Step 8: Run → PASS**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest tests/gastos/ProactividadToggle.test.jsx 2>&1 | tail -20`
Expected: PASS (2 tests).

- [ ] **Step 9: Mount the component**

Monta `ProactividadToggle` en la pantalla de ajustes de KALY. LEE primero `gastos-app/src/gastos/MemoriaKalyView.jsx` (Antigravity la rediseñó — "premium"). Inserta el toggle cerca del encabezado/cabecera, en una línea propia, importándolo:
```jsx
import ProactividadToggle from './kaly/ProactividadToggle.jsx';
```
y renderizando `<ProactividadToggle />` en un punto visible y aislado (p. ej. justo bajo el `<p>` de descripción del encabezado). Es UN import + UNA línea de render; si el layout de Antigravity hace incómodo ese anchor, móntalo en `gastos-app/src/gastos/GastosApp.jsx` cerca del bloque de KALY/Memoria. Verifica que la app compile tras montar (Task 6 cubre el build). NO modifiques otra lógica de esos archivos.

- [ ] **Step 10: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD   # master
# Ajusta la lista al archivo que hayas montado (MemoriaKalyView.jsx o GastosApp.jsx):
git add gastos-app/src/gastos/api.js gastos-app/src/gastos/kaly/ProactividadToggle.jsx gastos-app/tests/gastos/api.test.js gastos-app/tests/gastos/ProactividadToggle.test.jsx gastos-app/src/gastos/MemoriaKalyView.jsx
git commit -m "feat(kaly-m5): toggle KALY proactiva (getAgentPrefs + ProactividadToggle)"
```
> ⚠️ Si montaste en `MemoriaKalyView.jsx`, stagéala con `git add` específico. NO uses `git add -A`. NO toques `gastos/public/panel/index.html`.

---

### Task 6: Suite completa verde + build

**Files:** (verificación)

- [ ] **Step 1: Backend — suite completa**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest 2>&1 | tail -10`
Expected: PASS — todas verdes (las previas + senales + context-senales + repo-prefs + prefs-route).

- [ ] **Step 2: App — suite completa**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest 2>&1 | tail -8`
Expected: PASS — todas verdes (las previas + kaly-prompt nuevos + ProactividadToggle + api).

- [ ] **Step 3: App — build**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx vite build 2>&1 | tail -6`
Expected: build OK (`✓ built`).

- [ ] **Step 4: Commit (solo si hubo algún ajuste)**

Si los pasos 1-3 pasaron sin cambios, no hay nada que commitear.

---

## Self-Review

**1. Spec coverage:**
- `construirSenales` (plata: saldo<0/pendientes/sin-movimientos; huecos: horario/dirección/pagos; memoria vacía→una; nada→[]) → Task 1 ✅
- `buildAgentContext` inyecta `senales` (solo si ON) + `proactividad`; `setAgentPrefs` acepta `proactividad` → Task 2 ✅
- `GET /api/app/agent/prefs` → Task 3 ✅
- `instruccionInicial('saludo')` usa `senales[0]`; `buildSystemPrompt` bloque; otros motivos intactos → Task 4 ✅
- Toggle dueño (`getAgentPrefs` + `ProactividadToggle` + mount) → Task 5 ✅
- Máx 1 señal (instruccionInicial usa `[0]`, bloque dice "solo una"); off-switch; sin migración → cubierto en Tasks 2/4/5 ✅
- Suite + build → Task 6 ✅

**2. Placeholder scan:** Sin "TBD"/"TODO". Las referencias a "patrón de context-memory/memoria-routes" son por reutilizar helpers reales del repo (mostrados completos), no placeholders. El anchor de montaje (Task 5 Step 9) da código exacto + alternativa concreta.

**3. Type consistency:** `construirSenales(context)`→`string[]`; contexto expone `senales` + `proactividad`; `setAgentPrefs({proactividad})`; `api.getAgentPrefs()`→prefs; `instruccionInicial(context, motivo)` lee `context.senales[0]`; `buildSystemPrompt` destructura `senales=[]`; `ProactividadToggle` usa `api.getAgentPrefs`/`api.agentPrefs({proactividad})`. Consistente en todos los tasks. ✅
