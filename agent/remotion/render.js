// renderReel(inputProps, outPath) -> outPath.
// inputProps = { title, scenes:[{text,imagePath,isFallback,fallbackColor,audioPath,durationMs}] }
// Los assets locales (imagen/audio) se copian al public/ del bundle y se referencian
// con staticFile() — el Chrome headless de Remotion no carga file:// de forma fiable.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { bundle } = require("@remotion/bundler");
const { renderMedia, selectComposition } = require("@remotion/renderer");

let cachedBundleUrl = null;

async function getBundle() {
  if (cachedBundleUrl) return cachedBundleUrl;
  try {
    cachedBundleUrl = await bundle({
      entryPoint: path.join(__dirname, "index.js"),
    });
  } catch (e) {
    cachedBundleUrl = null; // self-heal: reintentar el bundle en la próxima petición
    throw e;
  }
  return cachedBundleUrl;
}

// Copia los assets de cada escena al public/ del bundle. Devuelve {scenes, cleanup}.
function stageAssets(scenes, publicDir) {
  fs.mkdirSync(publicDir, { recursive: true });
  const renderId = crypto.randomBytes(6).toString("hex");
  const staged = [];
  const outScenes = (scenes || []).map((s, i) => {
    const scene = { ...s };
    if (s.imagePath) {
      const name = renderId + "-img-" + i + (path.extname(s.imagePath) || ".png");
      fs.copyFileSync(s.imagePath, path.join(publicDir, name));
      staged.push(path.join(publicDir, name));
      scene.imageSrc = name;
    }
    if (s.audioPath) {
      const name = renderId + "-aud-" + i + (path.extname(s.audioPath) || ".wav");
      fs.copyFileSync(s.audioPath, path.join(publicDir, name));
      staged.push(path.join(publicDir, name));
      scene.audioSrc = name;
    }
    if (s.videoPath) {
      const name = renderId + "-vid-" + i + (path.extname(s.videoPath) || ".mp4");
      fs.copyFileSync(s.videoPath, path.join(publicDir, name));
      staged.push(path.join(publicDir, name));
      scene.videoSrc = name;
    }
    return scene;
  });
  const cleanup = () => {
    for (const f of staged) {
      try { fs.unlinkSync(f); } catch (e) { /* ya borrado */ }
    }
  };
  return { scenes: outScenes, cleanup };
}

async function renderReel(inputProps, outPath) {
  const serveUrl = await getBundle();
  const { scenes, cleanup } = stageAssets(inputProps.scenes, path.join(serveUrl, "public"));
  const props = { ...inputProps, scenes };
  try {
    const composition = await selectComposition({
      serveUrl,
      id: "Reel",
      inputProps: props,
    });
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: outPath,
      inputProps: props,
    });
    return outPath;
  } finally {
    cleanup();
  }
}

module.exports = { renderReel };
