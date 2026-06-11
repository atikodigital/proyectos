// renderPostImage(inputProps, outPath) -> outPath
// inputProps = { headline, imagePath, isFallback, fallbackColor, format }
// La imagen local se copia al public/ del bundle (staticFile) igual que en los reels.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { renderStill, selectComposition } = require("@remotion/renderer");
const { getBundle } = require("./render");

async function renderPostImage(inputProps, outPath) {
  const serveUrl = await getBundle();
  const publicDir = path.join(serveUrl, "public");
  fs.mkdirSync(publicDir, { recursive: true });

  let staged = null;
  const props = { ...inputProps };
  if (inputProps.imagePath) {
    const name = "still-" + crypto.randomBytes(6).toString("hex") + (path.extname(inputProps.imagePath) || ".png");
    fs.copyFileSync(inputProps.imagePath, path.join(publicDir, name));
    staged = path.join(publicDir, name);
    props.imageSrc = name;
  }
  delete props.imagePath;

  try {
    const composition = await selectComposition({ serveUrl, id: "PostImage", inputProps: props });
    await renderStill({ composition, serveUrl, output: outPath, inputProps: props });
    return outPath;
  } finally {
    if (staged) { try { fs.unlinkSync(staged); } catch (e) { /* ya borrado */ } }
  }
}

module.exports = { renderPostImage };
