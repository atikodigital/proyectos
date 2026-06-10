const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const { createScriptGenerator } = require("../services/reels/script-generator");
const { createVoiceProvider } = require("../services/reels/voice");
const { createImageProvider } = require("../services/reels/images");
const { createReelEngine } = require("../services/reels/reel-engine");
const { createAvatarProvider } = require("../services/reels/avatar");
const { createMemoryAvatarProfiles, createPgAvatarProfiles } = require("../services/reels/avatar-profiles");
const { gemini, tts, measureDuration, gen } = require("../services/reels/gemini-providers");
const heygen = require("../services/reels/heygen-provider");
const { renderReel } = require("../remotion/render");

const router = express.Router();

// Carpeta pública para servir los MP4 (la necesita el Publicador de IG con URL pública).
const REELS_DIR = path.join(__dirname, "..", "public", "reels");
fs.mkdirSync(REELS_DIR, { recursive: true });

// Perfiles de avatar: Postgres si hay DATABASE_URL, memoria en dev.
let avatarProfiles;
if (process.env.DATABASE_URL) {
  const { pool } = require("../db/pool");
  avatarProfiles = createPgAvatarProfiles({ pool });
} else {
  console.warn("[reels] DATABASE_URL no definido — avatar profiles en MEMORIA (no persiste).");
  avatarProfiles = createMemoryAvatarProfiles();
}

const scriptGenerator = createScriptGenerator({ gemini });
const voice = createVoiceProvider({ tts, measureDuration });
const images = createImageProvider({ gen });
const avatar = process.env.HEYGEN_API_KEY ? createAvatarProvider({ heygen, voice }) : null;
const render = async (input) => {
  const out = path.join(REELS_DIR, "reel-" + crypto.randomBytes(8).toString("hex") + ".mp4");
  return renderReel(input, out);
};
const engine = createReelEngine({ scriptGenerator, voice, images, render, avatar });

// POST /api/reels/generate  body: { topic, clientId? }
// Si clientId tiene avatar profile CON consentimiento, el reel sale híbrido (avatar+broll).
router.post("/generate", async function (req, res) {
  try {
    const { topic, clientId } = req.body;
    if (!topic) return res.status(400).json({ error: "Falta topic" });

    let avatarId = null;
    let avatarType = "talking_photo";
    if (clientId && avatar) {
      const profile = await avatarProfiles.getAuthorized(clientId);
      if (profile) {
        avatarId = profile.heygenAvatarId;
        avatarType = profile.avatarType || "talking_photo";
      }
    }

    const result = await engine.generate(topic, { avatarId, avatarType });
    const fileName = path.basename(result.mp4Path);
    res.json({
      ok: true,
      caption: result.caption,
      hashtags: result.hashtags,
      publicUrl: "/widget/reels/" + fileName,
      usedAvatar: result.usedAvatar,
      degraded: result.degraded,
      reelSpec: result.reelSpec,
    });
  } catch (err) {
    console.error("[reels/generate]", err.message);
    res.status(500).json({ error: "Error generando el reel", detail: err.message });
  }
});

// Guard de administración: este endpoint gobierna el CONSENTIMIENTO legal.
// Con ADMIN_API_TOKEN definido exige el header x-admin-token; sin definir, solo avisa (dev).
function requireAdmin(req, res, next) {
  const token = process.env.ADMIN_API_TOKEN;
  if (!token) {
    console.warn("[reels] ADMIN_API_TOKEN no definido — /avatar-profile SIN auth (solo dev).");
    return next();
  }
  if (req.headers["x-admin-token"] !== token) {
    return res.status(401).json({ error: "No autorizado" });
  }
  next();
}

// POST /api/reels/avatar-profile  body: { clientId, displayName, heygenAvatarId, consentSigned }
// Registro manual del perfil (v1). El consentimiento escrito es responsabilidad del contrato.
router.post("/avatar-profile", requireAdmin, async function (req, res) {
  try {
    const { clientId, displayName, heygenAvatarId, avatarType, consentSigned } = req.body;
    if (!clientId || !heygenAvatarId) {
      return res.status(400).json({ error: "Falta clientId o heygenAvatarId" });
    }
    await avatarProfiles.save({
      clientId, displayName: displayName || clientId, heygenAvatarId,
      avatarType: avatarType === "avatar" ? "avatar" : "talking_photo",
      consentSigned: !!consentSigned,
      consentDate: consentSigned ? new Date().toISOString() : null,
    });
    res.json({ ok: true, clientId, consentSigned: !!consentSigned });
  } catch (err) {
    console.error("[reels/avatar-profile]", err.message);
    res.status(500).json({ error: "Error guardando avatar profile", detail: err.message });
  }
});

module.exports = router;
