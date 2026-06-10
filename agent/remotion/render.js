// renderReel(inputProps, outPath) -> outPath.
// inputProps = { title, scenes:[{text,imagePath,isFallback,fallbackColor,audioPath,durationMs}] }
const path = require("path");
const { bundle } = require("@remotion/bundler");
const { renderMedia, selectComposition } = require("@remotion/renderer");

let cachedBundleUrl = null;

async function getBundle() {
  if (cachedBundleUrl) return cachedBundleUrl;
  cachedBundleUrl = await bundle({
    entryPoint: path.join(__dirname, "index.js"),
  });
  return cachedBundleUrl;
}

async function renderReel(inputProps, outPath) {
  const serveUrl = await getBundle();
  const composition = await selectComposition({
    serveUrl,
    id: "Reel",
    inputProps,
  });
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outPath,
    inputProps,
  });
  return outPath;
}

module.exports = { renderReel };
