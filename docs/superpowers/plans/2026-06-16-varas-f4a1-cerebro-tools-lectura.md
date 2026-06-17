# VARAS F4a-1 — Cerebro conversacional + tools de lectura — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El cerebro de VARAS conversacional (texto): un `responder(db, companyId, messages, {gemini})` que corre un loop de function-calling — ejecuta tools de LECTURA (saldos, balance, flujo, deudas, conciliación, consumo de insumos) y devuelve la respuesta; si Gemini pide una acción, devuelve una `accionPropuesta` sin ejecutarla. Gemini inyectable (tests sin red).

**Architecture:** `varas/tools.js` = registro de tools de lectura (cada una `(db, companyId, args) → dato`, reusando `contabilidad/reportes`, `match/repo`, `auxiliares/reportes`) + `TOOL_DECLARATIONS` (para Gemini) + `ACCION_NAMES` (set de tools de acción, que F4a-2 implementa). `varas/chat.js` = `responder` con el loop. La interfaz `gemini({systemPrompt, messages, tools})` devuelve `{ tool:{name,args} }` o `{ text }`; el default llama a Gemini OpenAI-compat con function-calling; en tests se inyecta un fake. Multi-tenant por `company_id`.

**Tech Stack:** Node + pg-mem/Jest. Gemini OpenAI-compat (inyectable). Sin deps nuevas.

**Repo:** `C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA` (canónico, rama `master`). Tests: `cd "...\HASH IA\gastos" && npx jest`. Commit `git -c user.name="José Antonio Olguín" -c user.email="atikodigital@gmail.com"`. Confirmar `rev-parse --show-toplevel` ends in `HASH IA`.

**Depende de:** `contabilidad/reportes.js` (libroMayor, balanceComprobacion, flujoCaja), `match/repo.js` (getUltima), `auxiliares/reportes.js` (consumoPorNombre, frasearConsumo).

---

## File Structure

**Crear:**
- `gastos/src/varas/tools.js` — `TOOLS_READ` (map nombre→fn), `TOOL_DECLARATIONS` (array), `ACCION_NAMES` (Set), `descAccion`.
- `gastos/src/varas/chat.js` — `responder(db, companyId, messages, opts)` + `SYSTEM_PROMPT`.
- Tests: `gastos/tests/varas/tools.test.js`, `gastos/tests/varas/chat.test.js`.

**Contrato:**
- Tool de lectura: `async (db, companyId, args) → objeto serializable`.
- `gemini({ systemPrompt, messages, tools }) → { tool: { name, args } } | { text: string }`.
- `responder(...) → { reply: string, accionPropuesta?: { tipo, args, descripcion } }`.

---

## Task 1: Tools de lectura (`varas/tools.js`)

**Files:**
- Create: `gastos/src/varas/tools.js`
- Test: `gastos/tests/varas/tools.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/varas/tools.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const cuentas = require('../../src/contabilidad/cuentas');
const { contabilizarMovimiento } = require('../../src/contabilidad/contabilizar');
const auxRepo = require('../../src/auxiliares/repo');
const lineasRepo = require('../../src/expenses/lineas-repo');
const { createExpense } = require('../../src/expenses/repo');
const { TOOLS_READ, TOOL_DECLARATIONS, ACCION_NAMES } = require('../../src/varas/tools');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await db.query("INSERT INTO companies (id, nombre) VALUES ($1,'T')", [COMPANY]);
  await cuentas.sembrarCuentas(db, COMPANY);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';

test('TOOL_DECLARATIONS y ACCION_NAMES están definidos', () => {
  expect(Array.isArray(TOOL_DECLARATIONS)).toBe(true);
  expect(TOOL_DECLARATIONS.find((d) => d.name === 'consumo_insumo')).toBeTruthy();
  expect(ACCION_NAMES.has('marcar_pagado')).toBe(true);
  expect(ACCION_NAMES.has('consumo_insumo')).toBe(false);
});

test('balance() devuelve cuadrado y totales', async () => {
  const db = await makeDb();
  await contabilizarMovimiento(db, COMPANY, { id: 'e1', tipo: 'gasto', neto: 10000, iva: 1900, total: 11900, fecha: '2026-06-10', cuenta_sii_codigo: '4.3.10.1', proveedor: 'X' }, 'devengo');
  const r = await TOOLS_READ.balance(db, COMPANY, {});
  expect(r.cuadrado).toBe(true);
});

test('consumo_insumo() responde por nombre', async () => {
  const db = await makeDb();
  const harina = await auxRepo.createAuxiliar(db, COMPANY, { nombre: 'Harina', unidad_principal: 'kg' });
  const e = await createExpense(db, { company_id: COMPANY, tipo: 'gasto', total: 11900, fecha: '2026-06-10' });
  await lineasRepo.createLineas(db, e.id, [{ descripcion: 'Harina', cantidad: 25, unidad: 'kg', total: 11900, auxiliar_id: harina.id }]);
  const r = await TOOLS_READ.consumo_insumo(db, COMPANY, { nombre: 'harina' });
  expect(r.cantidadPorUnidad.kg).toBe(25);
  expect(typeof r.frase).toBe('string');
});

test('deudas() trae saldo de proveedores y clientes', async () => {
  const db = await makeDb();
  // gasto a crédito (devengo) → proveedores con saldo acreedor
  await contabilizarMovimiento(db, COMPANY, { id: 'e1', tipo: 'gasto', neto: 10000, iva: 1900, total: 11900, fecha: '2026-06-10', cuenta_sii_codigo: '4.3.10.1', proveedor: 'X' }, 'devengo');
  const r = await TOOLS_READ.deudas(db, COMPANY, {});
  expect(Number(r.proveedores)).toBe(11900); // por pagar
  expect(Number(r.clientes)).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/varas/tools.test.js`
Expected: FAIL — Cannot find module.

- [ ] **Step 3: Write minimal implementation**

```javascript
// gastos/src/varas/tools.js
// Tools de VARAS conversacional. LECTURA = se ejecutan; ACCIÓN = se proponen (F4a-2).
const reportes = require('../contabilidad/reportes');
const matchRepo = require('../match/repo');
const auxReportes = require('../auxiliares/reportes');

const ACCION_NAMES = new Set(['marcar_pagado', 'crear_asiento_manual', 'enviar_resumen_whatsapp']);

async function _saldoClave(db, companyId, clave, filtros) {
  const mayor = await reportes.libroMayor(db, companyId, filtros || {});
  const c = mayor.find((x) => x.clave === clave);
  return c ? Number(c.saldo) : 0;
}

const TOOLS_READ = {
  async saldo_cuenta(db, companyId, args = {}) {
    const mayor = await reportes.libroMayor(db, companyId, {});
    const q = String(args.nombre || args.clave || '').toLowerCase();
    const c = mayor.find((x) => (x.clave && x.clave === q) || (x.nombre && x.nombre.toLowerCase().includes(q)));
    return c ? { cuenta: c.nombre, saldo: Number(c.saldo) } : { cuenta: null, saldo: 0 };
  },
  async balance(db, companyId, args = {}) {
    return reportes.balanceComprobacion(db, companyId, args);
  },
  async flujo(db, companyId, args = {}) {
    return reportes.flujoCaja(db, companyId, args);
  },
  async deudas(db, companyId, args = {}) {
    // Proveedores: saldo acreedor (haber-debe) ⇒ -saldo; Clientes: saldo deudor (debe-haber) ⇒ saldo
    const prov = await _saldoClave(db, companyId, 'proveedores', args);
    const cli = await _saldoClave(db, companyId, 'clientes', args);
    return { proveedores: Math.max(0, -prov), clientes: Math.max(0, cli) };
  },
  async estado_conciliacion(db, companyId, args = {}) {
    const u = await matchRepo.getUltima(db, companyId, 'bancaria');
    if (!u) return { hay: false };
    return { hay: true, cuadrado: u.cuadrado, sca: Number(u.sca), sba: Number(u.sba) };
  },
  async consumo_insumo(db, companyId, args = {}) {
    const c = await auxReportes.consumoPorNombre(db, companyId, args.nombre || '', args);
    return { ...c, frase: auxReportes.frasearConsumo(c, args.nombre || '') };
  },
};

const TOOL_DECLARATIONS = [
  { name: 'saldo_cuenta', description: 'Saldo de una cuenta contable por nombre o clave (ej. banco, caja, proveedores).', parameters: { type: 'object', properties: { nombre: { type: 'string' } } } },
  { name: 'balance', description: 'Balance de comprobación: totales debe/haber y si cuadra.', parameters: { type: 'object', properties: {} } },
  { name: 'flujo', description: 'Flujo de caja del período (entradas/salidas/neto). Param opcional periodo YYYY-MM.', parameters: { type: 'object', properties: { periodo: { type: 'string' } } } },
  { name: 'deudas', description: 'Cuánto debe la empresa a proveedores (por pagar) y cuánto le deben los clientes (por cobrar).', parameters: { type: 'object', properties: {} } },
  { name: 'estado_conciliacion', description: 'Estado de la última conciliación bancaria (cuadrado, SCA/SBA).', parameters: { type: 'object', properties: {} } },
  { name: 'consumo_insumo', description: 'Consumo de un insumo/auxiliar por nombre (cantidad por unidad, monto, frase). Param opcional periodo YYYY-MM.', parameters: { type: 'object', properties: { nombre: { type: 'string' }, periodo: { type: 'string' } }, required: ['nombre'] } },
  // Acciones (las propone; ejecuta /varas/accion en F4a-2):
  { name: 'marcar_pagado', description: 'Marca un gasto como pagado (requiere confirmación).', parameters: { type: 'object', properties: { descripcion: { type: 'string' } } } },
  { name: 'crear_asiento_manual', description: 'Crea un asiento manual (requiere confirmación).', parameters: { type: 'object', properties: { fecha: { type: 'string' }, glosa: { type: 'string' }, lineas: { type: 'array' } } } },
  { name: 'enviar_resumen_whatsapp', description: 'Envía el resumen de caja al WhatsApp del dueño (requiere confirmación).', parameters: { type: 'object', properties: {} } },
];

function descAccion(tipo, args = {}) {
  if (tipo === 'marcar_pagado') return `Marcar como pagado: ${args.descripcion || 'el gasto indicado'}.`;
  if (tipo === 'crear_asiento_manual') return `Crear asiento manual: ${args.glosa || 'ajuste'}.`;
  if (tipo === 'enviar_resumen_whatsapp') return 'Enviar el resumen de caja por WhatsApp.';
  return 'Acción propuesta.';
}

module.exports = { TOOLS_READ, TOOL_DECLARATIONS, ACCION_NAMES, descAccion };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/varas/tools.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/varas/tools.js gastos/tests/varas/tools.test.js
git commit -m "feat(varas-f4): tools de lectura de VARAS conversacional"
```

---

## Task 2: Cerebro `responder` (`varas/chat.js`)

**Files:**
- Create: `gastos/src/varas/chat.js`
- Test: `gastos/tests/varas/chat.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/varas/chat.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const cuentas = require('../../src/contabilidad/cuentas');
const { contabilizarMovimiento } = require('../../src/contabilidad/contabilizar');
const { responder } = require('../../src/varas/chat');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await db.query("INSERT INTO companies (id, nombre) VALUES ($1,'T')", [COMPANY]);
  await cuentas.sembrarCuentas(db, COMPANY);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';

test('ejecuta tool de lectura y devuelve reply con el dato', async () => {
  const db = await makeDb();
  await contabilizarMovimiento(db, COMPANY, { id: 'e1', tipo: 'gasto', neto: 10000, iva: 1900, total: 11900, fecha: '2026-06-10', cuenta_sii_codigo: '4.3.10.1', proveedor: 'X' }, 'devengo');
  let llamada = 0;
  const gemini = async ({ messages }) => {
    llamada++;
    if (llamada === 1) return { tool: { name: 'balance', args: {} } };
    // 2ª llamada: ya tiene el resultado del tool en messages → responde texto
    const ultimo = messages[messages.length - 1];
    return { text: 'Tu balance cuadra. (' + ultimo.text.slice(0, 10) + ')' };
  };
  const r = await responder(db, COMPANY, [{ role: 'user', text: '¿mi balance cuadra?' }], { gemini });
  expect(r.reply).toMatch(/cuadra/i);
  expect(r.accionPropuesta).toBeUndefined();
});

test('un tool de acción produce accionPropuesta sin ejecutar', async () => {
  const db = await makeDb();
  const gemini = async () => ({ tool: { name: 'marcar_pagado', args: { descripcion: 'arriendo' } } });
  const r = await responder(db, COMPANY, [{ role: 'user', text: 'marca pagado el arriendo' }], { gemini });
  expect(r.accionPropuesta).toBeTruthy();
  expect(r.accionPropuesta.tipo).toBe('marcar_pagado');
  expect(r.accionPropuesta.descripcion).toMatch(/arriendo/);
});

test('si Gemini responde texto directo, lo devuelve', async () => {
  const db = await makeDb();
  const gemini = async () => ({ text: 'Hola, soy VARAS.' });
  const r = await responder(db, COMPANY, [{ role: 'user', text: 'hola' }], { gemini });
  expect(r.reply).toBe('Hola, soy VARAS.');
});

test('respeta el tope de iteraciones (no se cuelga)', async () => {
  const db = await makeDb();
  const gemini = async () => ({ tool: { name: 'balance', args: {} } }); // siempre pide tool → nunca termina
  const r = await responder(db, COMPANY, [{ role: 'user', text: 'x' }], { gemini, maxIter: 3 });
  expect(typeof r.reply).toBe('string'); // devuelve algo, no se cuelga
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/varas/chat.test.js`
Expected: FAIL — Cannot find module.

- [ ] **Step 3: Write minimal implementation**

```javascript
// gastos/src/varas/chat.js
// Cerebro de VARAS conversacional (texto): loop de function-calling.
const { TOOLS_READ, TOOL_DECLARATIONS, ACCION_NAMES, descAccion } = require('./tools');

const SYSTEM_PROMPT = [
  'Eres VARAS, el contador IA de la empresa. Tono serio, claro y conciso.',
  'Respondes SOLO con los datos reales obtenidos vía tus herramientas (tools). Cero invención: si no tienes el dato, dilo.',
  'Para responder sobre saldos, balance, flujo, deudas, conciliación o consumo de insumos, USA la tool correspondiente.',
  'Las acciones (marcar pagado, crear asiento, enviar resumen) NO las ejecutas: las propones y el dueño confirma.',
  'Montos en CLP. Responde en español de Chile.',
].join(' ');

async function _defaultGemini() { return { text: 'VARAS no está disponible ahora.' }; }

// Devuelve { reply, accionPropuesta? }.
async function responder(db, companyId, messages, { gemini, maxIter = 5 } = {}) {
  const _g = gemini || _defaultGemini;
  let convo = Array.isArray(messages) ? messages.slice() : [];
  for (let i = 0; i < maxIter; i++) {
    let out;
    try { out = await _g({ systemPrompt: SYSTEM_PROMPT, messages: convo, tools: TOOL_DECLARATIONS }); }
    catch (e) { return { reply: 'No pude procesar la consulta.' }; }
    if (out && out.tool && out.tool.name) {
      const name = out.tool.name; const args = out.tool.args || {};
      if (ACCION_NAMES.has(name)) {
        return { reply: '', accionPropuesta: { tipo: name, args, descripcion: descAccion(name, args) } };
      }
      const fn = TOOLS_READ[name];
      if (!fn) { convo = convo.concat([{ role: 'tool', name, text: '{"error":"tool_desconocida"}' }]); continue; }
      let dato; try { dato = await fn(db, companyId, args); } catch (e) { dato = { error: String(e.message || e) }; }
      convo = convo.concat([{ role: 'tool', name, text: JSON.stringify(dato) }]);
      continue;
    }
    return { reply: (out && out.text) || '' };
  }
  return { reply: 'No pude completar la consulta (demasiados pasos).' };
}

module.exports = { responder, SYSTEM_PROMPT };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/varas/chat.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/varas/chat.js gastos/tests/varas/chat.test.js
git commit -m "feat(varas-f4): cerebro responder (loop function-calling, gemini inyectable)"
```

---

## Task 3: Cierre F4a-1 — suite

- [ ] **Step 1: Suite backend**

Run: `cd gastos && npx jest`
Expected: PASS — todo verde, sin regresión (módulos `varas/*` nuevos, no tocan nada existente).

- [ ] **Step 2: Commit final (si quedó algo)**

```bash
git add -A && git commit -m "test(varas-f4): suite F4a-1 verde" || echo "nada que commitear"
```

---

## Notas de cierre F4a-1

- El `responder` es el cerebro puro: tools de lectura + loop. La IA real (Gemini con function-calling OpenAI-compat) se conecta en F4a-2 como el `gemini` por defecto (un adaptador que traduce `{systemPrompt, messages, tools}` ↔ la API de Gemini). Por ahora `_defaultGemini` es un stub; F4a-2 lo reemplaza por el real.
- **Pendiente F4a-2:** adaptador Gemini real (function-calling), tools de ACCIÓN (ejecución), endpoints `POST /varas/chat` y `POST /varas/accion` en app y panel.
- **Pendiente F4a-3/4:** UI chat en app y panel. **F4b:** voz.
- ⚠️ Trabajar SOLO en `HASH IA\`.
