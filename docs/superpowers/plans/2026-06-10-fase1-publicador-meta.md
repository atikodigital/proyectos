# Fase 1 — Publicador Meta (Facebook + Instagram Reels) · Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `atiko-agent` pueda conectar (OAuth) la Página de Facebook + Instagram Business de un cliente y publicar en Facebook (texto/foto) e Instagram Reels (video) desde el backend.

**Architecture:** Nuevo módulo `services/social/` dentro del agente Express existente. Adaptadores por red con interfaz común, inyección de dependencias (cliente HTTP, store de tokens) para testear sin red ni DB. Tokens por cliente en Postgres (`atiko-db`), con implementación en memoria para tests. OAuth de Meta reutiliza la app de Meta ya existente (WhatsApp).

**Tech Stack:** Node 20 + Express (existente), `axios` (existente), `pg` (nuevo), test runner nativo `node:test` (sin deps nuevas), Graph API v21.0.

---

## Estructura de archivos

```
agent/
├── db/
│   └── pool.js                       ← Pool de Postgres (DATABASE_URL)
├── migrations/
│   └── 001_social_connections.sql    ← tabla social_connections
├── services/social/
│   ├── token-store.js                ← createMemoryTokenStore / createPgTokenStore
│   ├── meta-oauth.js                 ← buildAuthUrl, exchangeCodeForToken, getLongLivedToken, listPagesWithInstagram
│   ├── publisher.js                  ← createPublisher (enruta a adaptadores)
│   └── adapters/
│       ├── meta-facebook.js          ← createFacebookAdapter
│       └── meta-instagram.js         ← createInstagramAdapter
├── routes/
│   └── social.js                     ← /api/social/connect/meta, /callback/meta, /publish
└── tests/social/
    ├── token-store.test.js
    ├── meta-oauth.test.js
    ├── meta-facebook.test.js
    ├── meta-instagram.test.js
    └── publisher.test.js
```

**Convenciones compartidas (usadas por todas las tareas):**
- `GRAPH_URL = "https://graph.facebook.com/v21.0"`
- Cliente HTTP inyectado `http`: objeto estilo axios con `http.get(url, opts)` y `http.post(url, data, opts)`, ambos devuelven `{ data }`.
- Objeto **connection**: `{ clientId, platform, accountId, accountName, accessToken, tokenExpiresAt, meta }`.
  - `platform` ∈ `"facebook" | "instagram"`. `meta` = objeto libre (jsonb) p.ej. `{ igUserId, pageId }`.

---

## Task 0: Preparar dependencias y script de tests

**Files:**
- Modify: `agent/package.json`

- [ ] **Step 1: Añadir dep `pg` y script de tests**

En `agent/package.json`, dentro de `"scripts"` añade `"test": "node --test"` y en `"dependencies"` añade `"pg": "^8.13.0"`. Resultado:

```json
{
  "name": "atiko-agent",
  "version": "1.0.0",
  "description": "Agente IA de Atiko Digital — chat web + WhatsApp Business",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js",
    "test": "node --test"
  },
  "dependencies": {
    "axios": "^1.7.2",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "express-rate-limit": "^7.3.1",
    "multer": "^1.4.5-lts.1",
    "openai": "^4.52.7",
    "pg": "^8.13.0",
    "uuid": "^10.0.0",
    "ws": "^8.21.0"
  }
}
```

- [ ] **Step 2: Instalar**

Run: `cd agent && npm install`
Expected: instala `pg` sin errores.

- [ ] **Step 3: Commit**

```bash
git add agent/package.json agent/package-lock.json
git commit -m "chore(social): add pg dependency and node:test script"
```

---

## Task 1: Token store (memoria + Postgres)

**Files:**
- Create: `agent/services/social/token-store.js`
- Test: `agent/tests/social/token-store.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/social/token-store.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { createMemoryTokenStore } = require("../../services/social/token-store");

test("save then get returns the connection", async () => {
  const store = createMemoryTokenStore();
  const conn = {
    clientId: "casaluxe", platform: "instagram",
    accountId: "178414", accountName: "CASA LUXE",
    accessToken: "TOKEN123", tokenExpiresAt: null, meta: { igUserId: "178414" },
  };
  await store.save(conn);
  const got = await store.get("casaluxe", "instagram");
  assert.deepEqual(got, conn);
});

test("save twice for same client+platform overwrites", async () => {
  const store = createMemoryTokenStore();
  await store.save({ clientId: "c", platform: "facebook", accountId: "1", accountName: "A", accessToken: "old", tokenExpiresAt: null, meta: {} });
  await store.save({ clientId: "c", platform: "facebook", accountId: "1", accountName: "A", accessToken: "new", tokenExpiresAt: null, meta: {} });
  const got = await store.get("c", "facebook");
  assert.equal(got.accessToken, "new");
});

test("get returns null when not found", async () => {
  const store = createMemoryTokenStore();
  assert.equal(await store.get("nope", "facebook"), null);
});

test("list returns all platforms for a client", async () => {
  const store = createMemoryTokenStore();
  await store.save({ clientId: "c", platform: "facebook", accountId: "1", accountName: "A", accessToken: "t", tokenExpiresAt: null, meta: {} });
  await store.save({ clientId: "c", platform: "instagram", accountId: "2", accountName: "B", accessToken: "t", tokenExpiresAt: null, meta: {} });
  const all = await store.list("c");
  assert.equal(all.length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/social/token-store.test.js`
Expected: FAIL — `Cannot find module '../../services/social/token-store'`.

- [ ] **Step 3: Write minimal implementation**

```js
// agent/services/social/token-store.js
function key(clientId, platform) {
  return clientId + ":" + platform;
}

function createMemoryTokenStore() {
  const map = new Map();
  return {
    async save(conn) {
      map.set(key(conn.clientId, conn.platform), conn);
    },
    async get(clientId, platform) {
      return map.get(key(clientId, platform)) || null;
    },
    async list(clientId) {
      return [...map.values()].filter((c) => c.clientId === clientId);
    },
  };
}

// Implementación Postgres con la MISMA interfaz. Requiere la tabla de la migración 001.
function createPgTokenStore({ pool }) {
  return {
    async save(conn) {
      await pool.query(
        `INSERT INTO social_connections
           (client_id, platform, account_id, account_name, access_token, token_expires_at, meta)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (client_id, platform)
         DO UPDATE SET account_id=$3, account_name=$4, access_token=$5,
                       token_expires_at=$6, meta=$7, updated_at=now()`,
        [conn.clientId, conn.platform, conn.accountId, conn.accountName,
         conn.accessToken, conn.tokenExpiresAt, conn.meta]
      );
    },
    async get(clientId, platform) {
      const { rows } = await pool.query(
        `SELECT client_id, platform, account_id, account_name, access_token,
                token_expires_at, meta
         FROM social_connections WHERE client_id=$1 AND platform=$2`,
        [clientId, platform]
      );
      if (rows.length === 0) return null;
      return rowToConn(rows[0]);
    },
    async list(clientId) {
      const { rows } = await pool.query(
        `SELECT client_id, platform, account_id, account_name, access_token,
                token_expires_at, meta
         FROM social_connections WHERE client_id=$1`,
        [clientId]
      );
      return rows.map(rowToConn);
    },
  };
}

function rowToConn(r) {
  return {
    clientId: r.client_id, platform: r.platform, accountId: r.account_id,
    accountName: r.account_name, accessToken: r.access_token,
    tokenExpiresAt: r.token_expires_at, meta: r.meta || {},
  };
}

module.exports = { createMemoryTokenStore, createPgTokenStore };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/social/token-store.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/services/social/token-store.js agent/tests/social/token-store.test.js
git commit -m "feat(social): token store (memory + postgres)"
```

---

## Task 2: Migración SQL de la tabla + pool de Postgres

**Files:**
- Create: `agent/migrations/001_social_connections.sql`
- Create: `agent/db/pool.js`

- [ ] **Step 1: Crear la migración SQL**

```sql
-- agent/migrations/001_social_connections.sql
CREATE TABLE IF NOT EXISTS social_connections (
  id               BIGSERIAL PRIMARY KEY,
  client_id        TEXT NOT NULL,
  platform         TEXT NOT NULL,
  account_id       TEXT NOT NULL,
  account_name     TEXT,
  access_token     TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  meta             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, platform)
);
```

- [ ] **Step 2: Crear el pool**

```js
// agent/db/pool.js
const { Pool } = require("pg");

// DATABASE_URL apunta a atiko-db (Postgres). Reutilizable por otros módulos.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = { pool };
```

- [ ] **Step 3: Aplicar la migración en la DB (manual, una vez)**

Run: `psql "$DATABASE_URL" -f agent/migrations/001_social_connections.sql`
Expected: `CREATE TABLE`.
(Si `DATABASE_URL` aún no está, este paso se hace al desplegar; no bloquea los tests, que usan el store en memoria.)

- [ ] **Step 4: Commit**

```bash
git add agent/migrations/001_social_connections.sql agent/db/pool.js
git commit -m "feat(social): social_connections migration + pg pool"
```

---

## Task 3: OAuth de Meta — construir URL de autorización

**Files:**
- Create: `agent/services/social/meta-oauth.js`
- Test: `agent/tests/social/meta-oauth.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/social/meta-oauth.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const oauth = require("../../services/social/meta-oauth");

test("buildAuthUrl includes app id, redirect, scopes and state", () => {
  const url = oauth.buildAuthUrl({
    appId: "APP123",
    redirectUri: "https://agent.atikodigital.cl/api/social/callback/meta",
    state: "casaluxe",
  });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, "https://www.facebook.com/v21.0/dialog/oauth");
  assert.equal(u.searchParams.get("client_id"), "APP123");
  assert.equal(u.searchParams.get("state"), "casaluxe");
  assert.equal(u.searchParams.get("redirect_uri"), "https://agent.atikodigital.cl/api/social/callback/meta");
  const scope = u.searchParams.get("scope");
  assert.match(scope, /pages_manage_posts/);
  assert.match(scope, /instagram_content_publish/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/social/meta-oauth.test.js`
Expected: FAIL — `oauth.buildAuthUrl is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// agent/services/social/meta-oauth.js
const GRAPH_URL = "https://graph.facebook.com/v21.0";

const DEFAULT_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
];

function buildAuthUrl({ appId, redirectUri, state, scopes = DEFAULT_SCOPES }) {
  const u = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  u.searchParams.set("client_id", appId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("scope", scopes.join(","));
  u.searchParams.set("response_type", "code");
  return u.toString();
}

module.exports = { GRAPH_URL, DEFAULT_SCOPES, buildAuthUrl };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/social/meta-oauth.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agent/services/social/meta-oauth.js agent/tests/social/meta-oauth.test.js
git commit -m "feat(social): meta oauth buildAuthUrl"
```

---

## Task 4: OAuth de Meta — intercambio de código y token largo

**Files:**
- Modify: `agent/services/social/meta-oauth.js`
- Modify: `agent/tests/social/meta-oauth.test.js`

- [ ] **Step 1: Write the failing tests (append)**

Añade al final de `agent/tests/social/meta-oauth.test.js`:

```js
function fakeHttp(routes) {
  return {
    async get(url) {
      const u = new URL(url);
      const handler = routes[u.pathname];
      if (!handler) throw new Error("no route for " + u.pathname);
      return { data: handler(u.searchParams) };
    },
  };
}

test("exchangeCodeForToken returns short-lived token", async () => {
  const http = fakeHttp({
    "/v21.0/oauth/access_token": (p) => {
      assert.equal(p.get("code"), "CODE1");
      return { access_token: "SHORT", token_type: "bearer" };
    },
  });
  const res = await oauth.exchangeCodeForToken({
    http, appId: "A", appSecret: "S",
    redirectUri: "https://x/cb", code: "CODE1",
  });
  assert.equal(res.accessToken, "SHORT");
});

test("getLongLivedToken exchanges short for long", async () => {
  const http = fakeHttp({
    "/v21.0/oauth/access_token": (p) => {
      assert.equal(p.get("grant_type"), "fb_exchange_token");
      assert.equal(p.get("fb_exchange_token"), "SHORT");
      return { access_token: "LONG", expires_in: 5184000 };
    },
  });
  const res = await oauth.getLongLivedToken({ http, appId: "A", appSecret: "S", shortLivedToken: "SHORT" });
  assert.equal(res.accessToken, "LONG");
  assert.equal(res.expiresIn, 5184000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/social/meta-oauth.test.js`
Expected: FAIL — `oauth.exchangeCodeForToken is not a function`.

- [ ] **Step 3: Write minimal implementation (append before module.exports, update exports)**

En `agent/services/social/meta-oauth.js`, añade estas funciones y amplía `module.exports`:

```js
async function exchangeCodeForToken({ http, appId, appSecret, redirectUri, code }) {
  const u = new URL(GRAPH_URL + "/oauth/access_token");
  u.searchParams.set("client_id", appId);
  u.searchParams.set("client_secret", appSecret);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("code", code);
  const { data } = await http.get(u.toString());
  return { accessToken: data.access_token };
}

async function getLongLivedToken({ http, appId, appSecret, shortLivedToken }) {
  const u = new URL(GRAPH_URL + "/oauth/access_token");
  u.searchParams.set("grant_type", "fb_exchange_token");
  u.searchParams.set("client_id", appId);
  u.searchParams.set("client_secret", appSecret);
  u.searchParams.set("fb_exchange_token", shortLivedToken);
  const { data } = await http.get(u.toString());
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}
```

```js
module.exports = {
  GRAPH_URL, DEFAULT_SCOPES, buildAuthUrl,
  exchangeCodeForToken, getLongLivedToken,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/social/meta-oauth.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/services/social/meta-oauth.js agent/tests/social/meta-oauth.test.js
git commit -m "feat(social): meta oauth token exchange + long-lived"
```

---

## Task 5: OAuth de Meta — listar Páginas con su Instagram

**Files:**
- Modify: `agent/services/social/meta-oauth.js`
- Modify: `agent/tests/social/meta-oauth.test.js`

- [ ] **Step 1: Write the failing test (append)**

```js
test("listPagesWithInstagram returns pages and linked ig account", async () => {
  const http = {
    async get(url) {
      const u = new URL(url);
      if (u.pathname === "/v21.0/me/accounts") {
        return { data: { data: [
          { id: "PAGE1", name: "CASA LUXE", access_token: "PAGETOKEN1" },
        ] } };
      }
      if (u.pathname === "/v21.0/PAGE1") {
        return { data: { instagram_business_account: { id: "IG1" } } };
      }
      throw new Error("no route for " + u.pathname);
    },
  };
  const pages = await oauth.listPagesWithInstagram({ http, userToken: "USERTOK" });
  assert.equal(pages.length, 1);
  assert.equal(pages[0].pageId, "PAGE1");
  assert.equal(pages[0].pageName, "CASA LUXE");
  assert.equal(pages[0].pageAccessToken, "PAGETOKEN1");
  assert.equal(pages[0].igUserId, "IG1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/social/meta-oauth.test.js`
Expected: FAIL — `oauth.listPagesWithInstagram is not a function`.

- [ ] **Step 3: Write minimal implementation (append, update exports)**

```js
async function listPagesWithInstagram({ http, userToken }) {
  const accountsUrl = new URL(GRAPH_URL + "/me/accounts");
  accountsUrl.searchParams.set("fields", "id,name,access_token");
  accountsUrl.searchParams.set("access_token", userToken);
  const { data: accounts } = await http.get(accountsUrl.toString());

  const pages = [];
  for (const page of accounts.data || []) {
    const pageUrl = new URL(GRAPH_URL + "/" + page.id);
    pageUrl.searchParams.set("fields", "instagram_business_account");
    pageUrl.searchParams.set("access_token", page.access_token);
    const { data: pageData } = await http.get(pageUrl.toString());
    pages.push({
      pageId: page.id,
      pageName: page.name,
      pageAccessToken: page.access_token,
      igUserId: pageData.instagram_business_account
        ? pageData.instagram_business_account.id
        : null,
    });
  }
  return pages;
}
```

Actualiza `module.exports` para incluir `listPagesWithInstagram`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/social/meta-oauth.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/services/social/meta-oauth.js agent/tests/social/meta-oauth.test.js
git commit -m "feat(social): meta oauth list pages with instagram"
```

---

## Task 6: Adaptador Facebook (publicar texto y foto)

**Files:**
- Create: `agent/services/social/adapters/meta-facebook.js`
- Test: `agent/tests/social/meta-facebook.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/social/meta-facebook.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { createFacebookAdapter } = require("../../services/social/adapters/meta-facebook");

function recordingHttp(responses) {
  const calls = [];
  return {
    calls,
    async post(url, data) {
      calls.push({ url, data });
      return { data: responses.shift() || {} };
    },
  };
}

test("publishText posts to /{pageId}/feed with message + token", async () => {
  const http = recordingHttp([{ id: "PAGE1_POST1" }]);
  const fb = createFacebookAdapter({ http });
  const res = await fb.publishText({ pageId: "PAGE1", pageToken: "TOK", message: "Hola" });
  assert.equal(res.id, "PAGE1_POST1");
  assert.match(http.calls[0].url, /\/v21\.0\/PAGE1\/feed$/);
  assert.equal(http.calls[0].data.message, "Hola");
  assert.equal(http.calls[0].data.access_token, "TOK");
});

test("publishPhoto posts to /{pageId}/photos with url + caption", async () => {
  const http = recordingHttp([{ id: "PHOTO1", post_id: "PAGE1_POST2" }]);
  const fb = createFacebookAdapter({ http });
  const res = await fb.publishPhoto({ pageId: "PAGE1", pageToken: "TOK", imageUrl: "https://x/img.jpg", caption: "pie" });
  assert.equal(res.id, "PHOTO1");
  assert.match(http.calls[0].url, /\/v21\.0\/PAGE1\/photos$/);
  assert.equal(http.calls[0].data.url, "https://x/img.jpg");
  assert.equal(http.calls[0].data.caption, "pie");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/social/meta-facebook.test.js`
Expected: FAIL — `Cannot find module '.../meta-facebook'`.

- [ ] **Step 3: Write minimal implementation**

```js
// agent/services/social/adapters/meta-facebook.js
const GRAPH_URL = "https://graph.facebook.com/v21.0";

function createFacebookAdapter({ http, graphUrl = GRAPH_URL }) {
  return {
    async publishText({ pageId, pageToken, message }) {
      const { data } = await http.post(graphUrl + "/" + pageId + "/feed", {
        message,
        access_token: pageToken,
      });
      return data;
    },
    async publishPhoto({ pageId, pageToken, imageUrl, caption }) {
      const { data } = await http.post(graphUrl + "/" + pageId + "/photos", {
        url: imageUrl,
        caption,
        access_token: pageToken,
      });
      return data;
    },
  };
}

module.exports = { createFacebookAdapter };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/social/meta-facebook.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/services/social/adapters/meta-facebook.js agent/tests/social/meta-facebook.test.js
git commit -m "feat(social): facebook adapter (text + photo)"
```

---

## Task 7: Adaptador Instagram (publicar Reels: container → poll → publish)

**Files:**
- Create: `agent/services/social/adapters/meta-instagram.js`
- Test: `agent/tests/social/meta-instagram.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/social/meta-instagram.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { createInstagramAdapter } = require("../../services/social/adapters/meta-instagram");

test("publishReel creates container, polls until FINISHED, then publishes", async () => {
  const posts = [];
  const statuses = ["IN_PROGRESS", "FINISHED"];
  const http = {
    async post(url, data) {
      posts.push({ url, data });
      if (url.endsWith("/media")) return { data: { id: "CONTAINER1" } };
      if (url.endsWith("/media_publish")) return { data: { id: "IG_MEDIA1" } };
      throw new Error("unexpected post " + url);
    },
    async get(url) {
      // status polling del contenedor
      assert.match(url, /\/CONTAINER1\?|\/CONTAINER1$/);
      return { data: { status_code: statuses.shift() } };
    },
  };
  const ig = createInstagramAdapter({ http, sleep: async () => {} });
  const res = await ig.publishReel({
    igUserId: "IG1", token: "TOK",
    videoUrl: "https://x/reel.mp4", caption: "viral",
    pollIntervalMs: 0, maxPolls: 5,
  });
  assert.equal(res.id, "IG_MEDIA1");
  // 1er post: crear contenedor con media_type=REELS
  assert.match(posts[0].url, /\/v21\.0\/IG1\/media$/);
  assert.equal(posts[0].data.media_type, "REELS");
  assert.equal(posts[0].data.video_url, "https://x/reel.mp4");
  assert.equal(posts[0].data.caption, "viral");
  // último post: publicar con creation_id
  assert.match(posts[1].url, /\/v21\.0\/IG1\/media_publish$/);
  assert.equal(posts[1].data.creation_id, "CONTAINER1");
});

test("publishReel throws if status becomes ERROR", async () => {
  const http = {
    async post(url) {
      if (url.endsWith("/media")) return { data: { id: "C1" } };
      throw new Error("should not publish");
    },
    async get() { return { data: { status_code: "ERROR" } }; },
  };
  const ig = createInstagramAdapter({ http, sleep: async () => {} });
  await assert.rejects(
    () => ig.publishReel({ igUserId: "IG1", token: "T", videoUrl: "u", caption: "c", pollIntervalMs: 0, maxPolls: 3 }),
    /ERROR/
  );
});

test("publishReel throws if not finished within maxPolls", async () => {
  const http = {
    async post(url) { if (url.endsWith("/media")) return { data: { id: "C1" } }; },
    async get() { return { data: { status_code: "IN_PROGRESS" } }; },
  };
  const ig = createInstagramAdapter({ http, sleep: async () => {} });
  await assert.rejects(
    () => ig.publishReel({ igUserId: "IG1", token: "T", videoUrl: "u", caption: "c", pollIntervalMs: 0, maxPolls: 2 }),
    /timed out|no termin/i
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/social/meta-instagram.test.js`
Expected: FAIL — `Cannot find module '.../meta-instagram'`.

- [ ] **Step 3: Write minimal implementation**

```js
// agent/services/social/adapters/meta-instagram.js
const GRAPH_URL = "https://graph.facebook.com/v21.0";

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createInstagramAdapter({ http, graphUrl = GRAPH_URL, sleep = defaultSleep }) {
  async function createContainer({ igUserId, token, videoUrl, caption }) {
    const { data } = await http.post(graphUrl + "/" + igUserId + "/media", {
      media_type: "REELS",
      video_url: videoUrl,
      caption,
      access_token: token,
    });
    return data.id;
  }

  async function waitUntilFinished({ containerId, token, pollIntervalMs, maxPolls }) {
    for (let i = 0; i < maxPolls; i++) {
      const u = new URL(graphUrl + "/" + containerId);
      u.searchParams.set("fields", "status_code");
      u.searchParams.set("access_token", token);
      const { data } = await http.get(u.toString());
      if (data.status_code === "FINISHED") return;
      if (data.status_code === "ERROR") {
        throw new Error("Instagram container status: ERROR");
      }
      await sleep(pollIntervalMs);
    }
    throw new Error("Instagram container no terminó (timed out) tras " + maxPolls + " intentos");
  }

  async function publishReel({ igUserId, token, videoUrl, caption, pollIntervalMs = 3000, maxPolls = 20 }) {
    const containerId = await createContainer({ igUserId, token, videoUrl, caption });
    await waitUntilFinished({ containerId, token, pollIntervalMs, maxPolls });
    const { data } = await http.post(graphUrl + "/" + igUserId + "/media_publish", {
      creation_id: containerId,
      access_token: token,
    });
    return data;
  }

  return { publishReel };
}

module.exports = { createInstagramAdapter };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/social/meta-instagram.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/services/social/adapters/meta-instagram.js agent/tests/social/meta-instagram.test.js
git commit -m "feat(social): instagram reels adapter (container/poll/publish)"
```

---

## Task 8: Publisher (enruta cliente+plataforma al adaptador, usando el token store)

**Files:**
- Create: `agent/services/social/publisher.js`
- Test: `agent/tests/social/publisher.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/social/publisher.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { createPublisher } = require("../../services/social/publisher");
const { createMemoryTokenStore } = require("../../services/social/token-store");

test("publish to instagram uses stored ig token + igUserId", async () => {
  const store = createMemoryTokenStore();
  await store.save({
    clientId: "casaluxe", platform: "instagram",
    accountId: "IG1", accountName: "CASA LUXE",
    accessToken: "IGTOKEN", tokenExpiresAt: null, meta: { igUserId: "IG1" },
  });
  let received = null;
  const instagram = { async publishReel(args) { received = args; return { id: "PUBLISHED" }; } };
  const facebook = { async publishText() { throw new Error("wrong adapter"); } };

  const publisher = createPublisher({ tokenStore: store, facebook, instagram });
  const res = await publisher.publish({
    clientId: "casaluxe", platform: "instagram",
    videoUrl: "https://x/r.mp4", caption: "hola",
  });
  assert.equal(res.id, "PUBLISHED");
  assert.equal(received.igUserId, "IG1");
  assert.equal(received.token, "IGTOKEN");
  assert.equal(received.videoUrl, "https://x/r.mp4");
});

test("publish to facebook text uses page token + pageId", async () => {
  const store = createMemoryTokenStore();
  await store.save({
    clientId: "casaluxe", platform: "facebook",
    accountId: "PAGE1", accountName: "CASA LUXE",
    accessToken: "PAGETOKEN", tokenExpiresAt: null, meta: { pageId: "PAGE1" },
  });
  let received = null;
  const facebook = { async publishText(args) { received = args; return { id: "FBPOST" }; } };
  const instagram = { async publishReel() { throw new Error("wrong adapter"); } };

  const publisher = createPublisher({ tokenStore: store, facebook, instagram });
  const res = await publisher.publish({ clientId: "casaluxe", platform: "facebook", message: "Hola" });
  assert.equal(res.id, "FBPOST");
  assert.equal(received.pageId, "PAGE1");
  assert.equal(received.pageToken, "PAGETOKEN");
  assert.equal(received.message, "Hola");
});

test("publish throws if client has no connection for platform", async () => {
  const publisher = createPublisher({
    tokenStore: createMemoryTokenStore(),
    facebook: {}, instagram: {},
  });
  await assert.rejects(
    () => publisher.publish({ clientId: "x", platform: "facebook", message: "h" }),
    /no.*conexión|not connected/i
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/social/publisher.test.js`
Expected: FAIL — `Cannot find module '.../publisher'`.

- [ ] **Step 3: Write minimal implementation**

```js
// agent/services/social/publisher.js
function createPublisher({ tokenStore, facebook, instagram }) {
  async function publish({ clientId, platform, message, imageUrl, videoUrl, caption }) {
    const conn = await tokenStore.get(clientId, platform);
    if (!conn) {
      throw new Error("El cliente '" + clientId + "' no tiene conexión para " + platform + " (not connected)");
    }
    if (platform === "instagram") {
      return instagram.publishReel({
        igUserId: conn.meta.igUserId || conn.accountId,
        token: conn.accessToken,
        videoUrl,
        caption: caption || message || "",
      });
    }
    if (platform === "facebook") {
      const pageId = conn.meta.pageId || conn.accountId;
      if (imageUrl) {
        return facebook.publishPhoto({ pageId, pageToken: conn.accessToken, imageUrl, caption: caption || message || "" });
      }
      return facebook.publishText({ pageId, pageToken: conn.accessToken, message: message || caption || "" });
    }
    throw new Error("Plataforma no soportada: " + platform);
  }
  return { publish };
}

module.exports = { createPublisher };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/social/publisher.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/services/social/publisher.js agent/tests/social/publisher.test.js
git commit -m "feat(social): publisher routing client+platform to adapters"
```

---

## Task 9: Rutas Express (connect, callback, publish) + montaje en server.js

**Files:**
- Create: `agent/routes/social.js`
- Modify: `agent/server.js:9-11` (requires) y `agent/server.js:74-76` (montaje de rutas)

- [ ] **Step 1: Crear las rutas**

```js
// agent/routes/social.js
const express = require("express");
const axios = require("axios");
const oauth = require("../services/social/meta-oauth");
const { createPublisher } = require("../services/social/publisher");
const { createFacebookAdapter } = require("../services/social/adapters/meta-facebook");
const { createInstagramAdapter } = require("../services/social/adapters/meta-instagram");
const { createMemoryTokenStore, createPgTokenStore } = require("../services/social/token-store");

const router = express.Router();

// Token store: Postgres si hay DATABASE_URL, si no en memoria (dev).
let tokenStore;
if (process.env.DATABASE_URL) {
  const { pool } = require("../db/pool");
  tokenStore = createPgTokenStore({ pool });
} else {
  console.warn("[social] DATABASE_URL no definido — usando token store en MEMORIA (no persiste).");
  tokenStore = createMemoryTokenStore();
}

const http = axios;
const facebook = createFacebookAdapter({ http });
const instagram = createInstagramAdapter({ http });
const publisher = createPublisher({ tokenStore, facebook, instagram });

const APP_ID = process.env.META_APP_ID;
const APP_SECRET = process.env.META_APP_SECRET;
const REDIRECT_URI = process.env.META_REDIRECT_URI;

// 1) El cliente abre este link para conectar sus redes. ?clientId=casaluxe
router.get("/connect/meta", function (req, res) {
  const clientId = req.query.clientId;
  if (!clientId) return res.status(400).json({ error: "Falta clientId" });
  const url = oauth.buildAuthUrl({ appId: APP_ID, redirectUri: REDIRECT_URI, state: clientId });
  res.redirect(url);
});

// 2) Meta redirige aquí con ?code=...&state=clientId
router.get("/callback/meta", async function (req, res) {
  try {
    const { code, state: clientId } = req.query;
    if (!code || !clientId) return res.status(400).json({ error: "Falta code o state" });

    const short = await oauth.exchangeCodeForToken({ http, appId: APP_ID, appSecret: APP_SECRET, redirectUri: REDIRECT_URI, code });
    const long = await oauth.getLongLivedToken({ http, appId: APP_ID, appSecret: APP_SECRET, shortLivedToken: short.accessToken });
    const pages = await oauth.listPagesWithInstagram({ http, userToken: long.accessToken });

    const expiresAt = long.expiresIn ? new Date(Date.now() + long.expiresIn * 1000) : null;
    const saved = [];
    for (const p of pages) {
      await tokenStore.save({
        clientId, platform: "facebook", accountId: p.pageId, accountName: p.pageName,
        accessToken: p.pageAccessToken, tokenExpiresAt: expiresAt, meta: { pageId: p.pageId },
      });
      saved.push({ platform: "facebook", account: p.pageName });
      if (p.igUserId) {
        await tokenStore.save({
          clientId, platform: "instagram", accountId: p.igUserId, accountName: p.pageName,
          accessToken: p.pageAccessToken, tokenExpiresAt: expiresAt, meta: { igUserId: p.igUserId, pageId: p.pageId },
        });
        saved.push({ platform: "instagram", account: p.pageName });
      }
    }
    res.json({ ok: true, clientId, connected: saved });
  } catch (err) {
    console.error("[social/callback] ", err.message);
    res.status(500).json({ error: "Error conectando con Meta", detail: err.message });
  }
});

// 3) Publicar. body: { clientId, platform, message?, imageUrl?, videoUrl?, caption? }
router.post("/publish", async function (req, res) {
  try {
    const { clientId, platform } = req.body;
    if (!clientId || !platform) return res.status(400).json({ error: "Falta clientId o platform" });
    const result = await publisher.publish(req.body);
    res.json({ ok: true, result });
  } catch (err) {
    console.error("[social/publish] ", err.message);
    res.status(500).json({ error: "Error publicando", detail: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 2: Montar las rutas en server.js**

En `agent/server.js`, junto a los otros `require` de rutas (línea ~9-11) añade:

```js
const socialRoutes = require("./routes/social");
```

Y junto a los otros `app.use(...)` de rutas (línea ~74-76) añade:

```js
app.use("/api/social", socialRoutes);
```

- [ ] **Step 3: Verificar que el servidor arranca**

Run: `cd agent && node -e "require('./routes/social'); console.log('social route OK')"`
Expected: imprime `[social] DATABASE_URL no definido ...` y luego `social route OK` (sin errores de require).

- [ ] **Step 4: Verificar la suite completa**

Run: `cd agent && npm test`
Expected: PASS — todos los tests de `tests/social/` en verde.

- [ ] **Step 5: Commit**

```bash
git add agent/routes/social.js agent/server.js
git commit -m "feat(social): express routes connect/callback/publish + mount"
```

---

## Task 10: Variables de entorno y documentación

**Files:**
- Modify: `agent/.env.example` (crear si no existe)
- Modify: `agent/README.md`

- [ ] **Step 1: Añadir variables al .env.example**

Añade al final de `agent/.env.example`:

```
# ── Redes sociales (Publicador Meta) ─────────────────────────
# App de Meta (la MISMA que WhatsApp). developers.facebook.com
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=https://agent.atikodigital.cl/api/social/callback/meta
# Postgres atiko-db (si falta, el token store usa memoria — solo dev)
DATABASE_URL=
```

- [ ] **Step 2: Documentar el módulo en el README**

Añade una sección al final de `agent/README.md`:

```markdown
## 📤 Redes sociales — Publicador Meta (Fase 1)

Conecta y publica en Facebook + Instagram de clientes desde el agente.

### Endpoints
| Método | URL | Descripción |
|--------|-----|-------------|
| `GET`  | `/api/social/connect/meta?clientId=casaluxe` | Redirige al OAuth de Meta |
| `GET`  | `/api/social/callback/meta` | Callback: guarda tokens del cliente |
| `POST` | `/api/social/publish` | Publica `{clientId, platform, videoUrl/message/imageUrl, caption}` |

### Requisitos
- App de Meta con permisos `pages_manage_posts`, `instagram_content_publish` (App Review + Advanced Access para cuentas de terceros).
- Cuenta IG del cliente: Business/Creator vinculada a Página de FB.
- `DATABASE_URL` (Postgres atiko-db) para persistir tokens.

### Probar en local (modo desarrollo, sin App Review)
Usa una cuenta donde TÚ eres admin de la app de Meta. Ejemplo de publicación IG Reel:
```bash
curl -X POST http://localhost:3000/api/social/publish \
  -H "Content-Type: application/json" \
  -d '{"clientId":"atiko","platform":"instagram","videoUrl":"https://.../reel.mp4","caption":"prueba"}'
```
```

- [ ] **Step 3: Commit**

```bash
git add agent/.env.example agent/README.md
git commit -m "docs(social): env vars + README publicador Meta"
```

---

## Notas de cierre

- **Bloqueante externo (paralelo, no código):** App Review de Meta + Business Verification para Advanced Access. Mientras tanto, todo se prueba con cuentas donde José es admin de la app.
- **Fuera de alcance de esta fase (van en fases siguientes):** scheduler CRON de publicación programada, refresh automático de tokens al expirar, TikTok/LinkedIn/X, y el motor de generación de contenido (Gemini + Remotion).
- **El video de IG debe estar en una URL pública** (requisito de Meta). En la fase de generación, el MP4 de Remotion se subirá a almacenamiento accesible (ej. el propio VPS / un bucket) antes de publicar.
