const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const { createPostScriptGenerator } = require("../services/posts/post-script-generator");
const { createImagePostEngine } = require("../services/posts/image-post-engine");
const { createImageProvider } = require("../services/reels/images");
const { gemini, gen } = require("../services/reels/gemini-providers");
const { renderPostImage } = require("../remotion/render-still");

const router = express.Router();

// Carpeta pública para servir los PNG (URLs públicas para el planificador/publicador).
const POSTS_DIR = path.join(__dirname, "..", "public", "posts");
fs.mkdirSync(POSTS_DIR, { recursive: true });

const scriptGenerator = createPostScriptGenerator({ gemini });
const images = createImageProvider({ gen });
const renderStill = async (slideProps) => {
  const out = path.join(POSTS_DIR, "post-" + crypto.randomBytes(8).toString("hex") + ".png");
  return renderPostImage(slideProps, out);
};
const engine = createImagePostEngine({ scriptGenerator, images, renderStill });

const FORMATS = ["post", "carousel", "story"];

// POST /api/posts/generate  body: { topic, format, clientId? }
router.post("/generate", async function (req, res) {
  try {
    const { topic, format } = req.body;
    if (!topic) return res.status(400).json({ error: "Falta topic" });
    if (!FORMATS.includes(format)) {
      return res.status(400).json({ error: "format debe ser uno de: " + FORMATS.join(", ") });
    }
    const result = await engine.generate(topic, format);
    res.json({
      ok: true,
      format,
      caption: result.caption,
      hashtags: result.hashtags,
      imageUrls: result.imagePaths.map((p) => "/widget/posts/" + path.basename(p)),
      postSpec: result.postSpec,
    });
  } catch (err) {
    console.error("[posts/generate]", err.message);
    res.status(500).json({ error: "Error generando el post", detail: err.message });
  }
});

module.exports = router;
