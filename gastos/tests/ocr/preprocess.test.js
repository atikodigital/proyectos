const sharp = require('sharp');
const { preprocessForOcr } = require('../../src/ocr/preprocess');

async function makeImage(w, h) {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 100, b: 50 } } })
    .jpeg().toBuffer();
}

test('reescala a máx 1800px y devuelve JPEG', async () => {
  const big = await makeImage(3000, 2000);
  const out = await preprocessForOcr(big);
  const meta = await sharp(out).metadata();
  expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(1800);
  expect(meta.format).toBe('jpeg');
});

test('no agranda imágenes chicas', async () => {
  const small = await makeImage(800, 600);
  const out = await preprocessForOcr(small);
  const meta = await sharp(out).metadata();
  expect(meta.width).toBe(800);
});
