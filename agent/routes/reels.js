const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const { createScriptGenerator } = require("../services/reels/script-generator");
const { createVoiceProvider } = require("../services/reels/voice");
const { createImageProvider } = require("../services/reels/images");
const { createReelEngine } = require("../services/reels/reel-engine");
const { gemini, tts, measureDuration, gen } = require("../services/reels/gemini-providers");
const { renderReel } = require("../remotion/render");

const router = express.Router();

// Carpeta pública para servir los MP4 (la necesita el Publicador de IG con URL pública).
const REELS_DIR = path.join(__dirname, "..", "public", "reels");
fs.mkdirSync(REELS_DIR, { recursive: true });

const scriptGenerator = createScriptGenerator({ gemini });
const voice = createVoiceProvider({ tts, measureDuration });
const images = createImageProvider({ gen });
const render = async (input) => {
  const out = path.join(REELS_DIR, "reel-" + crypto.randomBytes(8).toString("hex") + ".mp4");
  return renderReel(input, out);
};
const engine = createReelEngine({ scriptGenerator, voice, images, render });

// POST /api/reels/generate  body: { topic, clientId? }
router.post("/generate", async function (req, res) {
  try {
    const { topic } = req.body;
    if (!topic) return res.status(400).json({ error: "Falta topic" });
    const result = await engine.generate(topic);
    const fileName = path.basename(result.mp4Path);
    res.json({
      ok: true,
      caption: result.caption,
      hashtags: result.hashtags,
      publicUrl: "/widget/reels/" + fileName, // servido estático por el agente
      reelSpec: result.reelSpec,
    });
  } catch (err) {
    console.error("[reels/generate]", err.message);
    res.status(500).json({ error: "Error generando el reel", detail: err.message });
  }
});

module.exports = router;
