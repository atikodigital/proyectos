# VARAS — Fase 1: Contabilidad Base — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la contabilidad de partida doble auto-generada de VARAS: plan de cuentas SII por empresa, asientos balanceados desde cada movimiento, contabilizador idempotente, y los 4 reportes (Libro Diario, Mayor, Balance de Comprobación, Flujo de Caja) expuestos por API.

**Architecture:** Enfoque C (híbrido). Un motor PURO (`contabilidad/asientos.js`) mapea cada `expense` → asiento balanceado (sin DB). Un contabilizador (`contabilidad/contabilizar.js`) persiste/regenera/anula ese asiento de forma idempotente por `(company_id, origen, origen_ref, tipo_asiento)`. Los 4 reportes son consultas sobre `asiento_lineas`. Todo multi-tenant por `company_id`, mismo patrón que `catalog/repo.js` (tabla con `ensureXTable` + WeakMap, funciones puras, CRUD scoped). Esta fase es solo backend + API; la UI app/panel se conecta al final (Task 9). El chat/voz de VARAS es F4.

**Tech Stack:** Node/Express, Postgres (prod) / pg-mem v3 (tests), Jest. CLP en `bigint`, IVA 19% (`domain/money.js`). Sin dependencias nuevas.

**Worktree:** `C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112` — rama `claude/dazzling-driscoll-78a112`. **Todos los comandos y rutas son relativos a ese worktree.** Ejecutar tests con `cd gastos && npx jest`.

---

## File Structure

**Crear:**
- `gastos/src/contabilidad/cuentas.js` — plan de cuentas SII (constante) + tabla `cuentas` + siembra/CRUD por empresa.
- `gastos/src/contabilidad/asientos.js` — motor PURO: `asientoDeMovimiento(expense, planCuentas)` + validación `Σdebe==Σhaber`.
- `gastos/src/contabilidad/repo.js` — tablas `asientos`+`asiento_lineas`, persistencia (crear/anular/buscar asiento).
- `gastos/src/contabilidad/contabilizar.js` — contabilizador idempotente (engancha alta/edición/anulación/pago).
- `gastos/src/contabilidad/reportes.js` — Libro Diario, Mayor, Balance, Flujo (consultas).
- `gastos/tests/contabilidad/cuentas.test.js`
- `gastos/tests/contabilidad/asientos.test.js`
- `gastos/tests/contabilidad/repo.test.js`
- `gastos/tests/contabilidad/contabilizar.test.js`
- `gastos/tests/contabilidad/reportes.test.js`

**Modificar:**
- `gastos/src/app/router.js` — rutas read-only de reportes en `/api/app` (Task 9).
- `gastos/src/expenses/intake.js` y/o `gastos/src/app/router.js` — enganchar el contabilizador en alta/confirmación/edición/anulación/pago (Task 8).

**Decisiones de modelo (del spec §4):**
- Montos en `bigint` (CLP entero), igual que `expenses`.
- `asientos.origen ∈ {expense, pago, conciliacion, manual, sii, apertura}`; `tipo_asiento ∈ {devengo, pago, ajuste, apertura}`; `estado ∈ {borrador, confirmado, anulado}`.
- Idempotencia: a lo más UN asiento vivo (no anulado) por `(company_id, origen, origen_ref, tipo_asiento)`.

---

## Task 1: Plan de cuentas SII (constante pura)

Define el plan de cuentas base que se sembrará por empresa. Reusa los códigos que ya existen en `domain/categories.js` (cuentas de gasto) y agrega las patrimoniales/IVA/caja/banco/ventas que faltan para que los asientos cuadren.

**Files:**
- Create: `gastos/src/contabilidad/cuentas.js`
- Test: `gastos/tests/contabilidad/cuentas.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/contabilidad/cuentas.test.js
const { PLAN_BASE, cuentaPorClave, CLAVES } = require('../../src/contabilidad/cuentas');

test('PLAN_BASE trae las cuentas mínimas para cuadrar', () => {
  const claves = PLAN_BASE.map((c) => c.clave);
  for (const k of ['caja', 'banco', 'iva_credito', 'iva_debito', 'proveedores', 'clientes', 'ventas']) {
    expect(claves).toContain(k);
  }
  // cada cuenta tiene codigo, nombre, tipo, imputable
  for (const c of PLAN_BASE) {
    expect(typeof c.codigo).toBe('string');
    expect(typeof c.nombre).toBe('string');
    expect(['activo', 'pasivo', 'patrimonio', 'resultado_ganancia', 'resultado_perdida']).toContain(c.tipo);
    expect(typeof c.imputable).toBe('boolean');
  }
});

test('tipos contables correctos de las cuentas núcleo', () => {
  expect(cuentaPorClave('banco').tipo).toBe('activo');
  expect(cuentaPorClave('iva_credito').tipo).toBe('activo');
  expect(cuentaPorClave('proveedores').tipo).toBe('pasivo');
  expect(cuentaPorClave('iva_debito').tipo).toBe('pasivo');
  expect(cuentaPorClave('clientes').tipo).toBe('activo');
  expect(cuentaPorClave('ventas').tipo).toBe('resultado_ganancia');
});

test('CLAVES expone las claves núcleo como constantes', () => {
  expect(CLAVES.BANCO).toBe('banco');
  expect(CLAVES.PROVEEDORES).toBe('proveedores');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/contabilidad/cuentas.test.js`
Expected: FAIL — "Cannot find module '../../src/contabilidad/cuentas'".

- [ ] **Step 3: Write minimal implementation**

```javascript
// gastos/src/contabilidad/cuentas.js
// Plan de cuentas base SII Mipyme para VARAS. Cada cuenta tiene una "clave" estable
// (referenciada por el motor de asientos) además de su código/nombre SII.
const { CATEGORY_TO_SII } = require('../domain/categories');

const CLAVES = {
  CAJA: 'caja',
  BANCO: 'banco',
  IVA_CREDITO: 'iva_credito',
  IVA_DEBITO: 'iva_debito',
  PROVEEDORES: 'proveedores',
  CLIENTES: 'clientes',
  VENTAS: 'ventas',
  GASTOS_FINANCIEROS: 'gastos_financieros',
  GASTO_GENERICO: 'gasto_generico',
};

// Cuentas núcleo (las que el motor de asientos referencia por clave).
const NUCLEO = [
  { clave: 'caja',               codigo: '1.1.10.1',  nombre: 'Caja',                  tipo: 'activo',             imputable: true },
  { clave: 'banco',              codigo: '1.1.10.2',  nombre: 'Banco',                 tipo: 'activo',             imputable: true },
  { clave: 'iva_credito',        codigo: '1.1.40.1',  nombre: 'IVA Crédito Fiscal',    tipo: 'activo',             imputable: true },
  { clave: 'clientes',           codigo: '1.1.20.1',  nombre: 'Clientes (por cobrar)', tipo: 'activo',             imputable: true },
  { clave: 'proveedores',        codigo: '2.1.10.1',  nombre: 'Proveedores (por pagar)', tipo: 'pasivo',           imputable: true },
  { clave: 'iva_debito',         codigo: '2.1.40.1',  nombre: 'IVA Débito Fiscal',     tipo: 'pasivo',             imputable: true },
  { clave: 'ventas',             codigo: '3.1.10.1',  nombre: 'Ventas del Giro',       tipo: 'resultado_ganancia', imputable: true },
  { clave: 'gastos_financieros', codigo: '4.5.10.1',  nombre: 'Gastos Financieros',    tipo: 'resultado_perdida',  imputable: true },
  { clave: 'gasto_generico',     codigo: '4.3.150.1', nombre: 'Otros Gastos de Administración y Venta', tipo: 'resultado_perdida', imputable: true },
];

// Cuentas de gasto que vienen del mapeo de categorías (dedup por código).
const _gastoExtra = (() => {
  const vistos = new Set(NUCLEO.map((c) => c.codigo));
  const out = [];
  for (const { codigo, nombre } of Object.values(CATEGORY_TO_SII)) {
    if (vistos.has(codigo)) continue;
    vistos.add(codigo);
    out.push({ clave: 'gasto_' + codigo.replace(/\./g, '_'), codigo, nombre, tipo: 'resultado_perdida', imputable: true });
  }
  return out;
})();

const PLAN_BASE = [...NUCLEO, ..._gastoExtra];

function cuentaPorClave(clave) {
  return PLAN_BASE.find((c) => c.clave === clave) || null;
}

module.exports = { PLAN_BASE, CLAVES, cuentaPorClave };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/contabilidad/cuentas.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/contabilidad/cuentas.js gastos/tests/contabilidad/cuentas.test.js
git commit -m "feat(varas): plan de cuentas SII base para contabilidad"
```

---

## Task 2: Tabla `cuentas` + siembra por empresa

Persiste el plan por empresa (editable a futuro). Mismo patrón `ensureTable` + WeakMap de `catalog/repo.js`.

**Files:**
- Modify: `gastos/src/contabilidad/cuentas.js`
- Test: `gastos/tests/contabilidad/cuentas.test.js`

- [ ] **Step 1: Write the failing test** (append al archivo de test)

```javascript
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const cuentas = require('../../src/contabilidad/cuentas');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';

test('sembrarCuentas crea el plan base y es idempotente', async () => {
  const db = await makeDb();
  await cuentas.sembrarCuentas(db, COMPANY);
  const a = await cuentas.listCuentas(db, COMPANY);
  expect(a.length).toBe(cuentas.PLAN_BASE.length);
  // 2ª vez no duplica
  await cuentas.sembrarCuentas(db, COMPANY);
  const b = await cuentas.listCuentas(db, COMPANY);
  expect(b.length).toBe(cuentas.PLAN_BASE.length);
});

test('getCuentaId resuelve una cuenta núcleo por clave (sembrando si hace falta)', async () => {
  const db = await makeDb();
  const id = await cuentas.getCuentaId(db, COMPANY, 'banco');
  expect(id).toBeTruthy();
  const lista = await cuentas.listCuentas(db, COMPANY);
  const banco = lista.find((c) => c.clave === 'banco');
  expect(banco.id).toBe(id);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/contabilidad/cuentas.test.js`
Expected: FAIL — `cuentas.sembrarCuentas is not a function`.

- [ ] **Step 3: Write minimal implementation** (append a `cuentas.js`, antes de `module.exports`)

```javascript
const _ready = new WeakMap();
async function ensureCuentasTable(db) {
  if (!_ready.has(db)) {
    const p = db.query(`
      CREATE TABLE IF NOT EXISTS cuentas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL,
        clave text,
        codigo text NOT NULL,
        nombre text NOT NULL,
        tipo text NOT NULL,
        imputable boolean NOT NULL DEFAULT true,
        activo boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_cuentas_company ON cuentas(company_id);
    `).catch((e) => { _ready.delete(db); throw e; });
    _ready.set(db, p);
  }
  return _ready.get(db);
}

const CUENTA_COLS = 'id, company_id, clave, codigo, nombre, tipo, imputable, activo';

async function sembrarCuentas(db, companyId) {
  await ensureCuentasTable(db);
  const existentes = await db.query('SELECT codigo FROM cuentas WHERE company_id=$1', [companyId]);
  const yaHay = new Set(existentes.rows.map((r) => r.codigo));
  for (const c of PLAN_BASE) {
    if (yaHay.has(c.codigo)) continue;
    await db.query(
      'INSERT INTO cuentas (company_id, clave, codigo, nombre, tipo, imputable) VALUES ($1,$2,$3,$4,$5,$6)',
      [companyId, c.clave, c.codigo, c.nombre, c.tipo, c.imputable]
    );
  }
}

async function listCuentas(db, companyId) {
  await ensureCuentasTable(db);
  const r = await db.query(`SELECT ${CUENTA_COLS} FROM cuentas WHERE company_id=$1 ORDER BY codigo ASC`, [companyId]);
  return r.rows;
}

// Devuelve el id de la cuenta de una clave núcleo; siembra si la empresa no tiene plan.
async function getCuentaId(db, companyId, clave) {
  await ensureCuentasTable(db);
  let r = await db.query('SELECT id FROM cuentas WHERE company_id=$1 AND clave=$2 LIMIT 1', [companyId, clave]);
  if (!r.rows[0]) { await sembrarCuentas(db, companyId); r = await db.query('SELECT id FROM cuentas WHERE company_id=$1 AND clave=$2 LIMIT 1', [companyId, clave]); }
  return r.rows[0] ? r.rows[0].id : null;
}

// Resuelve la cuenta de gasto de un expense: por cuenta_sii_codigo del movimiento, o la genérica.
async function getCuentaGastoId(db, companyId, codigoSii) {
  await ensureCuentasTable(db);
  if (codigoSii) {
    const r = await db.query('SELECT id FROM cuentas WHERE company_id=$1 AND codigo=$2 LIMIT 1', [companyId, codigoSii]);
    if (r.rows[0]) return r.rows[0].id;
  }
  return getCuentaId(db, companyId, 'gasto_generico');
}
```

Y agrega a `module.exports`: `ensureCuentasTable, sembrarCuentas, listCuentas, getCuentaId, getCuentaGastoId`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/contabilidad/cuentas.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/contabilidad/cuentas.js gastos/tests/contabilidad/cuentas.test.js
git commit -m "feat(varas): tabla cuentas + siembra del plan por empresa"
```

---

## Task 3: Motor de asientos PURO (`asientoDeMovimiento`)

Función pura que mapea un `expense` a un asiento balanceado. **No toca DB**: recibe un resolvedor de ids de cuenta ya cargado (un objeto `{clave|codigo -> id}`), para que el test sea puro.

**Files:**
- Create: `gastos/src/contabilidad/asientos.js`
- Test: `gastos/tests/contabilidad/asientos.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/contabilidad/asientos.test.js
const { asientoDeMovimiento, asientoBalanceado } = require('../../src/contabilidad/asientos');

// Resolvedor de cuentas para tests: clave/código -> id ficticio.
const ID = {
  banco: 'c-banco', caja: 'c-caja', iva_credito: 'c-ivacred', iva_debito: 'c-ivadeb',
  proveedores: 'c-prov', clientes: 'c-clientes', ventas: 'c-ventas', gasto_generico: 'c-gasto',
  gastos_financieros: 'c-finan',
  '4.3.10.1': 'c-generales',
};
const resolver = { porClave: (k) => ID[k], porCodigo: (c) => ID[c] || ID.gasto_generico };

test('gasto a crédito (devengo): Debe gasto+IVA crédito / Haber proveedores', () => {
  const exp = { id: 'e1', tipo: 'gasto', neto: 10000, iva: 1900, total: 11900, fecha: '2026-06-10', cuenta_sii_codigo: '4.3.10.1', proveedor: 'Sodimac' };
  const a = asientoDeMovimiento(exp, resolver, 'devengo');
  expect(a.tipo_asiento).toBe('devengo');
  expect(a.origen).toBe('expense');
  expect(a.origen_ref).toBe('e1');
  const debe = a.lineas.filter((l) => l.debe > 0);
  const haber = a.lineas.filter((l) => l.haber > 0);
  expect(debe.find((l) => l.cuenta_id === 'c-generales').debe).toBe(10000);
  expect(debe.find((l) => l.cuenta_id === 'c-ivacred').debe).toBe(1900);
  expect(haber.find((l) => l.cuenta_id === 'c-prov').haber).toBe(11900);
  expect(asientoBalanceado(a)).toBe(true);
});

test('pago de gasto: Debe proveedores / Haber banco', () => {
  const exp = { id: 'e1', tipo: 'gasto', total: 11900, fecha: '2026-06-15', proveedor: 'Sodimac' };
  const a = asientoDeMovimiento(exp, resolver, 'pago');
  expect(a.tipo_asiento).toBe('pago');
  expect(a.origen).toBe('pago');
  expect(a.lineas.find((l) => l.cuenta_id === 'c-prov').debe).toBe(11900);
  expect(a.lineas.find((l) => l.cuenta_id === 'c-banco').haber).toBe(11900);
  expect(asientoBalanceado(a)).toBe(true);
});

test('venta (devengo): Debe clientes / Haber ventas+IVA débito', () => {
  const exp = { id: 'i1', tipo: 'ingreso', neto: 20000, iva: 3800, total: 23800, fecha: '2026-06-10', proveedor: 'Cliente X' };
  const a = asientoDeMovimiento(exp, resolver, 'devengo');
  expect(a.lineas.find((l) => l.cuenta_id === 'c-clientes').debe).toBe(23800);
  expect(a.lineas.find((l) => l.cuenta_id === 'c-ventas').haber).toBe(20000);
  expect(a.lineas.find((l) => l.cuenta_id === 'c-ivadeb').haber).toBe(3800);
  expect(asientoBalanceado(a)).toBe(true);
});

test('cobro de venta: Debe banco / Haber clientes', () => {
  const exp = { id: 'i1', tipo: 'ingreso', total: 23800, fecha: '2026-06-20' };
  const a = asientoDeMovimiento(exp, resolver, 'pago');
  expect(a.lineas.find((l) => l.cuenta_id === 'c-banco').debe).toBe(23800);
  expect(a.lineas.find((l) => l.cuenta_id === 'c-clientes').haber).toBe(23800);
  expect(asientoBalanceado(a)).toBe(true);
});

test('gasto sin IVA: solo gasto / proveedores (sin línea de IVA)', () => {
  const exp = { id: 'e2', tipo: 'gasto', neto: 5000, iva: 0, total: 5000, fecha: '2026-06-10', cuenta_sii_codigo: '4.3.10.1' };
  const a = asientoDeMovimiento(exp, resolver, 'devengo');
  expect(a.lineas.some((l) => l.cuenta_id === 'c-ivacred')).toBe(false);
  expect(asientoBalanceado(a)).toBe(true);
});

test('asiento descuadrado lanza error', () => {
  const malo = { tipo_asiento: 'ajuste', origen: 'manual', origen_ref: 'x', fecha: '2026-06-10', glosa: 'malo', lineas: [{ cuenta_id: 'a', debe: 100, haber: 0 }, { cuenta_id: 'b', debe: 0, haber: 90 }] };
  expect(() => asientoBalanceado(malo, { strict: true })).toThrow('asiento_descuadrado');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/contabilidad/asientos.test.js`
Expected: FAIL — "Cannot find module".

- [ ] **Step 3: Write minimal implementation**

```javascript
// gastos/src/contabilidad/asientos.js
// Motor PURO: convierte un expense en un asiento de partida doble balanceado.
// No toca DB. `resolver` provee ids de cuenta: { porClave(clave), porCodigo(codigoSii) }.
function _int(n) { const v = Math.round(Number(n) || 0); return v > 0 ? v : 0; }

function linea(cuenta_id, debe, haber, glosa) {
  return { cuenta_id, debe: _int(debe), haber: _int(haber), glosa: glosa || null };
}

// Suma debe/haber. Si strict y no cuadra, lanza. Devuelve boolean.
function asientoBalanceado(asiento, { strict = false } = {}) {
  const sumD = (asiento.lineas || []).reduce((a, l) => a + _int(l.debe), 0);
  const sumH = (asiento.lineas || []).reduce((a, l) => a + _int(l.haber), 0);
  const ok = sumD === sumH && sumD > 0;
  if (!ok && strict) { const e = new Error('asiento_descuadrado'); e.code = 'descuadrado'; throw e; }
  return ok;
}

function esGasto(exp) { return (exp.tipo || 'gasto') !== 'ingreso'; }

// tipoAsiento: 'devengo' (nace al registrar) | 'pago' (al conciliar/pagar)
function asientoDeMovimiento(exp, resolver, tipoAsiento) {
  const neto = _int(exp.neto);
  const iva = _int(exp.iva);
  const total = _int(exp.total) || (neto + iva);
  const lineas = [];
  let origen;

  if (tipoAsiento === 'devengo') {
    origen = 'expense';
    if (esGasto(exp)) {
      const cGasto = resolver.porCodigo(exp.cuenta_sii_codigo);
      lineas.push(linea(cGasto, neto > 0 ? neto : total, 0, 'Gasto'));
      if (iva > 0) lineas.push(linea(resolver.porClave('iva_credito'), iva, 0, 'IVA crédito'));
      lineas.push(linea(resolver.porClave('proveedores'), 0, total, exp.proveedor || 'Proveedor'));
    } else {
      lineas.push(linea(resolver.porClave('clientes'), total, 0, exp.proveedor || 'Cliente'));
      lineas.push(linea(resolver.porClave('ventas'), 0, neto > 0 ? neto : total, 'Venta'));
      if (iva > 0) lineas.push(linea(resolver.porClave('iva_debito'), 0, iva, 'IVA débito'));
    }
  } else if (tipoAsiento === 'pago') {
    origen = 'pago';
    if (esGasto(exp)) {
      lineas.push(linea(resolver.porClave('proveedores'), total, 0, 'Pago a ' + (exp.proveedor || 'proveedor')));
      lineas.push(linea(resolver.porClave('banco'), 0, total, 'Banco'));
    } else {
      lineas.push(linea(resolver.porClave('banco'), total, 0, 'Banco'));
      lineas.push(linea(resolver.porClave('clientes'), 0, total, 'Cobro de ' + (exp.proveedor || 'cliente')));
    }
  } else {
    const e = new Error('tipo_asiento_desconocido'); e.code = 'validacion'; throw e;
  }

  const asiento = {
    origen,
    origen_ref: exp.id,
    tipo_asiento: tipoAsiento,
    fecha: exp.fecha || null,
    glosa: (esGasto(exp) ? 'Gasto' : 'Venta') + (exp.proveedor ? ' · ' + exp.proveedor : ''),
    lineas,
  };
  asientoBalanceado(asiento, { strict: true });
  return asiento;
}

module.exports = { asientoDeMovimiento, asientoBalanceado };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/contabilidad/asientos.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/contabilidad/asientos.js gastos/tests/contabilidad/asientos.test.js
git commit -m "feat(varas): motor puro de asientos de partida doble"
```

---

## Task 4: Repo de asientos (`asientos` + `asiento_lineas`)

Persiste un asiento (cabecera + líneas) en una transacción lógica, y permite anular y buscar el asiento vivo de un origen.

**Files:**
- Create: `gastos/src/contabilidad/repo.js`
- Test: `gastos/tests/contabilidad/repo.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/contabilidad/repo.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const repo = require('../../src/contabilidad/repo');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';
const asientoDemo = (ref) => ({
  origen: 'expense', origen_ref: ref, tipo_asiento: 'devengo', fecha: '2026-06-10', glosa: 'Gasto',
  lineas: [{ cuenta_id: 'c-gasto', debe: 10000, haber: 0 }, { cuenta_id: 'c-prov', debe: 0, haber: 10000 }],
});

test('guardarAsiento persiste cabecera + líneas y devuelve el id', async () => {
  const db = await makeDb();
  const a = await repo.guardarAsiento(db, COMPANY, asientoDemo('e1'));
  expect(a.id).toBeTruthy();
  const lineas = await repo.getLineas(db, a.id);
  expect(lineas.length).toBe(2);
  expect(Number(lineas.reduce((s, l) => s + Number(l.debe), 0))).toBe(10000);
});

test('buscarAsientoVivo encuentra el asiento no anulado del origen', async () => {
  const db = await makeDb();
  await repo.guardarAsiento(db, COMPANY, asientoDemo('e1'));
  const vivo = await repo.buscarAsientoVivo(db, COMPANY, 'expense', 'e1', 'devengo');
  expect(vivo).toBeTruthy();
});

test('anularAsiento marca estado anulado y deja de aparecer como vivo', async () => {
  const db = await makeDb();
  const a = await repo.guardarAsiento(db, COMPANY, asientoDemo('e1'));
  await repo.anularAsiento(db, a.id);
  const vivo = await repo.buscarAsientoVivo(db, COMPANY, 'expense', 'e1', 'devengo');
  expect(vivo).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/contabilidad/repo.test.js`
Expected: FAIL — "Cannot find module".

- [ ] **Step 3: Write minimal implementation**

```javascript
// gastos/src/contabilidad/repo.js
// Persistencia de asientos contables (cabecera + líneas). Multi-tenant por company_id.
const _ready = new WeakMap();
async function ensureAsientosTables(db) {
  if (!_ready.has(db)) {
    const p = db.query(`
      CREATE TABLE IF NOT EXISTS asientos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL,
        fecha date,
        glosa text,
        origen text NOT NULL,
        origen_ref text,
        tipo_asiento text NOT NULL,
        estado text NOT NULL DEFAULT 'confirmado',
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS asiento_lineas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        asiento_id uuid NOT NULL,
        cuenta_id uuid,
        debe bigint NOT NULL DEFAULT 0,
        haber bigint NOT NULL DEFAULT 0,
        glosa text
      );
      CREATE INDEX IF NOT EXISTS idx_asientos_company ON asientos(company_id);
      CREATE INDEX IF NOT EXISTS idx_asientos_origen ON asientos(company_id, origen, origen_ref, tipo_asiento);
      CREATE INDEX IF NOT EXISTS idx_aslineas_asiento ON asiento_lineas(asiento_id);
    `).catch((e) => { _ready.delete(db); throw e; });
    _ready.set(db, p);
  }
  return _ready.get(db);
}

async function guardarAsiento(db, companyId, asiento) {
  await ensureAsientosTables(db);
  const cab = await db.query(
    `INSERT INTO asientos (company_id, fecha, glosa, origen, origen_ref, tipo_asiento, estado)
     VALUES ($1,$2,$3,$4,$5,$6,'confirmado') RETURNING *`,
    [companyId, asiento.fecha || null, asiento.glosa || null, asiento.origen, asiento.origen_ref || null, asiento.tipo_asiento]
  );
  const a = cab.rows[0];
  for (const l of (asiento.lineas || [])) {
    await db.query(
      'INSERT INTO asiento_lineas (asiento_id, cuenta_id, debe, haber, glosa) VALUES ($1,$2,$3,$4,$5)',
      [a.id, l.cuenta_id || null, Math.round(Number(l.debe) || 0), Math.round(Number(l.haber) || 0), l.glosa || null]
    );
  }
  return a;
}

async function getLineas(db, asientoId) {
  await ensureAsientosTables(db);
  const r = await db.query('SELECT * FROM asiento_lineas WHERE asiento_id=$1', [asientoId]);
  return r.rows;
}

async function buscarAsientoVivo(db, companyId, origen, origenRef, tipoAsiento) {
  await ensureAsientosTables(db);
  const r = await db.query(
    `SELECT * FROM asientos WHERE company_id=$1 AND origen=$2 AND origen_ref=$3 AND tipo_asiento=$4 AND estado <> 'anulado' LIMIT 1`,
    [companyId, origen, origenRef, tipoAsiento]
  );
  return r.rows[0] || null;
}

async function anularAsiento(db, asientoId) {
  await ensureAsientosTables(db);
  const r = await db.query("UPDATE asientos SET estado='anulado' WHERE id=$1 RETURNING *", [asientoId]);
  return r.rows[0] || null;
}

module.exports = { ensureAsientosTables, guardarAsiento, getLineas, buscarAsientoVivo, anularAsiento };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/contabilidad/repo.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/contabilidad/repo.js gastos/tests/contabilidad/repo.test.js
git commit -m "feat(varas): repo de asientos (cabecera + lineas)"
```

---

## Task 5: Contabilizador idempotente

Pega el motor puro (Task 3), el plan de cuentas (Task 2) y el repo (Task 4): contabiliza un expense de forma idempotente (regenera si ya existía, no duplica).

**Files:**
- Create: `gastos/src/contabilidad/contabilizar.js`
- Test: `gastos/tests/contabilidad/contabilizar.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/contabilidad/contabilizar.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const cuentas = require('../../src/contabilidad/cuentas');
const repo = require('../../src/contabilidad/repo');
const { contabilizarMovimiento, descontabilizarMovimiento } = require('../../src/contabilidad/contabilizar');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';
const gasto = { id: 'e1', tipo: 'gasto', neto: 10000, iva: 1900, total: 11900, fecha: '2026-06-10', cuenta_sii_codigo: '4.3.10.1', proveedor: 'Sodimac' };

test('contabiliza el devengo y queda balanceado y vivo', async () => {
  const db = await makeDb();
  await cuentas.sembrarCuentas(db, COMPANY);
  const a = await contabilizarMovimiento(db, COMPANY, gasto, 'devengo');
  expect(a.id).toBeTruthy();
  const lineas = await repo.getLineas(db, a.id);
  const sumD = lineas.reduce((s, l) => s + Number(l.debe), 0);
  const sumH = lineas.reduce((s, l) => s + Number(l.haber), 0);
  expect(sumD).toBe(sumH);
  expect(sumD).toBe(11900);
});

test('idempotente: re-contabilizar reemplaza, no duplica', async () => {
  const db = await makeDb();
  await cuentas.sembrarCuentas(db, COMPANY);
  await contabilizarMovimiento(db, COMPANY, gasto, 'devengo');
  await contabilizarMovimiento(db, COMPANY, { ...gasto, neto: 20000, iva: 3800, total: 23800 }, 'devengo');
  const r = await db.query("SELECT * FROM asientos WHERE company_id=$1 AND origen_ref='e1' AND tipo_asiento='devengo' AND estado<>'anulado'", [COMPANY]);
  expect(r.rows.length).toBe(1); // solo uno vivo
  const lineas = await repo.getLineas(db, r.rows[0].id);
  expect(lineas.reduce((s, l) => s + Number(l.haber), 0)).toBe(23800); // el nuevo total
});

test('descontabilizar anula todos los asientos vivos del movimiento', async () => {
  const db = await makeDb();
  await cuentas.sembrarCuentas(db, COMPANY);
  await contabilizarMovimiento(db, COMPANY, gasto, 'devengo');
  await contabilizarMovimiento(db, COMPANY, gasto, 'pago');
  await descontabilizarMovimiento(db, COMPANY, 'e1');
  const vivos = await db.query("SELECT * FROM asientos WHERE company_id=$1 AND origen_ref='e1' AND estado<>'anulado'", [COMPANY]);
  expect(vivos.rows.length).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/contabilidad/contabilizar.test.js`
Expected: FAIL — "Cannot find module".

- [ ] **Step 3: Write minimal implementation**

```javascript
// gastos/src/contabilidad/contabilizar.js
// Contabilizador idempotente: convierte un expense en asiento y lo persiste,
// anulando el asiento vivo anterior del mismo (origen, origen_ref, tipo_asiento).
const cuentas = require('./cuentas');
const repo = require('./repo');
const { asientoDeMovimiento } = require('./asientos');

// Construye el resolvedor de cuentas para una empresa (carga el plan una vez).
async function _resolver(db, companyId) {
  const lista = await cuentas.listCuentas(db, companyId);
  if (!lista.length) { await cuentas.sembrarCuentas(db, companyId); }
  const all = lista.length ? lista : await cuentas.listCuentas(db, companyId);
  const porClaveMap = new Map(all.filter((c) => c.clave).map((c) => [c.clave, c.id]));
  const porCodigoMap = new Map(all.map((c) => [c.codigo, c.id]));
  const generico = porClaveMap.get('gasto_generico');
  return {
    porClave: (k) => porClaveMap.get(k) || null,
    porCodigo: (cod) => (cod && porCodigoMap.get(cod)) || generico || null,
  };
}

async function contabilizarMovimiento(db, companyId, expense, tipoAsiento) {
  const resolver = await _resolver(db, companyId);
  const asiento = asientoDeMovimiento(expense, resolver, tipoAsiento); // valida balanceo
  const previo = await repo.buscarAsientoVivo(db, companyId, asiento.origen, asiento.origen_ref, tipoAsiento);
  if (previo) await repo.anularAsiento(db, previo.id);
  return repo.guardarAsiento(db, companyId, asiento);
}

async function descontabilizarMovimiento(db, companyId, origenRef) {
  await repo.ensureAsientosTables(db);
  const r = await db.query(
    "SELECT id FROM asientos WHERE company_id=$1 AND origen_ref=$2 AND estado<>'anulado'",
    [companyId, origenRef]
  );
  for (const row of r.rows) await repo.anularAsiento(db, row.id);
  return r.rows.length;
}

module.exports = { contabilizarMovimiento, descontabilizarMovimiento };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/contabilidad/contabilizar.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/contabilidad/contabilizar.js gastos/tests/contabilidad/contabilizar.test.js
git commit -m "feat(varas): contabilizador idempotente movimiento->asiento"
```

---

## Task 6: Reportes — Libro Diario y Libro Mayor

Consultas sobre los asientos vivos (no anulados), con filtro de período (reusa `periodoRange` de `expenses/query.js`).

**Files:**
- Create: `gastos/src/contabilidad/reportes.js`
- Test: `gastos/tests/contabilidad/reportes.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/contabilidad/reportes.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const cuentas = require('../../src/contabilidad/cuentas');
const { contabilizarMovimiento } = require('../../src/contabilidad/contabilizar');
const reportes = require('../../src/contabilidad/reportes');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';

async function seed(db) {
  await cuentas.sembrarCuentas(db, COMPANY);
  await contabilizarMovimiento(db, COMPANY, { id: 'e1', tipo: 'gasto', neto: 10000, iva: 1900, total: 11900, fecha: '2026-06-10', cuenta_sii_codigo: '4.3.10.1', proveedor: 'Sodimac' }, 'devengo');
  await contabilizarMovimiento(db, COMPANY, { id: 'e1', tipo: 'gasto', total: 11900, fecha: '2026-06-15', proveedor: 'Sodimac' }, 'pago');
}

test('libroDiario lista los asientos del período con sus líneas', async () => {
  const db = await makeDb(); await seed(db);
  const diario = await reportes.libroDiario(db, COMPANY, { periodo: '2026-06' });
  expect(diario.length).toBe(2); // devengo + pago
  for (const a of diario) {
    const sumD = a.lineas.reduce((s, l) => s + Number(l.debe), 0);
    const sumH = a.lineas.reduce((s, l) => s + Number(l.haber), 0);
    expect(sumD).toBe(sumH);
  }
});

test('libroMayor agrupa por cuenta con saldo', async () => {
  const db = await makeDb(); await seed(db);
  const mayor = await reportes.libroMayor(db, COMPANY, { periodo: '2026-06' });
  const prov = mayor.find((c) => c.clave === 'proveedores');
  // Devengo: haber 11900; Pago: debe 11900 -> saldo 0
  expect(Number(prov.debe)).toBe(11900);
  expect(Number(prov.haber)).toBe(11900);
  expect(Number(prov.saldo)).toBe(0);
  const banco = mayor.find((c) => c.clave === 'banco');
  expect(Number(banco.haber)).toBe(11900); // salió plata del banco
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/contabilidad/reportes.test.js`
Expected: FAIL — "Cannot find module".

- [ ] **Step 3: Write minimal implementation**

```javascript
// gastos/src/contabilidad/reportes.js
// Reportes contables de VARAS: consultas sobre asientos vivos (estado<>'anulado').
const { ensureAsientosTables } = require('./repo');
const { ensureCuentasTable } = require('./cuentas');
const { periodoRange } = require('../expenses/query');

function _rango(filtros = {}) {
  const p = periodoRange(filtros.periodo);
  return { from: p ? p.from : filtros.from, to: p ? p.to : filtros.to };
}

async function libroDiario(db, companyId, filtros = {}) {
  await ensureAsientosTables(db);
  const { from, to } = _rango(filtros);
  const where = ["a.company_id=$1", "a.estado<>'anulado'"]; const vals = [companyId];
  if (from) { vals.push(from); where.push(`a.fecha >= $${vals.length}`); }
  if (to) { vals.push(to); where.push(`a.fecha <= $${vals.length}`); }
  const cab = await db.query(
    `SELECT a.* FROM asientos a WHERE ${where.join(' AND ')} ORDER BY a.fecha ASC, a.created_at ASC`, vals
  );
  const out = [];
  for (const a of cab.rows) {
    const l = await db.query(
      `SELECT al.*, c.codigo, c.nombre AS cuenta_nombre, c.clave
       FROM asiento_lineas al LEFT JOIN cuentas c ON c.id = al.cuenta_id
       WHERE al.asiento_id=$1`, [a.id]
    );
    out.push({ ...a, lineas: l.rows });
  }
  return out;
}

async function libroMayor(db, companyId, filtros = {}) {
  await ensureAsientosTables(db); await ensureCuentasTable(db);
  const { from, to } = _rango(filtros);
  const where = ["a.company_id=$1", "a.estado<>'anulado'"]; const vals = [companyId];
  if (from) { vals.push(from); where.push(`a.fecha >= $${vals.length}`); }
  if (to) { vals.push(to); where.push(`a.fecha <= $${vals.length}`); }
  const r = await db.query(
    `SELECT c.id AS cuenta_id, c.codigo, c.nombre, c.clave, c.tipo,
            COALESCE(SUM(al.debe),0) AS debe, COALESCE(SUM(al.haber),0) AS haber
     FROM asiento_lineas al
     JOIN asientos a ON a.id = al.asiento_id
     LEFT JOIN cuentas c ON c.id = al.cuenta_id
     WHERE ${where.join(' AND ')}
     GROUP BY c.id, c.codigo, c.nombre, c.clave, c.tipo
     ORDER BY c.codigo ASC`, vals
  );
  return r.rows.map((row) => ({ ...row, saldo: Number(row.debe) - Number(row.haber) }));
}

module.exports = { libroDiario, libroMayor };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/contabilidad/reportes.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/contabilidad/reportes.js gastos/tests/contabilidad/reportes.test.js
git commit -m "feat(varas): reportes libro diario y libro mayor"
```

---

## Task 7: Reportes — Balance de Comprobación y Flujo de Caja

Balance = por cuenta con sumas debe/haber y saldo deudor/acreedor + verificación global `Σdebe==Σhaber`. Flujo = solo movimientos de Caja+Banco que vienen de asientos de pago (plata real).

**Files:**
- Modify: `gastos/src/contabilidad/reportes.js`
- Test: `gastos/tests/contabilidad/reportes.test.js`

- [ ] **Step 1: Write the failing test** (append)

```javascript
test('balanceComprobacion cuadra (Σdebe total == Σhaber total)', async () => {
  const db = await makeDb(); await seed(db);
  const bal = await reportes.balanceComprobacion(db, COMPANY, { periodo: '2026-06' });
  expect(bal.cuadrado).toBe(true);
  expect(Number(bal.totalDebe)).toBe(Number(bal.totalHaber));
  // cada fila trae saldo deudor o acreedor
  const prov = bal.cuentas.find((c) => c.clave === 'proveedores');
  expect(Number(prov.deudor) + Number(prov.acreedor)).toBe(0); // saldo 0 -> ambos 0
});

test('flujoCaja suma solo asientos de pago de Caja+Banco', async () => {
  const db = await makeDb(); await seed(db);
  const flujo = await reportes.flujoCaja(db, COMPANY, { periodo: '2026-06' });
  // El único movimiento de banco fue el pago (haber 11900) -> salida
  expect(Number(flujo.salidas)).toBe(11900);
  expect(Number(flujo.entradas)).toBe(0);
  expect(Number(flujo.neto)).toBe(-11900);
  expect(flujo.movimientos.length).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/contabilidad/reportes.test.js`
Expected: FAIL — `reportes.balanceComprobacion is not a function`.

- [ ] **Step 3: Write minimal implementation** (append a `reportes.js`, antes de `module.exports`, y actualiza el export)

```javascript
async function balanceComprobacion(db, companyId, filtros = {}) {
  const mayor = await libroMayor(db, companyId, filtros);
  let totalDebe = 0, totalHaber = 0;
  const cuentas = mayor.map((c) => {
    const debe = Number(c.debe), haber = Number(c.haber), saldo = debe - haber;
    totalDebe += debe; totalHaber += haber;
    return { ...c, deudor: saldo > 0 ? saldo : 0, acreedor: saldo < 0 ? -saldo : 0 };
  });
  return { cuentas, totalDebe, totalHaber, cuadrado: totalDebe === totalHaber };
}

async function flujoCaja(db, companyId, filtros = {}) {
  await ensureAsientosTables(db);
  const { from, to } = _rango(filtros);
  const where = ["a.company_id=$1", "a.estado<>'anulado'", "a.tipo_asiento='pago'", "c.clave IN ('caja','banco')"];
  const vals = [companyId];
  if (from) { vals.push(from); where.push(`a.fecha >= $${vals.length}`); }
  if (to) { vals.push(to); where.push(`a.fecha <= $${vals.length}`); }
  const r = await db.query(
    `SELECT a.id, a.fecha, a.glosa, al.debe, al.haber, c.clave
     FROM asiento_lineas al
     JOIN asientos a ON a.id = al.asiento_id
     LEFT JOIN cuentas c ON c.id = al.cuenta_id
     WHERE ${where.join(' AND ')}
     ORDER BY a.fecha ASC, a.created_at ASC`, vals
  );
  let entradas = 0, salidas = 0;
  const movimientos = r.rows.map((row) => {
    const entra = Number(row.debe), sale = Number(row.haber);
    entradas += entra; salidas += sale;
    return { id: row.id, fecha: row.fecha, glosa: row.glosa, entrada: entra, salida: sale };
  });
  return { entradas, salidas, neto: entradas - salidas, movimientos };
}
```

Actualiza el export: `module.exports = { libroDiario, libroMayor, balanceComprobacion, flujoCaja };`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/contabilidad/reportes.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/contabilidad/reportes.js gastos/tests/contabilidad/reportes.test.js
git commit -m "feat(varas): reportes balance de comprobacion y flujo de caja"
```

---

## Task 8: Enganchar el contabilizador al ciclo de vida del movimiento

VARAS "trabaja solo": al **confirmar** un gasto/ingreso nace el devengo; al **conciliar/pagar** nace el pago; al **anular** se descontabiliza; al **editar** se regenera el devengo. Se engancha en `app/router.js` (mismo lugar donde hoy se hace confirm/pagar/anular/editar).

**Files:**
- Modify: `gastos/src/app/router.js` (rutas existentes de confirmar, pagar, anular, editar, y `/match/confirmar`)
- Test: `gastos/tests/contabilidad/integracion.test.js` (nuevo)

> Nota de implementación: leer primero las rutas actuales en `gastos/src/app/router.js` (confirmExpense, markExpensePaid/markExpenseConciliada, annulExpense, updateExpense, `/match/confirmar`). Tras cada operación exitosa, llamar al contabilizador con el expense ya actualizado (usar `getExpense` para tener neto/iva/total/cuenta_sii vigentes). Envolver cada llamada en try/catch que loguee y NO rompa la respuesta al usuario (la contabilidad no debe tumbar el registro de un gasto).

- [ ] **Step 1: Write the failing test** (test de integración a nivel de funciones, sin HTTP)

```javascript
// gastos/tests/contabilidad/integracion.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const cuentas = require('../../src/contabilidad/cuentas');
const { aplicarContabilidad } = require('../../src/contabilidad/contabilizar');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';
const gasto = { id: 'e1', tipo: 'gasto', neto: 10000, iva: 1900, total: 11900, fecha: '2026-06-10', cuenta_sii_codigo: '4.3.10.1', proveedor: 'Sodimac' };

test('aplicarContabilidad("confirmar") crea el devengo; ("pagar") crea el pago; ("anular") descontabiliza', async () => {
  const db = await makeDb();
  await cuentas.sembrarCuentas(db, COMPANY);
  await aplicarContabilidad(db, COMPANY, gasto, 'confirmar');
  let vivos = await db.query("SELECT tipo_asiento FROM asientos WHERE company_id=$1 AND origen_ref='e1' AND estado<>'anulado'", [COMPANY]);
  expect(vivos.rows.map((r) => r.tipo_asiento).sort()).toEqual(['devengo']);

  await aplicarContabilidad(db, COMPANY, gasto, 'pagar');
  vivos = await db.query("SELECT tipo_asiento FROM asientos WHERE company_id=$1 AND origen_ref='e1' AND estado<>'anulado'", [COMPANY]);
  expect(vivos.rows.map((r) => r.tipo_asiento).sort()).toEqual(['devengo', 'pago']);

  await aplicarContabilidad(db, COMPANY, gasto, 'anular');
  vivos = await db.query("SELECT tipo_asiento FROM asientos WHERE company_id=$1 AND origen_ref='e1' AND estado<>'anulado'", [COMPANY]);
  expect(vivos.rows.length).toBe(0);
});

test('aplicarContabilidad nunca lanza aunque falle (no debe tumbar el flujo)', async () => {
  const db = await makeDb();
  // sin sembrar cuentas a propósito; igual no debe lanzar
  await expect(aplicarContabilidad(db, COMPANY, gasto, 'confirmar')).resolves.toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/contabilidad/integracion.test.js`
Expected: FAIL — `aplicarContabilidad is not a function`.

- [ ] **Step 3: Write minimal implementation** (append a `gastos/src/contabilidad/contabilizar.js`, actualizar export)

```javascript
// Fachada segura para enganchar al ciclo de vida del movimiento.
// accion: 'confirmar' -> devengo | 'pagar' -> pago | 'anular' -> descontabiliza | 'editar' -> regenera devengo
async function aplicarContabilidad(db, companyId, expense, accion) {
  try {
    if (accion === 'anular') return { ok: true, anulados: await descontabilizarMovimiento(db, companyId, expense.id) };
    if (accion === 'pagar') return { ok: true, asiento: await contabilizarMovimiento(db, companyId, expense, 'pago') };
    // 'confirmar' y 'editar' -> (re)genera el devengo
    return { ok: true, asiento: await contabilizarMovimiento(db, companyId, expense, 'devengo') };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

module.exports = { contabilizarMovimiento, descontabilizarMovimiento, aplicarContabilidad };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/contabilidad/integracion.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Enganchar en `app/router.js`**

Leer las rutas actuales y, tras la operación exitosa, llamar a `aplicarContabilidad` con el expense vigente (`getExpense`). Importar al tope: `const { aplicarContabilidad } = require('../contabilidad/contabilizar');`. Puntos de enganche:
- Ruta de **confirmar** gasto → `await aplicarContabilidad(db, req.auth.companyId, exp, 'confirmar')`.
- `PATCH /expenses/:id/pagar` y `/match/confirmar` (markExpensePaid/markExpenseConciliada) → `'pagar'`.
- Ruta de **anular** → `'anular'`.
- `PATCH` de **editar** → `'editar'`.

No cambiar la respuesta HTTP existente; la contabilidad va "a un lado".

- [ ] **Step 6: Run full backend suite**

Run: `cd gastos && npx jest`
Expected: PASS — toda la suite verde (los nuevos tests + los existentes sin regresión).

- [ ] **Step 7: Commit**

```bash
git add gastos/src/contabilidad/contabilizar.js gastos/tests/contabilidad/integracion.test.js gastos/src/app/router.js
git commit -m "feat(varas): contabilizacion automatica en el ciclo de vida del movimiento"
```

---

## Task 9: API de reportes en `/api/app`

Expone los 4 reportes read-only para que la app/panel los consuma. Auth = token empleado (ya existe `requireAuth`/`req.auth.companyId`).

**Files:**
- Modify: `gastos/src/app/router.js`
- Test: `gastos/tests/contabilidad/api.test.js` (nuevo)

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/contabilidad/api.test.js
const request = require('supertest');
const express = require('express');
require('express-async-errors');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { signToken } = require('../../src/auth/jwt');
const cuentas = require('../../src/contabilidad/cuentas');
const { contabilizarMovimiento } = require('../../src/contabilidad/contabilizar');
const { createAppRouter } = require('../../src/app/router');

const COMPANY = '11111111-1111-1111-1111-111111111111';
const EMP = '22222222-2222-2222-2222-222222222222';

async function makeApp() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await cuentas.sembrarCuentas(db, COMPANY);
  await contabilizarMovimiento(db, COMPANY, { id: 'e1', tipo: 'gasto', neto: 10000, iva: 1900, total: 11900, fecha: '2026-06-10', cuenta_sii_codigo: '4.3.10.1', proveedor: 'Sodimac' }, 'devengo');
  const app = express();
  app.use(express.json());
  app.use('/api/app', createAppRouter({ db }));
  const token = signToken({ kind: 'employee', companyId: COMPANY, employeeId: EMP, rol: 'empleado' });
  return { app, token };
}

test('GET /api/app/contabilidad/diario devuelve los asientos (auth)', async () => {
  const { app, token } = await makeApp();
  const r = await request(app).get('/api/app/contabilidad/diario?periodo=2026-06').set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(200);
  expect(Array.isArray(r.body.asientos)).toBe(true);
  expect(r.body.asientos.length).toBe(1);
});

test('GET /api/app/contabilidad/balance cuadra', async () => {
  const { app, token } = await makeApp();
  const r = await request(app).get('/api/app/contabilidad/balance?periodo=2026-06').set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(200);
  expect(r.body.cuadrado).toBe(true);
});

test('sin token -> 401', async () => {
  const { app } = await makeApp();
  const r = await request(app).get('/api/app/contabilidad/diario');
  expect(r.status).toBe(401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/contabilidad/api.test.js`
Expected: FAIL — status 404 (rutas no existen aún).

- [ ] **Step 3: Write minimal implementation**

En `gastos/src/app/router.js`, importar arriba: `const contaReportes = require('../contabilidad/reportes');`. Dentro de `createAppRouter`, **después** de `router.use(requireAuth, ...)` (donde ya están protegidas las demás rutas), agregar:

```javascript
  router.get('/contabilidad/diario', async (req, res) => {
    const asientos = await contaReportes.libroDiario(db, req.auth.companyId, req.query);
    res.json({ asientos });
  });
  router.get('/contabilidad/mayor', async (req, res) => {
    res.json({ cuentas: await contaReportes.libroMayor(db, req.auth.companyId, req.query) });
  });
  router.get('/contabilidad/balance', async (req, res) => {
    res.json(await contaReportes.balanceComprobacion(db, req.auth.companyId, req.query));
  });
  router.get('/contabilidad/flujo', async (req, res) => {
    res.json(await contaReportes.flujoCaja(db, req.auth.companyId, req.query));
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/contabilidad/api.test.js`
Expected: PASS (3 tests). Si `supertest` no está instalado, instalarlo como devDep: `cd gastos && npm i -D supertest` (revisar primero si ya está en `gastos/package.json`).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/app/router.js gastos/tests/contabilidad/api.test.js gastos/package.json gastos/package-lock.json
git commit -m "feat(varas): API read-only de reportes contables en /api/app"
```

---

## Task 10: Suite completa + cierre

- [ ] **Step 1: Run full backend suite**

Run: `cd gastos && npx jest`
Expected: PASS — toda la suite verde (los ~5 archivos nuevos de `tests/contabilidad/` + los existentes sin regresión).

- [ ] **Step 2: Verificar conteo y no-regresión**

Confirmar que el número de suites/tests subió respecto a la línea base (179+ previos) y que no hay rojos. Si algo de lo existente se rompió, arreglar la causa (no el test) antes de continuar.

- [ ] **Step 3: Commit final (si quedó algo suelto)**

```bash
git add -A && git commit -m "test(varas): suite F1 contabilidad base verde" || echo "nada que commitear"
```

---

## Notas de cierre de F1

- **NO desplegar** en esta fase salvo que el usuario lo pida. El deploy va con `deploy-gastos-wt.js` + `node scripts/migrate.js` en el VPS (la migración es aditiva e idempotente). La UI app/panel ("VARAS · Contabilidad") y el rebuild de APK quedan para cuando F1 esté validado o se haga junto con F2.
- **Pendiente para F2:** `match/canonical.js`, extensión de `engine.js` (tolerancia redondeo + similitud de glosa), `match/conciliacion.js` (6 partidas + SCA/SBA), `match/componer.js` (IA solo-anomalías con el system prompt de 5 bloques), leer saldo inicial/final en `ocr/cartola.js`, y el asiento de pago desde la confirmación de conciliación (ya enganchado vía `aplicarContabilidad(..., 'pagar')`).
- **UI (cuando se aborde):** sub-menú "VARAS · Contabilidad" en `MatchView.jsx` con 5 vistas + sección Contabilidad en el panel (`public/panel/`) con tablas + Excel (`exceljs`). Métodos nuevos en `gastos-app/src/gastos/api.js` para los 4 GET.
