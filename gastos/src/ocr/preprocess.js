const sharp = require('sharp');

// Grises + contraste + reescala a máx 1800px (espejo de processDocumentImage de la app).
async function preprocessForOcr(inputBuffer) {
  const img = sharp(inputBuffer).rotate(); // respeta EXIF
  const meta = await img.metadata();
  const maxSide = Math.max(meta.width || 0, meta.height || 0);
  let pipeline = img;
  if (maxSide > 1800) {
    pipeline = pipeline.resize({ width: meta.width >= meta.height ? 1800 : null,
                                 height: meta.height > meta.width ? 1800 : null,
                                 fit: 'inside' });
  }
  return pipeline.grayscale().normalize().linear(1.2, -15).jpeg({ quality: 85 }).toBuffer();
}

module.exports = { preprocessForOcr };
