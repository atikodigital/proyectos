# Hash IA v2-1 — Modelo de datos, clasificación IA y anti-duplicados (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar ingresos vs gastos (clasificados por IA) y detección de duplicados (bloqueo con override) al backend de Hash IA, sin romper el flujo actual.

**Architecture:** Se extiende la tabla `expenses` con campos nuevos (tipo, nro_operacion, image_hash, estado_pago, dedup_override, wa_sender_name, wa_sender_phone). El OCR (`extract`) clasifica gasto/ingreso. Un módulo nuevo `dedup.js` busca duplicados en 3 capas. `intake` calcula el hash de la imagen, consulta duplicados y, si hay uno fuerte sin override, **no inserta** y devuelve el existente. App y webhook se adaptan al nuevo contrato.

**Tech Stack:** Node/Express, jest, pg-mem v3 (Postgres en memoria), crypto (sha256), axios (Gemini).

---

## File Structure

- `gastos/src/db/schema.sql` — **Modify**: nuevas columnas en `expenses`.
- `gastos/src/db/migrate.js` — **Modify**: ALTER idempotente para la DB existente + índices de dedup.
- `gastos/src/expenses/hash.js` — **Create**: `imageHash(buffer)` sha256.
- `gastos/src/expenses/dedup.js` — **Create**: `findDuplicate(db, companyId, candidate)`.
- `gastos/src/ocr/gemini.js` — **Modify**: pedir `tipo` y `nro_operacion` en el prompt/JSON.
- `gastos/src/ocr/extract.js` — **Modify**: exponer `tipo`, `nro_operacion`; categoría para ingresos.
- `gastos/src/expenses/repo.js` — **Modify**: `FIELDS` y `EDITABLE` con campos nuevos.
- `gastos/src/expenses/intake.js` — **Modify**: hash + dedup + nuevo contrato `{ expense, duplicado }`.
- `gastos/src/app/router.js` — **Modify**: 409 en duplicado fuerte; acepta `override`.
- `gastos/src/whatsapp/format.js` — **Modify**: `formatDuplicateBlock`.
- `gastos/src/whatsapp/webhook.js` — **Modify**: captura remitente; bloquea duplicado; nuevo contrato.
- Tests nuevos/actualizados en `gastos/tests/**`.

**Nota de contrato (clave):** `intakeFromImage(...)` pasa de devolver el `expense` a devolver `{ expense, duplicado }`. `expense` es `null` cuando se bloquea un duplicado fuerte. Todos los callers (app router, webhook) y sus tests se actualizan en este plan.

---

### Task 1: Migración — columnas nuevas en `expenses`

**Files:**
- Modify: `gastos/src/db/schema.sql:25-51` (tabla expenses)
- Modify: `gastos/src/db/migrate.js`
- Test: `gastos/tests/migrate-v2.test.js` (crear)

- [ ] **Step 1: Escribir el test que falla**

Crear `gastos/tests/migrate-v2.test.js`:

```js
const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');

function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  return new pg.Pool();
}

test('migrate crea columnas v2 en expenses', async () => {
  const db = makeDb();
  await migrate(db);
  const c = await db.query(
    "INSERT INTO companies(nombre) VALUES('X') RETURNING id"
  );
  const companyId = c.rows[0].id;
  const r = await db.query(
    `INSERT INTO expenses(company_id, tipo, nro_operacion, image_hash, estado_pago, dedup_override, wa_sender_name, wa_sender_phone)
     VALUES($1,'ingreso','OP-123','abc', 'registrada', true, 'Juan', '56999')
     RETURNING tipo, nro_operacion, image_hash, estado_pago, dedup_override, wa_sender_name, wa_sender_phone`,
    [companyId]
  );
  expect(r.rows[0].tipo).toBe('ingreso');
  expect(r.rows[0].nro_operacion).toBe('OP-123');
  expect(r.rows[0].image_hash).toBe('abc');
  expect(r.rows[0].estado_pago).toBe('registrada');
  expect(r.rows[0].dedup_override).toBe(true);
  expect(r.rows[0].wa_sender_name).toBe('Juan');
  expect(r.rows[0].wa_sender_phone).toBe('56999');
});

test('expenses.tipo default es gasto', async () => {
  const db = makeDb();
  await migrate(db);
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const r = await db.query(
    `INSERT INTO expenses(company_id) VALUES($1) RETURNING tipo, estado_pago, dedup_override`,
    [c.rows[0].id]
  );
  expect(r.rows[0].tipo).toBe('gasto');
  expect(r.rows[0].estado_pago).toBe('registrada');
  expect(r.rows[0].dedup_override).toBe(false);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd gastos && npx jest tests/migrate-v2.test.js`
Expected: FAIL (columna `tipo` no existe).

- [ ] **Step 3: Agregar las columnas a `schema.sql`**

En `gastos/src/db/schema.sql`, dentro de `CREATE TABLE IF NOT EXISTS expenses (...)`, justo antes de la línea `raw_ocr      jsonb,` agregar:

```sql
  tipo         text NOT NULL DEFAULT 'gasto',
  nro_operacion text,
  image_hash   text,
  estado_pago  text NOT NULL DEFAULT 'registrada',
  dedup_override boolean NOT NULL DEFAULT false,
  wa_sender_name text,
  wa_sender_phone text,
```

- [ ] **Step 4: Agregar ALTER idempotente e índices de dedup en `migrate.js`**

Reemplazar el contenido de `gastos/src/db/migrate.js` por:

```js
const fs = require('fs');
const path = require('path');

function schemaSql() {
  return fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
}

// Índice parcial para dedup de mensajes de WhatsApp (no soportado por pg-mem).
const PARTIAL_INDEXES = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_wamsg
  ON expenses(company_id, wa_message_id)
  WHERE wa_message_id IS NOT NULL;
`;

// Columnas v2: en una DB existente (producción) CREATE TABLE IF NOT EXISTS es no-op,
// así que las agregamos con ALTER idempotente. En pg-mem ya vienen del schema.sql,
// por eso cada ALTER va en su propio try/catch tolerante.
const V2_COLUMNS = [
  "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'gasto'",
  "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS nro_operacion text",
  "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS image_hash text",
  "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS estado_pago text NOT NULL DEFAULT 'registrada'",
  "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS dedup_override boolean NOT NULL DEFAULT false",
  "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS wa_sender_name text",
  "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS wa_sender_phone text",
];

// Índices de dedup (no únicos: el override permite una 2ª fila a propósito).
const DEDUP_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_expenses_dedup_doc ON expenses(company_id, rut_emisor, folio)",
  "CREATE INDEX IF NOT EXISTS idx_expenses_dedup_op ON expenses(company_id, nro_operacion)",
  "CREATE INDEX IF NOT EXISTS idx_expenses_dedup_hash ON expenses(company_id, image_hash)",
];

async function migrate(db) {
  const statements = schemaSql()
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await db.query(stmt);
  }

  for (const stmt of V2_COLUMNS) {
    try { await db.query(stmt); } catch (e) { /* pg-mem: ya existen del schema */ }
  }
  for (const stmt of DEDUP_INDEXES) {
    try { await db.query(stmt); } catch (e) { /* tolerante */ }
  }

  try {
    await db.query(PARTIAL_INDEXES);
  } catch (e) {
    // pg-mem no soporta índices parciales — ok en tests
  }
}

module.exports = { migrate, schemaSql };
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd gastos && npx jest tests/migrate-v2.test.js`
Expected: PASS (2 tests).

- [ ] **Step 6: Correr toda la suite para no romper nada**

Run: `cd gastos && npx jest`
Expected: PASS (toda la suite previa sigue verde).

- [ ] **Step 7: Commit**

```bash
git add gastos/src/db/schema.sql gastos/src/db/migrate.js gastos/tests/migrate-v2.test.js
git commit -m "feat(gastos): columnas v2 en expenses (tipo, dedup, cobranzas) + indices"
```

---

### Task 2: `hash.js` — huella SHA-256 de la imagen

**Files:**
- Create: `gastos/src/expenses/hash.js`
- Test: `gastos/tests/hash.test.js`

- [ ] **Step 1: Escribir el test que falla**

Crear `gastos/tests/hash.test.js`:

```js
const { imageHash } = require('../src/expenses/hash');

test('misma imagen → mismo hash', () => {
  const a = imageHash(Buffer.from('foto-boleta'));
  const b = imageHash(Buffer.from('foto-boleta'));
  expect(a).toBe(b);
  expect(a).toMatch(/^[a-f0-9]{64}$/);
});

test('imágenes distintas → hashes distintos', () => {
  expect(imageHash(Buffer.from('A'))).not.toBe(imageHash(Buffer.from('B')));
});

test('buffer vacío o nulo → string vacío', () => {
  expect(imageHash(null)).toBe('');
  expect(imageHash(Buffer.alloc(0))).toBe('');
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd gastos && npx jest tests/hash.test.js`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar `hash.js`**

Crear `gastos/src/expenses/hash.js`:

```js
const crypto = require('crypto');

function imageHash(buffer) {
  if (!buffer || !buffer.length) return '';
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = { imageHash };
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd gastos && npx jest tests/hash.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/expenses/hash.js gastos/tests/hash.test.js
git commit -m "feat(gastos): hash sha256 de imagen para dedup"
```

---

### Task 3: `dedup.js` — detección de duplicados en 3 capas

**Files:**
- Create: `gastos/src/expenses/dedup.js`
- Test: `gastos/tests/dedup.test.js`

- [ ] **Step 1: Escribir el test que falla**

Crear `gastos/tests/dedup.test.js`:

```js
const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
const { createExpense } = require('../src/expenses/repo');
const { findDuplicate } = require('../src/expenses/dedup');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
async function company(db) {
  const r = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  return r.rows[0].id;
}

test('capa 1 gasto: mismo rut_emisor + folio → fuerte', async () => {
  const db = await makeDb();
  const cid = await company(db);
  await createExpense(db, { company_id: cid, tipo: 'gasto', rut_emisor: '76.111.111-1', folio: '1234', total: 5000 });
  const dup = await findDuplicate(db, cid, { tipo: 'gasto', rut_emisor: '76.111.111-1', folio: '1234' });
  expect(dup.nivel).toBe('fuerte');
  expect(dup.motivo).toBe('folio');
});

test('capa 1 ingreso: mismo nro_operacion → fuerte', async () => {
  const db = await makeDb();
  const cid = await company(db);
  await createExpense(db, { company_id: cid, tipo: 'ingreso', nro_operacion: 'OP-9', total: 9000 });
  const dup = await findDuplicate(db, cid, { tipo: 'ingreso', nro_operacion: 'OP-9' });
  expect(dup.nivel).toBe('fuerte');
  expect(dup.motivo).toBe('nro_operacion');
});

test('capa 2: mismo image_hash → fuerte', async () => {
  const db = await makeDb();
  const cid = await company(db);
  await createExpense(db, { company_id: cid, tipo: 'gasto', image_hash: 'deadbeef', total: 5000 });
  const dup = await findDuplicate(db, cid, { tipo: 'gasto', image_hash: 'deadbeef' });
  expect(dup.nivel).toBe('fuerte');
  expect(dup.motivo).toBe('imagen');
});

test('capa 3: mismo monto+fecha+proveedor → suave', async () => {
  const db = await makeDb();
  const cid = await company(db);
  await createExpense(db, { company_id: cid, tipo: 'gasto', total: 12000, fecha: '2026-06-01', proveedor: 'Sodimac' });
  const dup = await findDuplicate(db, cid, { tipo: 'gasto', total: 12000, fecha: '2026-06-01', proveedor: 'Sodimac' });
  expect(dup.nivel).toBe('suave');
});

test('no hay match → null', async () => {
  const db = await makeDb();
  const cid = await company(db);
  await createExpense(db, { company_id: cid, tipo: 'gasto', rut_emisor: '76.111.111-1', folio: '1', total: 5000 });
  const dup = await findDuplicate(db, cid, { tipo: 'gasto', rut_emisor: '99.999.999-9', folio: '2' });
  expect(dup).toBeNull();
});

test('un rechazado no cuenta como duplicado', async () => {
  const db = await makeDb();
  const cid = await company(db);
  const e = await createExpense(db, { company_id: cid, tipo: 'gasto', rut_emisor: '76.1-1', folio: '5', total: 5000 });
  await db.query("UPDATE expenses SET estado='rechazado' WHERE id=$1", [e.id]);
  const dup = await findDuplicate(db, cid, { tipo: 'gasto', rut_emisor: '76.1-1', folio: '5' });
  expect(dup).toBeNull();
});

test('aislado por empresa', async () => {
  const db = await makeDb();
  const c1 = await company(db);
  const c2 = await company(db);
  await createExpense(db, { company_id: c1, tipo: 'gasto', rut_emisor: '76.1-1', folio: '5', total: 5000 });
  const dup = await findDuplicate(db, c2, { tipo: 'gasto', rut_emisor: '76.1-1', folio: '5' });
  expect(dup).toBeNull();
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd gastos && npx jest tests/dedup.test.js`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar `dedup.js`**

Crear `gastos/src/expenses/dedup.js`:

```js
// Busca un movimiento existente que sea duplicado del candidato.
// Devuelve { nivel: 'fuerte'|'suave', motivo, existente } o null.
// Nunca considera filas en estado 'rechazado'. Acotado por company_id.
async function findDuplicate(db, companyId, c = {}) {
  // Capa 1 — documento (fuerte)
  if (c.tipo === 'ingreso') {
    if (c.nro_operacion) {
      const r = await db.query(
        "SELECT * FROM expenses WHERE company_id=$1 AND nro_operacion=$2 AND estado <> 'rechazado' ORDER BY created_at DESC LIMIT 1",
        [companyId, c.nro_operacion]
      );
      if (r.rows[0]) return { nivel: 'fuerte', motivo: 'nro_operacion', existente: r.rows[0] };
    }
  } else if (c.rut_emisor && c.folio) {
    const r = await db.query(
      "SELECT * FROM expenses WHERE company_id=$1 AND rut_emisor=$2 AND folio=$3 AND estado <> 'rechazado' ORDER BY created_at DESC LIMIT 1",
      [companyId, c.rut_emisor, c.folio]
    );
    if (r.rows[0]) return { nivel: 'fuerte', motivo: 'folio', existente: r.rows[0] };
  }

  // Capa 2 — imagen idéntica (fuerte)
  if (c.image_hash) {
    const r = await db.query(
      "SELECT * FROM expenses WHERE company_id=$1 AND image_hash=$2 AND estado <> 'rechazado' ORDER BY created_at DESC LIMIT 1",
      [companyId, c.image_hash]
    );
    if (r.rows[0]) return { nivel: 'fuerte', motivo: 'imagen', existente: r.rows[0] };
  }

  // Capa 3 — coincidencia probable (suave)
  if (c.total && c.fecha && c.proveedor) {
    const r = await db.query(
      "SELECT * FROM expenses WHERE company_id=$1 AND total=$2 AND fecha=$3 AND proveedor=$4 AND estado <> 'rechazado' ORDER BY created_at DESC LIMIT 1",
      [companyId, c.total, c.fecha, c.proveedor]
    );
    if (r.rows[0]) return { nivel: 'suave', motivo: 'monto_fecha_proveedor', existente: r.rows[0] };
  }

  return null;
}

module.exports = { findDuplicate };
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd gastos && npx jest tests/dedup.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/expenses/dedup.js gastos/tests/dedup.test.js
git commit -m "feat(gastos): dedup.js — duplicados en 3 capas (doc/imagen/probable)"
```

---

### Task 4: Clasificación gasto/ingreso en el OCR

**Files:**
- Modify: `gastos/src/ocr/gemini.js:20-29` (buildPrompt)
- Modify: `gastos/src/ocr/extract.js`
- Test: `gastos/tests/extract-tipo.test.js` (crear)

- [ ] **Step 1: Escribir el test que falla**

Crear `gastos/tests/extract-tipo.test.js`:

```js
jest.mock('../src/ocr/preprocess', () => ({ preprocessForOcr: async (b) => b }));
jest.mock('../src/ocr/documentai', () => ({ documentAiExtract: async () => ({}) }));
jest.mock('../src/ocr/gemini', () => ({ geminiExtract: jest.fn() }));

const { geminiExtract } = require('../src/ocr/gemini');
const { extractExpense } = require('../src/ocr/extract');

test('ingreso: tipo ingreso + nro_operacion + categoría Ingreso', async () => {
  geminiExtract.mockResolvedValue({
    tipo: 'ingreso', nro_operacion: 'OP-555', proveedor: 'Juan Pérez',
    fecha: '01/06/2026', total: 50000,
  });
  const r = await extractExpense({ imageBuffer: Buffer.from('x') });
  expect(r.tipo).toBe('ingreso');
  expect(r.nro_operacion).toBe('OP-555');
  expect(r.categoria).toBe('Ingreso');
  expect(r.cuenta_sii_codigo).toBe('');
});

test('gasto: tipo gasto por defecto y categoría SII', async () => {
  geminiExtract.mockResolvedValue({
    tipo: 'gasto', proveedor: 'Sodimac', fecha: '02/06/2026', total: 12000,
    categoria: 'Materiales y suministros',
  });
  const r = await extractExpense({ imageBuffer: Buffer.from('x') });
  expect(r.tipo).toBe('gasto');
  expect(r.nro_operacion).toBe('');
});

test('tipo desconocido → gasto', async () => {
  geminiExtract.mockResolvedValue({ proveedor: 'X', total: 1000 });
  const r = await extractExpense({ imageBuffer: Buffer.from('x') });
  expect(r.tipo).toBe('gasto');
});
```

> Nota: si `gastos/tests/` ya tiene un test de `extract` con `toEqual` sobre el objeto completo, actualízalo para incluir las claves nuevas `tipo` y `nro_operacion` (o cámbialo a `toMatchObject`).

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd gastos && npx jest tests/extract-tipo.test.js`
Expected: FAIL (`r.tipo` es undefined).

- [ ] **Step 3: Actualizar el prompt de Gemini**

En `gastos/src/ocr/gemini.js`, reemplazar la función `buildPrompt` por:

```js
function buildPrompt() {
  return [
    'Eres un extractor de datos de comprobantes chilenos (boletas, facturas y comprobantes de transferencia/depósito).',
    'Primero determina el campo tipo:',
    '- "gasto" si es una boleta o factura (un comercio nos cobra).',
    '- "ingreso" si es un comprobante de transferencia/depósito recibido (entra plata).',
    'Devuelve SOLO un JSON con estos campos:',
    'tipo (gasto|ingreso), tipo_documento (boleta|factura|transferencia|deposito|otro),',
    'rut_emisor, folio, nro_operacion (N° de operación/transacción si es transferencia),',
    'direccion_emisor, proveedor (para ingreso: nombre de quien paga/origen),',
    'fecha (dd/mm/aaaa), neto, iva, total (en pesos CLP enteros),',
    `categoria (una de: ${CATEGORIES.join(', ')}; solo para gasto), glosa (descripción corta).`,
    'Si un campo no aparece, usa "" o 0. No inventes montos.',
  ].join(' ');
}
```

- [ ] **Step 4: Exponer `tipo` y `nro_operacion` en `extract.js`**

En `gastos/src/ocr/extract.js`, reemplazar el bloque de categoría (líneas ~35-37) y el `return` por:

```js
  const tipo = String(gem.tipo || '').toLowerCase() === 'ingreso' ? 'ingreso' : 'gasto';
  const nro_operacion = String(gem.nro_operacion || '').trim();

  let categoria;
  let sii;
  if (tipo === 'ingreso') {
    categoria = 'Ingreso';
    sii = { codigo: '', nombre: '' };
  } else {
    categoria = String(gem.categoria || '').trim();
    if (!isValidCategory(categoria)) categoria = 'Otros gastos';
    sii = mapCategoryToSii(categoria);
  }

  // Confianza simple: cuántos campos clave salieron.
  const keys = [totals.total, proveedor, fecha, gem.rut_emisor];
  const got = keys.filter((k) => k && String(k).trim() !== '').length;
  const confianza = Math.round((got / keys.length) * 100);

  return {
    tipo,
    tipo_documento: String(gem.tipo_documento || 'otro').toLowerCase(),
    rut_emisor: gem.rut_emisor ? normalizeRut(gem.rut_emisor) : '',
    folio: String(gem.folio || '').trim(),
    nro_operacion,
    direccion_emisor: direccion,
    proveedor,
    fecha,
    neto: totals.neto,
    iva: totals.iva,
    total: totals.total,
    moneda: 'CLP',
    categoria,
    cuenta_sii_codigo: sii.codigo,
    cuenta_sii_nombre: sii.nombre,
    glosa: String(gem.glosa || '').trim(),
    confianza,
    raw_ocr: { docai, gemini: gem },
  };
```

(Elimina el bloque viejo de `let categoria = ...; if (!isValidCategory...)... const sii = ...` y el `return` anterior, reemplazados por lo de arriba.)

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd gastos && npx jest tests/extract-tipo.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Correr la suite completa**

Run: `cd gastos && npx jest`
Expected: PASS (si algún test viejo de extract usa `toEqual`, actualizarlo según la nota del Step 1).

- [ ] **Step 7: Commit**

```bash
git add gastos/src/ocr/gemini.js gastos/src/ocr/extract.js gastos/tests/extract-tipo.test.js
git commit -m "feat(gastos): OCR clasifica gasto/ingreso + nro_operacion"
```

---

### Task 5: `repo` + `intake` — persistir campos nuevos y aplicar dedup

**Files:**
- Modify: `gastos/src/expenses/repo.js:1-6` (FIELDS) y `:30-31` (EDITABLE)
- Modify: `gastos/src/expenses/intake.js`
- Test: `gastos/tests/intake-dedup.test.js` (crear)

- [ ] **Step 1: Escribir el test que falla**

Crear `gastos/tests/intake-dedup.test.js`:

```js
const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
const { intakeFromImage } = require('../src/expenses/intake');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
async function company(db) {
  const r = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  return r.rows[0].id;
}
const fakeExtract = (over = {}) => async () => ({
  tipo: 'gasto', tipo_documento: 'factura', rut_emisor: '76.1-1', folio: '1234',
  nro_operacion: '', direccion_emisor: '', proveedor: 'Sodimac', fecha: '2026-06-01',
  neto: 10000, iva: 1900, total: 11900, moneda: 'CLP', categoria: 'Otros gastos',
  cuenta_sii_codigo: '5', cuenta_sii_nombre: 'Gastos generales', glosa: '', confianza: 80,
  raw_ocr: {}, ...over,
});

test('intake crea movimiento con tipo, hash y sender', async () => {
  const db = await makeDb();
  const cid = await company(db);
  const { expense, duplicado } = await intakeFromImage({
    db, companyId: cid, imageBuffer: Buffer.from('foto1'),
    canal: 'whatsapp', waSenderName: 'Juan', waSenderPhone: '56999',
    extract: fakeExtract(),
  });
  expect(duplicado).toBeNull();
  expect(expense.tipo).toBe('gasto');
  expect(expense.image_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(expense.wa_sender_name).toBe('Juan');
  expect(expense.wa_sender_phone).toBe('56999');
});

test('duplicado fuerte sin override → no inserta, devuelve existente', async () => {
  const db = await makeDb();
  const cid = await company(db);
  await intakeFromImage({ db, companyId: cid, imageBuffer: Buffer.from('a'), extract: fakeExtract() });
  const { expense, duplicado } = await intakeFromImage({
    db, companyId: cid, imageBuffer: Buffer.from('b'), extract: fakeExtract(),
  });
  expect(expense).toBeNull();
  expect(duplicado.nivel).toBe('fuerte');
  const count = await db.query('SELECT count(*)::int AS n FROM expenses');
  expect(count.rows[0].n).toBe(1);
});

test('duplicado fuerte con override → inserta segunda fila con dedup_override', async () => {
  const db = await makeDb();
  const cid = await company(db);
  await intakeFromImage({ db, companyId: cid, imageBuffer: Buffer.from('a'), extract: fakeExtract() });
  const { expense } = await intakeFromImage({
    db, companyId: cid, imageBuffer: Buffer.from('b'), override: true, extract: fakeExtract(),
  });
  expect(expense).not.toBeNull();
  expect(expense.dedup_override).toBe(true);
  const count = await db.query('SELECT count(*)::int AS n FROM expenses');
  expect(count.rows[0].n).toBe(2);
});

test('duplicado suave → inserta igual y avisa', async () => {
  const db = await makeDb();
  const cid = await company(db);
  // primer gasto sin folio (no dispara capa 1), mismo monto+fecha+proveedor
  await intakeFromImage({ db, companyId: cid, imageBuffer: Buffer.from('a'), extract: fakeExtract({ folio: '', rut_emisor: '' }) });
  const { expense, duplicado } = await intakeFromImage({
    db, companyId: cid, imageBuffer: Buffer.from('b'), extract: fakeExtract({ folio: '', rut_emisor: '' }),
  });
  expect(expense).not.toBeNull();
  expect(duplicado.nivel).toBe('suave');
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd gastos && npx jest tests/intake-dedup.test.js`
Expected: FAIL (intake aún devuelve el expense crudo, no `{ expense, duplicado }`).

- [ ] **Step 3: Ampliar `FIELDS` y `EDITABLE` en `repo.js`**

En `gastos/src/expenses/repo.js`, reemplazar la constante `FIELDS` (líneas 1-6) por:

```js
const FIELDS = [
  'company_id', 'employee_id', 'wa_message_id', 'foto_path', 'canal',
  'tipo', 'tipo_documento', 'rut_emisor', 'proveedor', 'folio', 'nro_operacion',
  'direccion_emisor', 'fecha', 'neto', 'iva', 'total', 'moneda', 'categoria',
  'cuenta_sii_codigo', 'cuenta_sii_nombre', 'glosa', 'confianza', 'raw_ocr',
  'image_hash', 'estado_pago', 'dedup_override', 'wa_sender_name', 'wa_sender_phone',
];
```

Y reemplazar `EDITABLE` (líneas ~30-31) por:

```js
const EDITABLE = ['tipo', 'tipo_documento', 'rut_emisor', 'proveedor', 'folio', 'nro_operacion',
  'direccion_emisor', 'fecha', 'neto', 'iva', 'total', 'categoria', 'cuenta_sii_codigo', 'cuenta_sii_nombre', 'glosa'];
```

- [ ] **Step 4: Reescribir `intake.js` con dedup**

Reemplazar el contenido de `gastos/src/expenses/intake.js` por:

```js
const { extractExpense } = require('../ocr/extract');
const { createExpense } = require('./repo');
const { findDuplicate } = require('./dedup');
const { imageHash } = require('./hash');

// Devuelve { expense, duplicado }.
// - duplicado fuerte sin override: expense = null (no se inserta).
// - duplicado suave o fuerte con override: inserta y devuelve el duplicado encontrado.
// - sin duplicado: inserta y duplicado = null.
async function intakeFromImage({
  db, companyId, employeeId, imageBuffer, mimeType = 'image/jpeg', canal = 'whatsapp',
  waMessageId, fotoPath, extract, override = false, waSenderName, waSenderPhone,
}) {
  const run = extract || extractExpense;
  const extracted = await run({ imageBuffer, mimeType });
  const image_hash = imageHash(imageBuffer);
  const tipo = extracted.tipo === 'ingreso' ? 'ingreso' : 'gasto';

  const duplicado = await findDuplicate(db, companyId, {
    tipo,
    rut_emisor: extracted.rut_emisor,
    folio: extracted.folio,
    nro_operacion: extracted.nro_operacion,
    image_hash,
    total: extracted.total,
    fecha: extracted.fecha,
    proveedor: extracted.proveedor,
  });

  if (duplicado && duplicado.nivel === 'fuerte' && !override) {
    return { expense: null, duplicado };
  }

  const expense = await createExpense(db, {
    ...extracted,
    tipo,
    image_hash,
    company_id: companyId,
    employee_id: employeeId,
    canal,
    wa_message_id: waMessageId,
    foto_path: fotoPath,
    wa_sender_name: waSenderName,
    wa_sender_phone: waSenderPhone,
    dedup_override: !!(override && duplicado && duplicado.nivel === 'fuerte'),
  });

  return { expense, duplicado: duplicado || null };
}

module.exports = { intakeFromImage };
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd gastos && npx jest tests/intake-dedup.test.js`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add gastos/src/expenses/repo.js gastos/src/expenses/intake.js gastos/tests/intake-dedup.test.js
git commit -m "feat(gastos): intake aplica dedup y persiste campos v2 (contrato {expense,duplicado})"
```

---

### Task 6: App router — 409 en duplicado fuerte, acepta `override`

**Files:**
- Modify: `gastos/src/app/router.js:32-41` (POST /expenses)
- Test: `gastos/tests/app-dedup.test.js` (crear); actualizar tests previos de app si asumen el viejo retorno de intake.

- [ ] **Step 1: Escribir el test que falla**

Crear `gastos/tests/app-dedup.test.js`:

```js
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
const { createAppRouter } = require('../src/app/router');
const { createEmployee } = require('../src/companies/repo');
const { hashPassword } = require('../src/auth/password');

async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const cid = c.rows[0].id;
  const emp = await createEmployee(db, { company_id: cid, nombre: 'Jose', usuario: 'jose', password_hash: await hashPassword('p'), activo: true });
  const extract = async () => ({
    tipo: 'gasto', tipo_documento: 'factura', rut_emisor: '76.1-1', folio: '1', nro_operacion: '',
    proveedor: 'Sodimac', fecha: '2026-06-01', neto: 10000, iva: 1900, total: 11900,
    moneda: 'CLP', categoria: 'Otros gastos', cuenta_sii_codigo: '5', cuenta_sii_nombre: 'G', glosa: '', confianza: 80, raw_ocr: {},
  });
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/app', createAppRouter({ db, extractExpense: extract }));
  const login = await request(app).post('/api/app/login').send({ usuario: 'jose', password: 'p' });
  return { app, token: login.body.token, cid, db };
}
const img = Buffer.from('foto').toString('base64');

test('segunda carga del mismo doc → 409 duplicado', async () => {
  const { app, token } = await setup();
  const auth = (r) => r.set('Authorization', `Bearer ${token}`);
  const first = await auth(request(app).post('/api/app/expenses').send({ imageBase64: img }));
  expect(first.status).toBe(201);
  const second = await auth(request(app).post('/api/app/expenses').send({ imageBase64: img }));
  expect(second.status).toBe(409);
  expect(second.body.duplicado.nivel).toBe('fuerte');
});

test('override:true permite registrar igual → 201', async () => {
  const { app, token } = await setup();
  const auth = (r) => r.set('Authorization', `Bearer ${token}`);
  await auth(request(app).post('/api/app/expenses').send({ imageBase64: img }));
  const forced = await auth(request(app).post('/api/app/expenses').send({ imageBase64: img, override: true }));
  expect(forced.status).toBe(201);
  expect(forced.body.dedup_override).toBe(true);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd gastos && npx jest tests/app-dedup.test.js`
Expected: FAIL (hoy responde 201 siempre; `intake` devuelve otra forma).

- [ ] **Step 3: Actualizar el handler POST /expenses**

En `gastos/src/app/router.js`, reemplazar el handler `router.post('/expenses', ...)` (líneas 32-41) por:

```js
  router.post('/expenses', async (req, res) => {
    const { imageBase64, mimeType, override } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'falta_imagen' });
    const { expense, duplicado } = await intakeFromImage({
      db, companyId: req.auth.companyId, employeeId: req.auth.employeeId,
      imageBuffer: Buffer.from(imageBase64, 'base64'), mimeType: mimeType || 'image/jpeg',
      canal: 'app', extract: _extract, override: !!override,
    });
    if (!expense) return res.status(409).json({ error: 'duplicado', duplicado });
    return res.status(201).json({ ...expense, duplicado: duplicado || null });
  });
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd gastos && npx jest tests/app-dedup.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Correr la suite completa y reparar tests previos**

Run: `cd gastos && npx jest`
Expected: PASS. Si algún test previo de `app/router` o `intake` asumía el retorno antiguo de `intakeFromImage` (el expense directo), actualízalo: ahora el 201 del app devuelve el expense con un campo extra `duplicado`, y el intake devuelve `{ expense, duplicado }`.

- [ ] **Step 6: Commit**

```bash
git add gastos/src/app/router.js gastos/tests/app-dedup.test.js
git commit -m "feat(gastos): app responde 409 en duplicado fuerte y acepta override"
```

---

### Task 7: Webhook WhatsApp — captura remitente y bloquea duplicado

**Files:**
- Modify: `gastos/src/whatsapp/format.js` (agregar `formatDuplicateBlock`)
- Modify: `gastos/src/whatsapp/webhook.js:44-61` (sender + nuevo contrato)
- Test: `gastos/tests/webhook-dedup.test.js` (crear); actualizar webhook test previo si asume retorno viejo de intake.

- [ ] **Step 1: Escribir el test que falla**

Crear `gastos/tests/webhook-dedup.test.js`:

```js
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
const { createWebhookRouter } = require('../src/whatsapp/webhook');
const { createEmployee } = require('../src/companies/repo');

async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  const c = await db.query("INSERT INTO companies(nombre, wa_phone_number_id, wa_token) VALUES('X','PNID','TK') RETURNING id");
  const cid = c.rows[0].id;
  await createEmployee(db, { company_id: cid, nombre: 'Jose', phone: '56999', activo: true });
  const sent = [];
  const extract = async () => ({
    tipo: 'gasto', tipo_documento: 'factura', rut_emisor: '76.1-1', folio: '1', nro_operacion: '',
    proveedor: 'Sodimac', fecha: '2026-06-01', neto: 10000, iva: 1900, total: 11900,
    moneda: 'CLP', categoria: 'Otros gastos', cuenta_sii_codigo: '5', cuenta_sii_nombre: 'G', glosa: '', confianza: 80, raw_ocr: {},
  });
  const app = express();
  app.use(express.json());
  app.use('/wh', createWebhookRouter({
    db, sendText: async (m) => sent.push(m),
    downloadMedia: async () => ({ buffer: Buffer.from('foto'), mimeType: 'image/jpeg' }),
    extractExpense: extract,
  }));
  return { app, db, sent, cid };
}
function imageEvent(id) {
  return {
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: 'PNID' },
      contacts: [{ wa_id: '56999', profile: { name: 'Juan Pérez' } }],
      messages: [{ from: '56999', id, type: 'image', image: { id: 'media1' } }],
    } }] }],
  };
}

test('guarda wa_sender_name/phone del payload', async () => {
  const { app, db } = await setup();
  await request(app).post('/wh').send(imageEvent('m1'));
  const r = await db.query('SELECT wa_sender_name, wa_sender_phone FROM expenses LIMIT 1');
  expect(r.rows[0].wa_sender_name).toBe('Juan Pérez');
  expect(r.rows[0].wa_sender_phone).toBe('56999');
});

test('segunda imagen igual → no inserta y avisa duplicado', async () => {
  const { app, db, sent } = await setup();
  await request(app).post('/wh').send(imageEvent('m1'));
  await request(app).post('/wh').send(imageEvent('m2'));
  const count = await db.query('SELECT count(*)::int AS n FROM expenses');
  expect(count.rows[0].n).toBe(1);
  expect(sent[sent.length - 1].body).toMatch(/ya fue registrado|ya registrado|duplicad/i);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd gastos && npx jest tests/webhook-dedup.test.js`
Expected: FAIL.

- [ ] **Step 3: Agregar `formatDuplicateBlock` a `format.js`**

En `gastos/src/whatsapp/format.js`, antes de `module.exports`, agregar:

```js
function formatDuplicateBlock(e) {
  const cuando = e.created_at ? new Date(e.created_at).toLocaleDateString('es-CL') : 's/fecha';
  return (
    `⚠️ Esto ya fue registrado (${e.proveedor || 's/proveedor'} · ${fmtClp(e.total)} · ${e.fecha || 's/fecha'}) el ${cuando}. ` +
    `No lo registré de nuevo para no duplicar el pago. Si de verdad es otro, avísale al dueño.`
  );
}
```

Y cambiar la línea de export a:

```js
module.exports = { formatConfirmation, formatSummary, formatDuplicateBlock, fmtClp };
```

- [ ] **Step 4: Actualizar el bloque de imagen del webhook**

En `gastos/src/whatsapp/webhook.js`:

(a) En el import de format (línea 7), agregar `formatDuplicateBlock`:

```js
const { formatConfirmation, formatSummary, formatDuplicateBlock } = require('./format');
```

(b) Dentro de `router.post('/', ...)`, tras obtener `const value = ch.value || {};` (línea ~36), agregar el helper de contactos:

```js
        const contacts = value.contacts || [];
        const senderName = (waid) => {
          const c = contacts.find((x) => x.wa_id === waid);
          return (c && c.profile && c.profile.name) || '';
        };
```

(c) Reemplazar el bloque `if (msg.type === 'image' && msg.image?.id) { ... }` (líneas 52-61) por:

```js
          if (msg.type === 'image' && msg.image?.id) {
            const media = await _download({ mediaId: msg.image.id, token: company.wa_token });
            const { expense, duplicado } = await intakeFromImage({
              db, companyId: company.id, employeeId: employee.id,
              imageBuffer: media.buffer, mimeType: media.mimeType, canal: 'whatsapp',
              waMessageId: msg.id, fotoPath: null, extract: _extract,
              waSenderName: senderName(msg.from), waSenderPhone: msg.from,
            });
            if (!expense) {
              await reply(formatDuplicateBlock(duplicado.existente));
              continue;
            }
            const aviso = duplicado && duplicado.nivel === 'suave'
              ? '\n⚠️ Hay algo muy parecido ya registrado; revisa que no sea repetido.'
              : '';
            await reply(formatConfirmation(expense) + aviso);
            continue;
          }
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd gastos && npx jest tests/webhook-dedup.test.js`
Expected: PASS (2 tests).

- [ ] **Step 6: Correr la suite completa y reparar el webhook test previo**

Run: `cd gastos && npx jest`
Expected: PASS. Si el test previo del webhook (carga de imagen feliz) fallaba por el nuevo contrato, su aserción sigue válida (se sigue respondiendo con `formatConfirmation`); no debería requerir cambios. Si algún test mockeaba `intakeFromImage` devolviendo el expense directo, ajústalo a `{ expense, duplicado: null }`.

- [ ] **Step 7: Commit**

```bash
git add gastos/src/whatsapp/format.js gastos/src/whatsapp/webhook.js gastos/tests/webhook-dedup.test.js
git commit -m "feat(gastos): webhook captura remitente WhatsApp y bloquea duplicados"
```

---

## Self-Review

**Spec coverage (v2-1 alcance):**
- Clasificación gasto/ingreso (IA sugiere) → Task 4. ✅ (la confirmación del usuario es UI, va en v2-2/app).
- Anti-duplicados 3 capas + bloqueo con override → Tasks 3, 5, 6. ✅
- Campo `estado_pago` y `dedup_override` (datos) → Task 1. ✅ (marcar "pagada" desde el panel va en v2-2).
- `nro_operacion`, `image_hash` → Tasks 1, 4, 5. ✅
- Cobranzas: `wa_sender_name/phone` + pagador (`proveedor`) → Tasks 1, 4, 7. ✅
- Fechas emisión/carga → ya existen (`fecha`, `created_at`); el filtro por período es panel/Excel → **v2-2**.
- WhatsApp resumen, panel/Excel, matikoapp, rebrand → **v2-2 / v2-3** (fuera de este plan).

**Placeholder scan:** sin TBD/TODO; todo el código está completo en los steps.

**Type consistency:** contrato `{ expense, duplicado }` usado igual en intake (Task 5), app router (Task 6) y webhook (Task 7). `findDuplicate` devuelve `{ nivel, motivo, existente }` y se consume con esos nombres. `imageHash` usado en intake. `FIELDS`/`EDITABLE` incluyen los campos que intake escribe.

**Nota de regresión:** cualquier test previo que asumía `intakeFromImage` → expense directo debe pasar a `{ expense, duplicado }` (Steps 5/6 de Tasks 5-7 lo cubren).
