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
