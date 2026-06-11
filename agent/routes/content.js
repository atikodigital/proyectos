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
