# CRM-chat del panel web (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Tasks 1-5 son TDD (RED→GREEN→commit). Tasks 6-7 son **checklist + verificación visual en Chrome** (el panel es HTML estático, sin tests automáticos). Steps con checkbox (`- [ ]`).

**Goal:** Construir el CRM-chat de 3 paneles (lista de conversaciones · hilo · ficha del contacto con editar + crear pedido + captura + responder por WhatsApp) en la pestaña CRM del panel web, hoy un placeholder.

**Architecture:** Backend nuevo mínimo montado en el **router del panel** (`createPanelRouter`, `/api/panel`, auth `requireKind('user')`): tabla `contactos` editable + endpoints ficha/responder, reusando `chatRepo` y `suggestOrder`. UI **vanilla** en `gastos/public/panel/index.html` + `lib.js` (el panel no usa React; replica el patrón del protocolo de agentes en vanilla).

**Tech Stack:** Node + Express + Postgres (jest + pg-mem) en `gastos/`. Panel HTML estático (Tailwind CDN, vanilla JS, `apiFetch`→`/api/panel`, deploy SFTP). WhatsApp Cloud API (`whatsapp/client.sendText`).

**⚠️ Reglas:** branch `master`. `git add` SOLO los archivos de cada task. NUNCA `git add -A`. El panel `index.html`/`lib.js` es de **Antigravity** (pausó el panel) → avisar al terminar; insertar, no reestructurar. Tests backend desde `gastos/`.

---

### Task 1: Tabla `contactos` + repo

Tabla editable por contacto (email/ubicación/notas), idempotente. No toca `chat_mensajes`.

**Files:**
- Modify: `gastos/src/db/migrate.js` (agregar DDL idempotente)
- Create: `gastos/src/chat/contactos-repo.js`
- Test: `gastos/tests/chat/contactos-repo.test.js`

- [ ] **Step 1: Write the failing test**

Crea `gastos/tests/chat/contactos-repo.test.js`:

```js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { getContacto, upsertContacto } = require('../../src/chat/contactos-repo');

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

test('getContacto sin registro → {}', async () => {
  const db = await freshDb();
  expect(await getContacto(db, CO, 'whatsapp', '56999')).toEqual({});
});

test('upsert crea y luego actualiza (mismo contacto)', async () => {
  const db = await freshDb();
  await upsertContacto(db, CO, 'whatsapp', '56999', { email: 'a@a.cl', ubicacion: 'Stgo', notas: 'cliente top' });
  let c = await getContacto(db, CO, 'whatsapp', '56999');
  expect(c.email).toBe('a@a.cl'); expect(c.ubicacion).toBe('Stgo'); expect(c.notas).toBe('cliente top');
  await upsertContacto(db, CO, 'whatsapp', '56999', { email: 'b@b.cl' });
  c = await getContacto(db, CO, 'whatsapp', '56999');
  expect(c.email).toBe('b@b.cl'); expect(c.ubicacion).toBe('Stgo'); // no se borra lo no enviado
});

test('scoped por empresa', async () => {
  const db = await freshDb();
  await upsertContacto(db, CO, 'whatsapp', '56999', { email: 'a@a.cl' });
  const otra = '00000000-0000-0000-0000-0000000000bb';
  expect(await getContacto(db, otra, 'whatsapp', '56999')).toEqual({});
});
```

- [ ] **Step 2: Run test → FAIL**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/chat/contactos-repo.test.js 2>&1 | tail -20`
Expected: FAIL — `Cannot find module '../../src/chat/contactos-repo'`.

- [ ] **Step 3: Implement**

(a) En `gastos/src/db/migrate.js`, busca el array de DDL idempotentes existente (p. ej. `MEMORY_DDL` o donde haya `CREATE TABLE IF NOT EXISTS`). Agrega un DDL nuevo para `contactos` y asegúrate de que se ejecute en `migrate` junto a los demás. Si hay un array tipo `const X_DDL = [ ... ]` que se recorre, agrega ahí; si no, agrega un bloque `await db.query("CREATE TABLE IF NOT EXISTS ...")` dentro de `migrate`. El DDL:
```sql
CREATE TABLE IF NOT EXISTS contactos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  channel text NOT NULL,
  contact_key text NOT NULL,
  email text,
  ubicacion text,
  notas text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contactos_uniq ON contactos(company_id, channel, contact_key);
```
(Lee migrate.js para seguir su patrón exacto — algunos DDL están como strings en un array que se itera.)

(b) Crea `gastos/src/chat/contactos-repo.js` (reusa `makeKey` de chat/repo para la clave):
```js
const { makeKey } = require('./repo');

async function getContacto(db, companyId, channel, contact) {
  const key = makeKey(channel, contact);
  const r = await db.query(
    'SELECT email, ubicacion, notas FROM contactos WHERE company_id=$1 AND channel=$2 AND contact_key=$3',
    [companyId, String(channel || 'whatsapp').toLowerCase(), key]
  );
  return r.rows[0] || {};
}

async function upsertContacto(db, companyId, channel, contact, patch = {}) {
  const key = makeKey(channel, contact);
  const ch = String(channel || 'whatsapp').toLowerCase();
  const prev = await getContacto(db, companyId, channel, contact);
  const exists = await db.query('SELECT id FROM contactos WHERE company_id=$1 AND channel=$2 AND contact_key=$3', [companyId, ch, key]);
  const next = {
    email: patch.email !== undefined ? patch.email : (prev.email || null),
    ubicacion: patch.ubicacion !== undefined ? patch.ubicacion : (prev.ubicacion || null),
    notas: patch.notas !== undefined ? patch.notas : (prev.notas || null),
  };
  if (exists.rows[0]) {
    await db.query('UPDATE contactos SET email=$4, ubicacion=$5, notas=$6, updated_at=now() WHERE company_id=$1 AND channel=$2 AND contact_key=$3',
      [companyId, ch, key, next.email, next.ubicacion, next.notas]);
  } else {
    await db.query('INSERT INTO contactos(company_id, channel, contact_key, email, ubicacion, notas) VALUES($1,$2,$3,$4,$5,$6)',
      [companyId, ch, key, next.email, next.ubicacion, next.notas]);
  }
  return next;
}

module.exports = { getContacto, upsertContacto };
```

- [ ] **Step 4: Run test → PASS**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/chat/contactos-repo.test.js 2>&1 | tail -20`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD   # master
git add gastos/src/db/migrate.js gastos/src/chat/contactos-repo.js gastos/tests/chat/contactos-repo.test.js
git commit -m "feat(crm): tabla contactos + repo (getContacto/upsertContacto)"
```

---

### Task 2: `fichaContacto` (derivado) + `GET /chat/contacto`

Builder puro de la ficha derivada (de los mensajes) + endpoint en el panel router que mergea derivado + editable.

**Files:**
- Create: `gastos/src/chat/ficha.js`
- Modify: `gastos/src/panel/router.js`
- Test: `gastos/tests/chat/ficha.test.js`, `gastos/tests/panel/chat-contacto-route.test.js`

- [ ] **Step 1: Write the failing test (puro)**

Crea `gastos/tests/chat/ficha.test.js`:
```js
const { fichaDerivada, telefonoDeContacto } = require('../../src/chat/ficha');

test('telefonoDeContacto extrae número si parece teléfono', () => {
  expect(telefonoDeContacto('+56 9 9999 1111')).toBe('+56999991111');
  expect(telefonoDeContacto('Mike Banner')).toBe('');
});

test('fichaDerivada de los mensajes', () => {
  const msgs = [
    { contact: '56999', channel: 'whatsapp', text: 'hola', created_at: '2026-02-24T10:00:00Z' },
    { contact: '56999', channel: 'whatsapp', text: 'chau', created_at: '2026-03-04T22:10:00Z' },
  ];
  const f = fichaDerivada(msgs);
  expect(f.nombre).toBe('56999');
  expect(f.channel).toBe('whatsapp');
  expect(f.telefono).toBe('56999');
  expect(f.nMensajes).toBe(2);
  expect(f.primerContacto).toBe('2026-02-24T10:00:00Z');
  expect(f.ultimoContacto).toBe('2026-03-04T22:10:00Z');
});

test('fichaDerivada vacía no rompe', () => {
  expect(fichaDerivada([])).toEqual({ nombre: '', channel: '', telefono: '', nMensajes: 0, primerContacto: null, ultimoContacto: null });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/chat/ficha.test.js 2>&1 | tail -20`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implement `ficha.js`**

Crea `gastos/src/chat/ficha.js`:
```js
function telefonoDeContacto(contact) {
  const d = String(contact || '').replace(/[^0-9+]/g, '');
  return d.replace(/[^0-9]/g, '').length >= 8 ? d : '';
}

function fichaDerivada(mensajes) {
  const arr = Array.isArray(mensajes) ? mensajes : [];
  if (!arr.length) return { nombre: '', channel: '', telefono: '', nMensajes: 0, primerContacto: null, ultimoContacto: null };
  const fechas = arr.map((m) => m.created_at).filter(Boolean).sort();
  const last = arr[arr.length - 1];
  return {
    nombre: last.contact || '',
    channel: last.channel || '',
    telefono: telefonoDeContacto(last.contact),
    nMensajes: arr.length,
    primerContacto: fechas[0] || null,
    ultimoContacto: fechas[fechas.length - 1] || null,
  };
}

module.exports = { fichaDerivada, telefonoDeContacto };
```

- [ ] **Step 4: Run → PASS**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/chat/ficha.test.js 2>&1 | tail -20`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing route test**

Crea `gastos/tests/panel/chat-contacto-route.test.js`. LEE primero un test existente del panel router (busca con `grep -rl createPanelRouter gastos/tests`) para copiar EXACTO cómo montan la app (`createPanelRouter`), crean el `user` (kind 'user', login `/api/panel/login`) y el pg-mem. Estructura:
```js
process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { hashPassword } = require('../../src/auth/password');
const { createPanelRouter } = require('../../src/panel/router');
const chatRepo = require('../../src/chat/repo');

async function freshDb() { /* ...igual que el test de panel router existente... */ }
async function seedUser(db) { /* INSERT companies + users(kind user) con password, devolver {companyId} */ }
async function token(a) { return (await request(a).post('/api/panel/login').send({ email: 'd@d.cl', password: 'clave' })).body.token; }
function app(db) { const a = express(); a.use(express.json()); a.use('/api/panel', createPanelRouter({ db })); return a; }

describe('GET /api/panel/chat/contacto', () => {
  test('401 sin token', async () => {
    const db = await freshDb(); await seedUser(db);
    await request(app(db)).get('/api/panel/chat/contacto?channel=whatsapp&contact=56999').expect(401);
  });
  test('deriva primer/último/nMensajes + merge editable', async () => {
    const db = await freshDb(); const { companyId } = await seedUser(db); const a = app(db); const t = await token(a);
    await chatRepo.addMensaje(db, companyId, { channel: 'whatsapp', contact: '56999', text: 'hola' });
    await chatRepo.addMensaje(db, companyId, { channel: 'whatsapp', contact: '56999', text: 'chau' });
    const res = await request(a).get('/api/panel/chat/contacto?channel=whatsapp&contact=56999').set('Authorization', `Bearer ${t}`).expect(200);
    expect(res.body.nMensajes).toBe(2);
    expect(res.body.telefono).toBe('56999');
    expect(res.body.email === null || res.body.email === undefined).toBe(true);
  });
});
```
> El helper `seedUser` debe crear un registro en la tabla `users` (kind 'user') con `getUserByEmail`/`hashPassword` como hace el panel router. Copia el patrón del test de panel existente.

- [ ] **Step 6: Run → FAIL**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/panel/chat-contacto-route.test.js 2>&1 | tail -25`
Expected: FAIL — 404 en `/chat/contacto`.

- [ ] **Step 7: Implement endpoint**

En `gastos/src/panel/router.js`:
- Requires arriba: `const chatRepo = require('../chat/repo');`, `const contactosRepo = require('../chat/contactos-repo');`, `const { fichaDerivada } = require('../chat/ficha');` (si alguno ya está, no dupliques).
- Agrega DENTRO de `createPanelRouter`, después de `router.use(requireAuth, requireKind('user'))` (junto a otras rutas):
```js
  router.get('/chat/contacto', async (req, res) => {
    const { channel, contact } = req.query;
    const msgs = await chatRepo.listMensajes(db, req.auth.companyId, channel, contact);
    const ficha = fichaDerivada(msgs);
    const editable = await contactosRepo.getContacto(db, req.auth.companyId, channel, contact);
    return res.json({ ...ficha, email: editable.email || null, ubicacion: editable.ubicacion || null, notas: editable.notas || null });
  });
```

- [ ] **Step 8: Run → PASS**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/panel/chat-contacto-route.test.js tests/chat/ficha.test.js 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git add gastos/src/chat/ficha.js gastos/src/panel/router.js gastos/tests/chat/ficha.test.js gastos/tests/panel/chat-contacto-route.test.js
git commit -m "feat(crm): fichaDerivada + GET /api/panel/chat/contacto (derivado + editable)"
```

---

### Task 3: `PATCH /chat/contacto`

Editar email/ubicación/notas del contacto.

**Files:**
- Modify: `gastos/src/panel/router.js`
- Test: `gastos/tests/panel/chat-contacto-route.test.js` (agregar)

- [ ] **Step 1: Write the failing test**

Agrega al describe de `chat-contacto-route.test.js`:
```js
test('PATCH guarda email/ubicacion/notas y GET los devuelve', async () => {
  const db = await freshDb(); const { companyId } = await seedUser(db); const a = app(db); const t = await token(a);
  await chatRepo.addMensaje(db, companyId, { channel: 'whatsapp', contact: '56999', text: 'hola' });
  await request(a).patch('/api/panel/chat/contacto').set('Authorization', `Bearer ${t}`)
    .send({ channel: 'whatsapp', contact: '56999', email: 'c@c.cl', ubicacion: 'Valpo', notas: 'paga al toque' }).expect(200);
  const res = await request(a).get('/api/panel/chat/contacto?channel=whatsapp&contact=56999').set('Authorization', `Bearer ${t}`).expect(200);
  expect(res.body.email).toBe('c@c.cl'); expect(res.body.ubicacion).toBe('Valpo'); expect(res.body.notas).toBe('paga al toque');
});
```

- [ ] **Step 2: Run → FAIL**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/panel/chat-contacto-route.test.js -t "PATCH" 2>&1 | tail -20`
Expected: FAIL — 404 en PATCH.

- [ ] **Step 3: Implement**

En `gastos/src/panel/router.js`, junto al GET `/chat/contacto`:
```js
  router.patch('/chat/contacto', async (req, res) => {
    const { channel, contact, email, ubicacion, notas } = req.body || {};
    const out = await contactosRepo.upsertContacto(db, req.auth.companyId, channel, contact, { email, ubicacion, notas });
    return res.json(out);
  });
```

- [ ] **Step 4: Run → PASS**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/panel/chat-contacto-route.test.js 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git add gastos/src/panel/router.js gastos/tests/panel/chat-contacto-route.test.js
git commit -m "feat(crm): PATCH /api/panel/chat/contacto (editar email/ubicacion/notas)"
```

---

### Task 4: `POST /chat/responder` (WhatsApp)

Responder por WhatsApp (sendText inyectable) y guardar el mensaje `out`. Otros canales → error claro.

**Files:**
- Modify: `gastos/src/panel/router.js`
- Test: `gastos/tests/panel/chat-responder-route.test.js`

- [ ] **Step 1: Write the failing test**

Crea `gastos/tests/panel/chat-responder-route.test.js` (mismo montaje que el test de Task 2, pero inyectando `sendText` mock y seteando WhatsApp en la empresa):
```js
// ...mismo freshDb/seedUser/token, pero:
// seedUser debe además setear la config WhatsApp de la empresa (wa_phone_number_id, wa_token, owner_whatsapp)
//   en la tabla companies (revisa getCompanyWa en src/companies/repo.js para saber las columnas exactas).
const sendText = jest.fn().mockResolvedValue({ ok: true });
function appWa(db) { const a = express(); a.use(express.json()); a.use('/api/panel', createPanelRouter({ db, sendText })); return a; }

describe('POST /api/panel/chat/responder', () => {
  test('whatsapp ok: envía y guarda mensaje out', async () => {
    const db = await freshDb(); const { companyId } = await seedUser(db, { wa: true }); const a = appWa(db); const t = await token(a);
    const res = await request(a).post('/api/panel/chat/responder').set('Authorization', `Bearer ${t}`)
      .send({ channel: 'whatsapp', contact: '56999', text: 'gracias!' }).expect(200);
    expect(sendText).toHaveBeenCalled();
    const msgs = await chatRepo.listMensajes(db, companyId, 'whatsapp', '56999');
    expect(msgs.some((m) => m.direccion === 'out' && m.text === 'gracias!')).toBe(true);
  });
  test('canal no whatsapp → 400 canal_no_soportado', async () => {
    const db = await freshDb(); await seedUser(db, { wa: true }); const a = appWa(db); const t = await token(a);
    const res = await request(a).post('/api/panel/chat/responder').set('Authorization', `Bearer ${t}`)
      .send({ channel: 'messenger', contact: 'x', text: 'hola' }).expect(400);
    expect(res.body.error).toBe('canal_no_soportado');
  });
  test('sin whatsapp configurado → 400 whatsapp_no_configurado', async () => {
    const db = await freshDb(); await seedUser(db, { wa: false }); const a = appWa(db); const t = await token(a);
    const res = await request(a).post('/api/panel/chat/responder').set('Authorization', `Bearer ${t}`)
      .send({ channel: 'whatsapp', contact: '56999', text: 'hola' }).expect(400);
    expect(res.body.error).toBe('whatsapp_no_configurado');
  });
});
```
> `seedUser(db,{wa})` debe insertar/actualizar en `companies` las columnas que lee `getCompanyWa` (wa_phone_number_id, wa_token, owner_whatsapp) cuando `wa:true`. Mira `getCompanyWa` en `src/companies/repo.js` para los nombres exactos.

- [ ] **Step 2: Run → FAIL**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/panel/chat-responder-route.test.js 2>&1 | tail -25`
Expected: FAIL — 404 en responder.

- [ ] **Step 3: Implement**

En `gastos/src/panel/router.js` (agrega require `const { getCompanyWa } = require('../companies/repo');` si no está; ya hay `const { telefonoDeContacto } = require('../chat/ficha');`? si no, agrégalo). Endpoint:
```js
  router.post('/chat/responder', async (req, res) => {
    const { channel, contact, text } = req.body || {};
    if (!text || !String(text).trim()) return res.status(400).json({ error: 'sin_texto' });
    if (String(channel).toLowerCase() !== 'whatsapp') return res.status(400).json({ error: 'canal_no_soportado' });
    const wa = await getCompanyWa(db, req.auth.companyId);
    if (!wa || !wa.wa_phone_number_id || !wa.wa_token) return res.status(400).json({ error: 'whatsapp_no_configurado' });
    const to = telefonoDeContacto(contact).replace(/[^0-9]/g, '');
    if (!to) return res.status(400).json({ error: 'sin_telefono' });
    try {
      await _sendText({ to, body: String(text), token: wa.wa_token, phoneNumberId: wa.wa_phone_number_id });
    } catch (e) { return res.status(502).json({ error: 'envio_falla' }); }
    const m = await chatRepo.addMensaje(db, req.auth.companyId, { channel: 'whatsapp', contact, text, direccion: 'out', source: 'panel' });
    return res.json(m);
  });
```
(`_sendText` ya está definido al inicio de `createPanelRouter` como `sendText || realWaClient.sendText`.)

- [ ] **Step 4: Run → PASS**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/panel/chat-responder-route.test.js 2>&1 | tail -25`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git add gastos/src/panel/router.js gastos/tests/panel/chat-responder-route.test.js
git commit -m "feat(crm): POST /api/panel/chat/responder (WhatsApp out; canal/no-config → 400)"
```

---

### Task 5: Montar lista/hilo/pedido-suggest en el panel router

El panel necesita `GET /chat/conversaciones`, `GET /chat/conversacion` y `POST /overlay/pedido/suggest` bajo `/api/panel`.

**Files:**
- Modify: `gastos/src/panel/router.js`
- Test: `gastos/tests/panel/chat-listas-route.test.js`

- [ ] **Step 1: Write the failing test**

Crea `gastos/tests/panel/chat-listas-route.test.js` (mismo montaje):
```js
describe('chat listas en panel', () => {
  test('GET /chat/conversaciones devuelve la lista (scoped)', async () => {
    const db = await freshDb(); const { companyId } = await seedUser(db); const a = app(db); const t = await token(a);
    await chatRepo.addMensaje(db, companyId, { channel: 'whatsapp', contact: '56999', text: 'hola' });
    const res = await request(a).get('/api/panel/chat/conversaciones').set('Authorization', `Bearer ${t}`).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].contact).toBe('56999');
  });
  test('GET /chat/conversacion devuelve los mensajes', async () => {
    const db = await freshDb(); const { companyId } = await seedUser(db); const a = app(db); const t = await token(a);
    await chatRepo.addMensaje(db, companyId, { channel: 'whatsapp', contact: '56999', text: 'hola' });
    const res = await request(a).get('/api/panel/chat/conversacion?channel=whatsapp&contact=56999').set('Authorization', `Bearer ${t}`).expect(200);
    expect(res.body.length).toBe(1);
  });
  test('401 sin token', async () => {
    const db = await freshDb(); await seedUser(db);
    await request(app(db)).get('/api/panel/chat/conversaciones').expect(401);
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/panel/chat-listas-route.test.js 2>&1 | tail -20`
Expected: FAIL — 404.

- [ ] **Step 3: Implement**

En `gastos/src/panel/router.js`, agrega (junto a las otras rutas chat). Para el suggest, LEE cómo lo hace `createAppRouter` (`POST /overlay/pedido/suggest` con `suggestOrder`) y replica con el require `const { suggestOrder } = require('../pedidos/suggest');`:
```js
  router.get('/chat/conversaciones', async (req, res) => {
    return res.json(await chatRepo.listConversaciones(db, req.auth.companyId));
  });
  router.get('/chat/conversacion', async (req, res) => {
    return res.json(await chatRepo.listMensajes(db, req.auth.companyId, req.query.channel, req.query.contact));
  });
  router.post('/overlay/pedido/suggest', async (req, res) => {
    try {
      const { channel, contact, conversation } = req.body || {};
      const convo = conversation || (await chatRepo.listMensajes(db, req.auth.companyId, channel, contact)).map((m) => ({ from: m.direccion === 'out' ? 'me' : 'them', text: m.text }));
      if (!convo || !convo.length) return res.status(400).json({ error: 'sin_conversacion' });
      const sug = await suggestOrder(convo);
      return res.json(sug);
    } catch (e) { console.error('[panel pedido suggest]', e.message); return res.status(500).json({ error: 'error_pedido' }); }
  });
```
> Verifica la firma real de `suggestOrder` en `src/pedidos/suggest.js` y cómo el app router arma `convo` (formato `{from,text}` u otro) — usa el MISMO formato. Ajusta el map si el formato difiere.

- [ ] **Step 4: Run → PASS (+ suite backend completa)**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest tests/panel/ tests/chat/ 2>&1 | tail -15`
Expected: PASS. Luego corre toda la suite backend: `npx jest 2>&1 | tail -8` → verde.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git add gastos/src/panel/router.js gastos/tests/panel/chat-listas-route.test.js
git commit -m "feat(crm): montar conversaciones/conversacion/pedido-suggest en el panel router"
```

---

### Task 6: UI vanilla del CRM en el panel (3 paneles)

**Sin tests automáticos** (HTML estático). Checklist de edición; verificación visual en Chrome (Task 7). INSERTAR, no reestructurar. NO tocar otras secciones del panel.

**Files:**
- Modify: `gastos/public/panel/index.html` (reemplazar el contenido de `#crmSection` + agregar funciones JS + estilos CRM)
- Modify: `gastos/public/panel/lib.js` (helpers de render del CRM, opcional)

- [ ] **Step 1: Leer el estado actual**

LEE `gastos/public/panel/index.html`: el `#crmSection` (hoy placeholder "Módulo CRM completo — Próximamente"), la función `apiFetch`, cómo se inicializa cada sección al activarse el tab (busca `tab === 'crm'` en el JS), los estilos glass/dorado, y dónde van las funciones JS (el `<script>` grande). Anota el patrón.

- [ ] **Step 2: Reemplazar el markup de `#crmSection`**

Reemplaza el contenido interno de `<section id="crmSection" class="hidden">...</section>` por un grid de 3 columnas (lista | hilo | ficha). Usa Tailwind + las clases del panel. Estructura mínima:
```html
<section id="crmSection" class="hidden">
  <div class="grid grid-cols-[300px_1fr_320px] gap-4 h-[calc(100vh-120px)]">
    <!-- IZQUIERDA: lista -->
    <div class="glass-card rounded-2xl p-3 flex flex-col overflow-hidden">
      <input id="crmSearch" placeholder="Buscar conversación…" class="w-full bg-[#292a2a]/50 border border-[#343535] rounded-xl px-3 py-2 text-sm text-on-surface mb-3" />
      <div id="crmList" class="flex-1 overflow-y-auto flex flex-col gap-1"></div>
    </div>
    <!-- CENTRO: hilo -->
    <div class="glass-card rounded-2xl flex flex-col overflow-hidden">
      <div id="crmThreadHeader" class="px-4 py-3 border-b border-[#343535]/50 font-bold text-[#ffd700]">Elegí una conversación</div>
      <div id="crmThread" class="flex-1 overflow-y-auto p-4 flex flex-col gap-2"></div>
      <div class="p-3 border-t border-[#343535]/50 flex gap-2">
        <input id="crmReply" placeholder="Escribe una respuesta…" disabled class="flex-1 bg-[#292a2a]/50 border border-[#343535] rounded-xl px-3 py-2 text-sm text-on-surface disabled:opacity-50" />
        <button id="crmالسendBtn" disabled class="px-4 py-2 rounded-xl bg-[#ffd700] text-[#3a3000] font-bold disabled:opacity-40">Enviar</button>
      </div>
      <p id="crmReplyHint" class="text-[10px] text-[#d0c6ab]/60 px-3 pb-2"></p>
    </div>
    <!-- DERECHA: ficha -->
    <div id="crmFicha" class="glass-card rounded-2xl p-4 overflow-y-auto text-sm text-[#d0c6ab]">Sin contacto seleccionado</div>
  </div>
</section>
```
> Corrige el id `crmالسendBtn` por `crmSendBtn` (evita typos). Ajustá clases para que combine con el resto del panel.

- [ ] **Step 3: Agregar el JS del CRM**

En el `<script>` grande de index.html, agrega las funciones (vanilla). Estado: `crmActivo = {channel, contact}`.
```js
var crmConvos = [], crmActivo = null;
function crmInit() { crmCargarConvos(); }
async function crmCargarConvos() {
  try { var r = await apiFetch('/chat/conversaciones'); crmConvos = await r.json(); crmRenderList(); } catch (e) {}
}
function crmRenderList() {
  var q = ($('crmSearch').value || '').toLowerCase();
  var html = crmConvos.filter(function (c) { return (c.contact || '').toLowerCase().indexOf(q) >= 0; }).map(function (c) {
    var ini = (c.contact || '?').slice(0, 2).toUpperCase();
    var act = crmActivo && crmActivo.contact === c.contact && crmActivo.channel === c.channel;
    return '<button class="text-left px-3 py-2 rounded-xl flex items-center gap-2 ' + (act ? 'bg-[#ffd700]/10 border border-[#ffd700]/20' : 'hover:bg-[#343535]/40') + '" onclick="crmAbrir(\'' + encodeURIComponent(c.channel) + '\',\'' + encodeURIComponent(c.contact) + '\')">'
      + '<span class="w-8 h-8 rounded-full bg-[#343535] flex items-center justify-center text-xs font-bold text-[#ffd700]">' + ini + '</span>'
      + '<span class="flex-1 min-w-0"><span class="block text-sm font-semibold text-on-surface truncate">' + escapeHtml(c.contact) + '</span><span class="block text-xs text-[#d0c6ab]/70 truncate">' + escapeHtml(c.ultimo || '') + '</span></span>'
      + '<span class="text-[9px] uppercase text-[#d0c6ab]/50">' + escapeHtml(c.channel) + '</span></button>';
  }).join('');
  $('crmList').innerHTML = html || '<p class="text-xs text-[#d0c6ab]/50 p-3">Sin conversaciones.</p>';
}
window.crmAbrir = async function (channelEnc, contactEnc) {
  var channel = decodeURIComponent(channelEnc), contact = decodeURIComponent(contactEnc);
  crmActivo = { channel: channel, contact: contact };
  crmRenderList();
  $('crmThreadHeader').textContent = contact + ' · ' + channel;
  var r = await apiFetch('/chat/conversacion?channel=' + encodeURIComponent(channel) + '&contact=' + encodeURIComponent(contact));
  var msgs = await r.json();
  $('crmThread').innerHTML = crmRenderThread(msgs);
  $('crmThread').scrollTop = $('crmThread').scrollHeight;
  // reply habilitado solo whatsapp
  var esWa = channel.toLowerCase() === 'whatsapp';
  $('crmReply').disabled = !esWa; $('crmSendBtn').disabled = !esWa;
  $('crmReplyHint').textContent = esWa ? '' : 'Responder disponible solo por WhatsApp.';
  crmCargarFicha(channel, contact);
};
function crmRenderThread(msgs) {
  var out = '', lastDay = '';
  (msgs || []).forEach(function (m) {
    var day = String(m.created_at || '').slice(0, 10);
    if (day && day !== lastDay) { out += '<div class="text-center text-[10px] text-[#d0c6ab]/50 my-2">' + day + '</div>'; lastDay = day; }
    var mine = m.direccion === 'out';
    out += '<div class="max-w-[75%] ' + (mine ? 'self-end bg-[#ffd700]/15 border border-[#ffd700]/20' : 'self-start bg-[#343535]/40') + ' rounded-2xl px-3 py-2 text-sm text-on-surface">' + escapeHtml(m.text) + '</div>';
  });
  return out || '<p class="text-xs text-[#d0c6ab]/50">Sin mensajes.</p>';
}
async function crmCargarFicha(channel, contact) {
  var r = await apiFetch('/chat/contacto?channel=' + encodeURIComponent(channel) + '&contact=' + encodeURIComponent(contact));
  var f = await r.json();
  $('crmFicha').innerHTML = crmFichaHtml(f, channel, contact);
}
function crmFila(label, val) { return '<div class="mb-2"><div class="text-[10px] uppercase text-[#d0c6ab]/50">' + label + '</div><div class="text-on-surface">' + (val || '—') + '</div></div>'; }
function crmFichaHtml(f, channel, contact) {
  var ini = (f.nombre || '?').slice(0, 2).toUpperCase();
  return '<div class="flex items-center gap-3 mb-4"><span class="w-12 h-12 rounded-full bg-[#343535] flex items-center justify-center text-lg font-bold text-[#ffd700]">' + ini + '</span>'
    + '<div><div class="font-bold text-on-surface">' + escapeHtml(f.nombre || '') + '</div><div class="text-xs text-[#d0c6ab]/70">' + escapeHtml(channel) + '</div></div></div>'
    + '<div class="flex gap-2 mb-4"><button onclick="crmNuevoPedido()" class="flex-1 px-3 py-2 rounded-xl bg-[#ffd700] text-[#3a3000] text-xs font-bold">Pedido</button>'
    + '<button onclick="crmCaptura()" class="flex-1 px-3 py-2 rounded-xl border border-[#343535] text-xs font-bold text-[#d0c6ab]">Captura</button></div>'
    + crmFila('Teléfono', escapeHtml(f.telefono)) + crmFila('Primer contacto', escapeHtml((f.primerContacto || '').slice(0, 10))) + crmFila('Último contacto', escapeHtml((f.ultimoContacto || '').slice(0, 10))) + crmFila('Mensajes', String(f.nMensajes || 0))
    + '<div class="border-t border-[#343535]/50 my-3"></div>'
    + '<label class="text-[10px] uppercase text-[#d0c6ab]/50">Email</label><input id="fEmail" value="' + escapeHtml(f.email || '') + '" class="w-full bg-[#292a2a]/50 border border-[#343535] rounded-lg px-2 py-1 text-sm mb-2 text-on-surface" />'
    + '<label class="text-[10px] uppercase text-[#d0c6ab]/50">Ubicación</label><input id="fUbic" value="' + escapeHtml(f.ubicacion || '') + '" class="w-full bg-[#292a2a]/50 border border-[#343535] rounded-lg px-2 py-1 text-sm mb-2 text-on-surface" />'
    + '<label class="text-[10px] uppercase text-[#d0c6ab]/50">Notas</label><textarea id="fNotas" class="w-full bg-[#292a2a]/50 border border-[#343535] rounded-lg px-2 py-1 text-sm mb-2 text-on-surface" rows="3">' + escapeHtml(f.notas || '') + '</textarea>'
    + '<button onclick="crmGuardarFicha()" class="w-full px-3 py-2 rounded-xl bg-[#ffd700] text-[#3a3000] text-xs font-bold">Guardar datos</button>';
}
window.crmGuardarFicha = async function () {
  if (!crmActivo) return;
  await apiFetch('/chat/contacto', { method: 'PATCH', body: JSON.stringify({ channel: crmActivo.channel, contact: crmActivo.contact, email: $('fEmail').value, ubicacion: $('fUbic').value, notas: $('fNotas').value }) });
};
window.crmEnviarReply = async function () {
  if (!crmActivo) return;
  var txt = $('crmReply').value.trim(); if (!txt) return;
  try {
    await apiFetch('/chat/responder', { method: 'POST', body: JSON.stringify({ channel: crmActivo.channel, contact: crmActivo.contact, text: txt }) });
    $('crmReply').value = '';
    crmAbrir(encodeURIComponent(crmActivo.channel), encodeURIComponent(crmActivo.contact));
  } catch (e) { alert('No se pudo enviar.'); }
};
```
Cablea: `$('crmSearch').oninput = crmRenderList;` `$('crmSendBtn').onclick = crmEnviarReply;` `$('crmReply').onkeydown = function(e){ if(e.key==='Enter') crmEnviarReply(); };`
Y en el `if (tab === 'crm')` del switch de tabs (Step 1), llamá `crmInit();` al mostrar la sección.

- [ ] **Step 4: Modal "Nuevo pedido" + captura (vanilla)**

Agrega un modal (overlay `fixed inset-0`) + funciones:
```js
window.crmNuevoPedido = async function () {
  if (!crmActivo) return;
  var sug = {};
  try { var r = await apiFetch('/overlay/pedido/suggest', { method: 'POST', body: JSON.stringify({ channel: crmActivo.channel, contact: crmActivo.contact }) }); sug = await r.json(); } catch (e) {}
  crmAbrirModalPedido(sug);
};
window.crmCaptura = function () { var i = document.getElementById('crmFileInput'); if (i) i.click(); };
```
Crea en el body (una vez) un `<input type="file" id="crmFileInput" accept="image/*" capture="environment" class="hidden" />` y un contenedor de modal `#crmPedidoModal`. `crmAbrirModalPedido(sug)` renderiza los ítems sugeridos editables + un área para la imagen capturada (preview) + botones Confirmar/Cancelar. Al capturar (onchange del file input) → FileReader a base64 → mostrar preview. Confirmar → POST al endpoint de crear pedido que use el panel (reusa el de pedido existente del panel; si el panel ya tiene crear-pedido desde catálogo, úsalo; si no, el suggest devuelve la propuesta y se crea con el endpoint de pedido disponible). 
> El detalle exacto del "crear pedido" depende de qué endpoint de creación de pedido expone el panel router — LEE el panel router y reusá el que exista (`/pedido/from-catalog` u otro). Si NO hay endpoint de creación de pedido en el panel, este v1 puede dejar el modal mostrando la propuesta + la captura y un aviso "Pedido listo para enviar" sin persistir, y se completa cuando exista el endpoint. Documentá lo que hagas.

- [ ] **Step 5: Commit (UI)**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD
git add gastos/public/panel/index.html gastos/public/panel/lib.js
git commit -m "feat(crm): UI vanilla del CRM-chat 3 paneles en el panel (lista/hilo/ficha/responder/pedido)"
```

---

### Task 7: Verificación visual + deploy

- [ ] **Step 1: Suite backend verde**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest 2>&1 | tail -8`
Expected: todas verdes.

- [ ] **Step 2: Deploy**

`cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA" && node deploy-gastos-wt.js` → `=== deploy worktree OK ===` + HEALTH ok.

- [ ] **Step 3: Verificar en Chrome (Browser 2)**

Abrir `https://gastos.atikodigital.cl/panel`, entrar a la pestaña **CRM**. Confirmar: 3 paneles; la lista carga conversaciones; click abre el hilo (burbujas in/out + fechas) y la ficha; la ficha muestra derivado + campos editables (guardar funciona); en un chat de WhatsApp la caja de respuesta está habilitada (probar enviar si hay WhatsApp configurado) y en otros canales deshabilitada con aviso; el botón **Pedido** abre el modal con la propuesta + **Captura** abre cámara/archivo y muestra preview; sin errores graves en consola; las demás pestañas del panel siguen andando.

- [ ] **Step 4: Avisar**

Avisar al usuario que el CRM del panel quedó desplegado y que tocaste `panel/index.html`/`lib.js` (coordinar con Antigravity).

---

## Self-Review

**1. Spec coverage:**
- Tabla `contactos` editable → Task 1 ✅
- Ficha derivada + GET `/chat/contacto` → Task 2 ✅; PATCH editar → Task 3 ✅
- Responder WhatsApp (out + 400 otros canales) → Task 4 ✅
- Lista + hilo + pedido-suggest en panel router → Task 5 ✅
- UI 3 paneles (lista/buscador, hilo/burbujas/reply, ficha derivado+editable+acciones, modal pedido+captura vanilla) → Task 6 ✅
- Verificación visual + deploy + avisar Antigravity → Task 7 ✅
- Recortes (sin tabs unread/draft/archived; sin Email/Task/Meeting; reply solo WhatsApp) → reflejados en Tasks 4/6 ✅

**2. Placeholder scan:** No hay "TODO" de lógica. Los puntos "LEE el panel router / verificá la firma de suggestOrder / qué endpoint de crear-pedido expone el panel" son por integrar con código existente cuya forma exacta el implementador confirma — el código de cada endpoint y de la UI está completo; el único genuinamente abierto es el endpoint de **persistir el pedido** desde el panel (Task 6 Step 4 da una salida explícita: reusar el que exista, o dejar la propuesta+captura sin persistir documentándolo). Eso es una dependencia real del estado del panel router, no un placeholder de diseño.

**3. Type consistency:** `getContacto`→`{email,ubicacion,notas}|{}`; `upsertContacto(...,{email,ubicacion,notas})`; `fichaDerivada(msgs)`→`{nombre,channel,telefono,nMensajes,primerContacto,ultimoContacto}`; GET `/chat/contacto` mergea ambos; `telefonoDeContacto` usado en ficha y en responder; endpoints todos bajo `/api/panel`, scoped `req.auth.companyId`; `_sendText({to,body,token,phoneNumberId})`. Consistente. ✅
