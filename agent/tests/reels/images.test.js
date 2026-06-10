const { test } = require("node:test");
const assert = require("node:assert");
const { createImageProvider } = require("../../services/reels/images");

test("generate returns imagePath on success", async () => {
  const gen = async (prompt) => { assert.equal(prompt, "un gato"); return "/tmp/img-1.png"; };
  const images = createImageProvider({ gen, fallbackColor: "#0A1F3F" });
  const res = await images.generate("un gato");
  assert.equal(res.imagePath, "/tmp/img-1.png");
  assert.equal(res.isFallback, false);
});

test("generate returns fallback when gen throws (no rompe el reel)", async () => {
  const gen = async () => { throw new Error("imagen caída"); };
  const images = createImageProvider({ gen, fallbackColor: "#0A1F3F" });
  const res = await images.generate("x");
  assert.equal(res.imagePath, null);
  assert.equal(res.isFallback, true);
  assert.equal(res.fallbackColor, "#0A1F3F");
});
