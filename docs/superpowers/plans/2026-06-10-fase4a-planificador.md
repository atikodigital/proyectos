# Fase 4a — Cerebro del Planificador · Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modelo de datos + máquina de estados + scheduler + API para que una pieza de contenido (reel/post) pase por draft→approved→scheduled y se publique sola a su hora vía el Publicador de la Fase 1.

**Architecture:** Nuevo módulo `services/content/` en el agente Express. Máquina de estados pura, content-store (memoria + Postgres) con misma interfaz, scheduler con `tick()` testeable (inyecta `now` y `publisher`) + runner `setInterval`. API REST para crear/aprobar/programar. Mismo patrón DI/TDD de las fases 1-3.

**Tech Stack:** Node 20 + Express (existente), `pg` (existente), `uuid` (existente), `node:test`. Publicador Fase 1 (`services/social/publisher`).

---

## Estructura de archivos

```
agent/
├── migrations/003_content_items.sql      ← tabla
├── services/content/
│   ├── status.js                         ← canTransition / assertTransition (máquina de estados)
│   ├── content-store.js                  ← createMemoryContentStore / createPgContentStore
│   └── scheduler.js                      ← createScheduler({store,publisher,now}) + startScheduler
├── routes/content.js                     ← API crear/listar/aprobar/programar/desprogramar
└── tests/content/
    ├── status.test.js
    ├── content-store.test.js
    └── scheduler.test.js
```

**Contratos compartidos:**
- **content item:** `{ id, clientId, format("reel"|"story"|"post"), network("facebook"|"instagram"), mediaUrl, caption, hashtags, status, scheduledAt, publishedAt, externalId, error, createdAt }`
- **estados:** `draft → approved → scheduled → publishing → published|failed`; además `approved→draft`, `scheduled→approved`, `failed→scheduled`.
- **publisher** (Fase 1, ya existe): `publish({ clientId, platform, message, imageUrl, videoUrl, caption }) -> { id, ... }`.
- Tests: `cd agent && node --test tests/content/<archivo>` (archivos explícitos, NO el directorio).

---

## Task 1: Máquina de estados

**Files:**
- Create: `agent/services/content/status.js`
- Test: `agent/tests/content/status.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/content/status.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { canTransition, assertTransition, STATUSES } = require("../../services/content/status");

test("allows the happy path transitions", () => {
  assert.equal(canTransition("draft", "approved"), true);
  assert.equal(canTransition("approved", "scheduled"), true);
  assert.equal(canTransition("scheduled", "publishing"), true);
  assert.equal(canTransition("publishing", "published"), true);
  assert.equal(canTransition("publishing", "failed"), true);
});

test("allows the back/retry transitions", () => {
  assert.equal(canTransition("approved", "draft"), true);
  assert.equal(canTransition("scheduled", "approved"), true);
  assert.equal(canTransition("failed", "scheduled"), true);
});

test("rejects invalid jumps", () => {
  assert.equal(canTransition("draft", "scheduled"), false);
  assert.equal(canTransition("draft", "published"), false);
  assert.equal(canTransition("published", "draft"), false);
  assert.equal(canTransition("approved", "publishing"), false);
});

test("assertTransition throws on invalid, returns on valid", () => {
  assert.equal(assertTransition("draft", "approved"), "approved");
  assert.throws(() => assertTransition("draft", "published"), /Transición inválida/);
});

test("STATUSES lists all states", () => {
  assert.deepEqual(
    [...STATUSES].sort(),
    ["approved", "draft", "failed", "published", "publishing", "scheduled"]
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/content/status.test.js`
Expected: FAIL — `Cannot find module '../../services/content/status'`.

- [ ] **Step 3: Write minimal implementation**

```js
// agent/services/content/status.js
const TRANSITIONS = {
  draft: ["approved"],
  approved: ["scheduled", "draft"],
  scheduled: ["publishing", "approved"],
  publishing: ["published", "failed"],
  published: [],
  failed: ["scheduled"],
};

const STATUSES = Object.keys(TRANSITIONS);

function canTransition(from, to) {
  return Array.isArray(TRANSITIONS[from]) && TRANSITIONS[from].includes(to);
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error("Transición inválida: " + from + " → " + to);
  }
  return to;
}

module.exports = { canTransition, assertTransition, STATUSES, TRANSITIONS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/content/status.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/services/content/status.js agent/tests/content/status.test.js
git commit -m "feat(content): status state machine for content items"
```

---

## Task 2: Migración de la tabla

**Files:**
- Create: `agent/migrations/003_content_items.sql`

- [ ] **Step 1: Crear la migración**

```sql
-- agent/migrations/003_content_items.sql
CREATE TABLE IF NOT EXISTS content_items (
  id            UUID PRIMARY KEY,
  client_id     TEXT NOT NULL,
  format        TEXT NOT NULL,
  network       TEXT NOT NULL,
  media_url     TEXT,
  caption       TEXT,
  hashtags      JSONB NOT NULL DEFAULT '[]'::jsonb,
  status        TEXT NOT NULL DEFAULT 'draft',
  scheduled_at  TIMESTAMPTZ,
  published_at  TIMESTAMPTZ,
  external_id   TEXT,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_due ON content_items (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_content_client ON content_items (client_id);
```

- [ ] **Step 2: Commit**

```bash
git add agent/migrations/003_content_items.sql
git commit -m "feat(content): content_items migration"
```

---

## Task 3: Content store (memoria + Postgres)

**Files:**
- Create: `agent/services/content/content-store.js`
- Test: `agent/tests/content/content-store.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/content/content-store.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { createMemoryContentStore } = require("../../services/content/content-store");

function sample(over = {}) {
  return {
    clientId: "casaluxe", format: "reel", network: "instagram",
    mediaUrl: "/widget/reels/x.mp4", caption: "hola", hashtags: ["a"], ...over,
  };
}

test("create assigns id, status draft and createdAt", async () => {
  const store = createMemoryContentStore();
  const item = await store.create(sample());
  assert.ok(item.id);
  assert.equal(item.status, "draft");
  assert.ok(item.createdAt);
  assert.equal(item.scheduledAt, null);
});

test("get returns the item, null if missing", async () => {
  const store = createMemoryContentStore();
  const it = await store.create(sample());
  assert.equal((await store.get(it.id)).caption, "hola");
  assert.equal(await store.get("nope"), null);
});

test("list filters by clientId and status", async () => {
  const store = createMemoryContentStore();
  await store.create(sample({ clientId: "a" }));
  await store.create(sample({ clientId: "b" }));
  assert.equal((await store.list({ clientId: "a" })).length, 1);
  assert.equal((await store.list({ status: "draft" })).length, 2);
});

test("updateStatus enforces the state machine", async () => {
  const store = createMemoryContentStore();
  const it = await store.create(sample());
  const a = await store.updateStatus(it.id, "approved");
  assert.equal(a.status, "approved");
  await assert.rejects(() => store.updateStatus(it.id, "published"), /Transición inválida/);
});

test("updateStatus applies patch fields (scheduledAt, error, etc.)", async () => {
  const store = createMemoryContentStore();
  const it = await store.create(sample());
  await store.updateStatus(it.id, "approved");
  const s = await store.updateStatus(it.id, "scheduled", { scheduledAt: "2026-06-12T18:00:00Z" });
  assert.equal(s.scheduledAt, "2026-06-12T18:00:00Z");
});

test("due returns scheduled items whose time has passed", async () => {
  const store = createMemoryContentStore();
  const past = await store.create(sample());
  await store.updateStatus(past.id, "approved");
  await store.updateStatus(past.id, "scheduled", { scheduledAt: "2026-06-10T00:00:00Z" });
  const future = await store.create(sample());
  await store.updateStatus(future.id, "approved");
  await store.updateStatus(future.id, "scheduled", { scheduledAt: "2999-01-01T00:00:00Z" });

  const now = new Date("2026-06-11T00:00:00Z");
  const due = await store.due(now);
  assert.equal(due.length, 1);
  assert.equal(due[0].id, past.id);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/content/content-store.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// agent/services/content/content-store.js
const { randomUUID } = require("crypto");
const { assertTransition } = require("./status");

function newItem(input) {
  return {
    id: randomUUID(),
    clientId: input.clientId,
    format: input.format,
    network: input.network,
    mediaUrl: input.mediaUrl || null,
    caption: input.caption || null,
    hashtags: input.hashtags || [],
    status: "draft",
    scheduledAt: null,
    publishedAt: null,
    externalId: null,
    error: null,
    createdAt: new Date().toISOString(),
  };
}

function createMemoryContentStore() {
  const map = new Map();
  return {
    async create(input) {
      const item = newItem(input);
      map.set(item.id, item);
      return item;
    },
    async get(id) {
      return map.get(id) || null;
    },
    async list({ clientId, status } = {}) {
      return [...map.values()].filter(
        (i) => (!clientId || i.clientId === clientId) && (!status || i.status === status)
      );
    },
    async updateStatus(id, newStatus, patch = {}) {
      const item = map.get(id);
      if (!item) throw new Error("content item no encontrado: " + id);
      assertTransition(item.status, newStatus);
      Object.assign(item, patch, { status: newStatus });
      return item;
    },
    async due(now) {
      const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
      return [...map.values()].filter(
        (i) => i.status === "scheduled" && i.scheduledAt && new Date(i.scheduledAt).getTime() <= t
      );
    },
  };
}

function rowToItem(r) {
  return {
    id: r.id, clientId: r.client_id, format: r.format, network: r.network,
    mediaUrl: r.media_url, caption: r.caption, hashtags: r.hashtags || [],
    status: r.status, scheduledAt: r.scheduled_at, publishedAt: r.published_at,
    externalId: r.external_id, error: r.error, createdAt: r.created_at,
  };
}

function createPgContentStore({ pool }) {
  return {
    async create(input) {
      const item = newItem(input);
      await pool.query(
        `INSERT INTO content_items
           (id, client_id, format, network, media_url, caption, hashtags, status, scheduled_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [item.id, item.clientId, item.format, item.network, item.mediaUrl, item.caption,
         JSON.stringify(item.hashtags), item.status, item.scheduledAt, item.createdAt]
      );
      return item;
    },
    async get(id) {
      const { rows } = await pool.query("SELECT * FROM content_items WHERE id=$1", [id]);
      return rows.length ? rowToItem(rows[0]) : null;
    },
    async list({ clientId, status } = {}) {
      const where = [];
      const params = [];
      if (clientId) { params.push(clientId); where.push("client_id=$" + params.length); }
      if (status) { params.push(status); where.push("status=$" + params.length); }
      const sql = "SELECT * FROM content_items" + (where.length ? " WHERE " + where.join(" AND ") : "") + " ORDER BY created_at DESC";
      const { rows } = await pool.query(sql, params);
      return rows.map(rowToItem);
    },
    async updateStatus(id, newStatus, patch = {}) {
      const current = await this.get(id);
      if (!current) throw new Error("content item no encontrado: " + id);
      assertTransition(current.status, newStatus);
      await pool.query(
        `UPDATE content_items SET status=$2, scheduled_at=$3, published_at=$4, external_id=$5, error=$6
         WHERE id=$1`,
        [id, newStatus,
         patch.scheduledAt !== undefined ? patch.scheduledAt : current.scheduledAt,
         patch.publishedAt !== undefined ? patch.publishedAt : current.publishedAt,
         patch.externalId !== undefined ? patch.externalId : current.externalId,
         patch.error !== undefined ? patch.error : current.error]
      );
      return this.get(id);
    },
    async due(now) {
      const iso = (now instanceof Date ? now : new Date(now)).toISOString();
      const { rows } = await pool.query(
        "SELECT * FROM content_items WHERE status='scheduled' AND scheduled_at <= $1", [iso]);
      return rows.map(rowToItem);
    },
  };
}

module.exports = { createMemoryContentStore, createPgContentStore };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/content/content-store.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/services/content/content-store.js agent/tests/content/content-store.test.js
git commit -m "feat(content): content store (memory + postgres) with state machine"
```

---

## Task 4: Scheduler (`tick`)

**Files:**
- Create: `agent/services/content/scheduler.js`
- Test: `agent/tests/content/scheduler.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/content/scheduler.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { createScheduler } = require("../../services/content/scheduler");
const { createMemoryContentStore } = require("../../services/content/content-store");

async function scheduledItem(store, over = {}) {
  const it = await store.create({
    clientId: "c", format: "reel", network: "instagram",
    mediaUrl: "/widget/reels/x.mp4", caption: "hola", hashtags: [], ...over,
  });
  await store.updateStatus(it.id, "approved");
  await store.updateStatus(it.id, "scheduled", { scheduledAt: "2026-06-10T00:00:00Z" });
  return it;
}

const NOW = () => new Date("2026-06-11T00:00:00Z");

test("tick publishes due reel items via publisher and marks published", async () => {
  const store = createMemoryContentStore();
  const it = await scheduledItem(store);
  const calls = [];
  const publisher = { async publish(args) { calls.push(args); return { id: "FBPOST1" }; } };

  const scheduler = createScheduler({ store, publisher, now: NOW });
  const summary = await scheduler.tick();

  assert.deepEqual(summary, { published: 1, failed: 0 });
  assert.equal(calls[0].platform, "instagram");
  assert.equal(calls[0].videoUrl, "/widget/reels/x.mp4");
  assert.equal(calls[0].caption, "hola");
  const after = await store.get(it.id);
  assert.equal(after.status, "published");
  assert.equal(after.externalId, "FBPOST1");
  assert.ok(after.publishedAt);
});

test("tick maps post format to imageUrl", async () => {
  const store = createMemoryContentStore();
  await scheduledItem(store, { format: "post", mediaUrl: "/widget/img/p.jpg" });
  const calls = [];
  const publisher = { async publish(a) { calls.push(a); return { id: "X" }; } };
  await createScheduler({ store, publisher, now: NOW }).tick();
  assert.equal(calls[0].imageUrl, "/widget/img/p.jpg");
  assert.equal(calls[0].videoUrl, undefined);
});

test("tick marks story as failed (no soportado en 4a)", async () => {
  const store = createMemoryContentStore();
  const it = await scheduledItem(store, { format: "story" });
  const publisher = { async publish() { throw new Error("no debería llamarse"); } };
  const summary = await createScheduler({ store, publisher, now: NOW }).tick();
  assert.deepEqual(summary, { published: 0, failed: 1 });
  const after = await store.get(it.id);
  assert.equal(after.status, "failed");
  assert.match(after.error, /Fase 4c|stor/i);
});

test("tick ignores future and non-scheduled items", async () => {
  const store = createMemoryContentStore();
  const future = await store.create({ clientId: "c", format: "reel", network: "instagram", mediaUrl: "u", caption: "c", hashtags: [] });
  await store.updateStatus(future.id, "approved");
  await store.updateStatus(future.id, "scheduled", { scheduledAt: "2999-01-01T00:00:00Z" });
  const draft = await store.create({ clientId: "c", format: "reel", network: "instagram", mediaUrl: "u", caption: "c", hashtags: [] });

  let called = false;
  const publisher = { async publish() { called = true; return { id: "X" }; } };
  const summary = await createScheduler({ store, publisher, now: NOW }).tick();
  assert.deepEqual(summary, { published: 0, failed: 0 });
  assert.equal(called, false);
  assert.equal((await store.get(draft.id)).status, "draft");
});

test("one publish failure does not stop the rest", async () => {
  const store = createMemoryContentStore();
  const a = await scheduledItem(store, { caption: "uno" });
  const b = await scheduledItem(store, { caption: "dos" });
  const publisher = {
    async publish(args) {
      if (args.caption === "uno") throw new Error("falló uno");
      return { id: "OK" };
    },
  };
  const summary = await createScheduler({ store, publisher, now: NOW }).tick();
  assert.deepEqual(summary, { published: 1, failed: 1 });
  assert.equal((await store.get(a.id)).status, "failed");
  assert.equal((await store.get(a.id)).error, "falló uno");
  assert.equal((await store.get(b.id)).status, "published");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/content/scheduler.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// agent/services/content/scheduler.js
// tick(): publica los content items "scheduled" vencidos vía el Publicador (Fase 1).
// now y publisher inyectables → testeable sin reloj ni red.

function buildPublishArgs(item) {
  const base = { clientId: item.clientId, platform: item.network, caption: item.caption };
  if (item.format === "reel") return { ...base, videoUrl: item.mediaUrl };
  if (item.format === "post") return { ...base, imageUrl: item.mediaUrl };
  // story u otros: no soportado todavía
  return null;
}

function createScheduler({ store, publisher, now = () => new Date() }) {
  async function publishOne(item) {
    const args = buildPublishArgs(item);
    if (!args) {
      await store.updateStatus(item.id, "failed", {
        error: "Formato '" + item.format + "' aún no soportado (llega en Fase 4c)",
      });
      return "failed";
    }
    await store.updateStatus(item.id, "publishing");
    try {
      const res = await publisher.publish(args);
      await store.updateStatus(item.id, "published", {
        publishedAt: now().toISOString(),
        externalId: (res && (res.id || res.externalId)) || null,
      });
      return "published";
    } catch (err) {
      await store.updateStatus(item.id, "failed", { error: err.message });
      return "failed";
    }
  }

  async function tick() {
    const due = await store.due(now());
    let published = 0, failed = 0;
    for (const item of due) {
      const r = await publishOne(item);
      if (r === "published") published++; else failed++;
    }
    return { published, failed };
  }

  return { tick };
}

function startScheduler(scheduler, { intervalMs = 60000, log = console } = {}) {
  const timer = setInterval(async () => {
    try {
      const s = await scheduler.tick();
      if (s.published || s.failed) log.log("[scheduler] publicados=" + s.published + " fallidos=" + s.failed);
    } catch (e) {
      log.error("[scheduler] error en tick:", e.message);
    }
  }, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = { createScheduler, startScheduler, buildPublishArgs };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/content/scheduler.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/services/content/scheduler.js agent/tests/content/scheduler.test.js
git commit -m "feat(content): scheduler tick (publishes due items via Fase 1 publisher)"
```

---

## Task 5: API REST + arranque del runner

**Files:**
- Create: `agent/routes/content.js`
- Modify: `agent/server.js` (require + mount + arrancar scheduler)

- [ ] **Step 1: Crear la ruta**

```js
// agent/routes/content.js
const express = require("express");
const { createMemoryContentStore, createPgContentStore } = require("../services/content/content-store");
const { createScheduler, startScheduler } = require("../services/content/scheduler");
const { createPublisher } = require("../services/social/publisher");
const { createFacebookAdapter } = require("../services/social/adapters/meta-facebook");
const { createInstagramAdapter } = require("../services/social/adapters/meta-instagram");
const { createMemoryTokenStore, createPgTokenStore } = require("../services/social/token-store");
const axios = require("axios");

const router = express.Router();

let store, tokenStore;
if (process.env.DATABASE_URL) {
  const { pool } = require("../db/pool");
  store = createPgContentStore({ pool });
  tokenStore = createPgTokenStore({ pool });
} else {
  console.warn("[content] DATABASE_URL no definido — content store en MEMORIA (no persiste).");
  store = createMemoryContentStore();
  tokenStore = createMemoryTokenStore();
}

const publisher = createPublisher({
  tokenStore,
  facebook: createFacebookAdapter({ http: axios }),
  instagram: createInstagramAdapter({ http: axios }),
});
const scheduler = createScheduler({ store, publisher });

// Runner: solo si está habilitado (evita publicar en entornos de prueba).
if (process.env.SCHEDULER_ENABLED === "true") {
  startScheduler(scheduler);
  console.log("[content] scheduler ACTIVO (cada 60s).");
}

// POST /api/content  { clientId, format, network, mediaUrl, caption, hashtags? }
router.post("/", async function (req, res) {
  try {
    const { clientId, format, network, mediaUrl } = req.body;
    if (!clientId || !format || !network) {
      return res.status(400).json({ error: "Falta clientId, format o network" });
    }
    if (!mediaUrl) return res.status(400).json({ error: "Falta mediaUrl" });
    const item = await store.create(req.body);
    res.json({ ok: true, item });
  } catch (err) {
    console.error("[content/create]", err.message);
    res.status(500).json({ error: "Error creando content item", detail: err.message });
  }
});

// GET /api/content?clientId=&status=
router.get("/", async function (req, res) {
  try {
    const items = await store.list({ clientId: req.query.clientId, status: req.query.status });
    res.json({ ok: true, items });
  } catch (err) {
    res.status(500).json({ error: "Error listando", detail: err.message });
  }
});

async function transition(req, res, toStatus, patchFromBody) {
  try {
    const patch = patchFromBody ? patchFromBody(req.body || {}) : {};
    const item = await store.updateStatus(req.params.id, toStatus, patch);
    res.json({ ok: true, item });
  } catch (err) {
    const code = /Transición inválida|no encontrado/.test(err.message) ? 400 : 500;
    res.status(code).json({ error: err.message });
  }
}

// POST /api/content/:id/approve
router.post("/:id/approve", (req, res) => transition(req, res, "approved"));

// POST /api/content/:id/schedule  { scheduledAt }
router.post("/:id/schedule", (req, res) => {
  if (!req.body || !req.body.scheduledAt) {
    return res.status(400).json({ error: "Falta scheduledAt" });
  }
  return transition(req, res, "scheduled", (b) => ({ scheduledAt: b.scheduledAt }));
});

// POST /api/content/:id/unschedule
router.post("/:id/unschedule", (req, res) => transition(req, res, "approved", () => ({ scheduledAt: null })));

module.exports = router;
```

- [ ] **Step 2: Montar en server.js**

En `agent/server.js`, junto a los otros `require` de rutas añade:

```js
const contentRoutes = require("./routes/content");
```

Y junto a los otros `app.use(...)` añade:

```js
app.use("/api/content", contentRoutes);
```

- [ ] **Step 3: Verificar carga + suite completa**

Run: `cd agent && node -e "require('./routes/content'); console.log('content route OK')"`
Expected: imprime el warning de memoria (si no hay DATABASE_URL) y `content route OK`.

Run: `cd agent && node --check server.js && echo "server OK"`
Expected: `server OK`.

Run: `cd agent && npm test 2>&1 | tail -5`
Expected: toda la suite (social + reels + content) en verde.

- [ ] **Step 4: Commit**

```bash
git add agent/routes/content.js agent/server.js
git commit -m "feat(content): REST API (create/list/approve/schedule) + scheduler runner"
```

---

## Task 6: Variables de entorno + README

**Files:**
- Modify: `agent/.env.example`
- Modify: `agent/README.md`

- [ ] **Step 1: Añadir variable**

Añade al final de `agent/.env.example`:

```
# ── Planificador (Fase 4a) ───────────────────────────────────
# Activa el scheduler in-process que publica el contenido programado (cada 60s).
# Déjalo vacío/false en dev para no publicar; "true" en producción.
SCHEDULER_ENABLED=
```

- [ ] **Step 2: Documentar en el README**

Añade antes de la línea de contacto final en `agent/README.md`:

```markdown
## 🗓️ Planificador de contenido (Fase 4a)

Programa y publica contenido (reel/post) automáticamente a su hora vía el Publicador.

| Método | URL | Descripción |
|--------|-----|-------------|
| `POST` | `/api/content` | Crea item `{clientId, format, network, mediaUrl, caption, hashtags?}` (status draft) |
| `GET`  | `/api/content?clientId=&status=` | Lista contenido |
| `POST` | `/api/content/:id/approve` | draft → approved |
| `POST` | `/api/content/:id/schedule` | `{scheduledAt}` → scheduled |
| `POST` | `/api/content/:id/unschedule` | scheduled → approved |

Estados: `draft → approved → scheduled → publishing → published|failed`. El scheduler (in-process, cada 60s, activar con `SCHEDULER_ENABLED=true`) publica los `scheduled` vencidos. Stories/carrusel y el panel visual llegan en fases 4c/4d.
```

- [ ] **Step 3: Commit**

```bash
git add agent/.env.example agent/README.md
git commit -m "docs(content): env var + README planificador"
```

---

## Notas de cierre

- **Núcleo testeable (Tasks 1, 3, 4):** status, content-store, scheduler — TDD con `node:test`, sin red ni reloj real.
- **Integración (Task 5):** API + runner; el runner solo publica con `SCHEDULER_ENABLED=true` (evita publicar en pruebas).
- **Conecta con Fase 1:** el scheduler usa `publisher.publish` ya existente; publicar de verdad requiere tokens conectados + App Review de Meta (igual que la Fase 1).
- **Fuera de alcance (otras sub-fases):** generadores story/post (4b), publicadores Stories/carrusel (4c), panel web con calendario + editar (4d), multi-red por item, reintentos con backoff.
