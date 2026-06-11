const { test } = require("node:test");
const assert = require("node:assert");
const { createImagePostEngine } = require("../../services/posts/image-post-engine");

function fixtures() {
  const spec = {
    caption: "cap", hashtags: ["a"],
    slides: [
      { headline: "UNO", imagePrompt: "img uno" },
      { headline: "DOS", imagePrompt: "img dos" },
      { headline: "TRES", imagePrompt: "img tres" },
    ],
  };
  const scriptGenerator = { async generate() { return spec; } };
  const images = { async generate(p) { return { imagePath: "/i/" + p + ".png", isFallback: false }; } };
  const stillCalls = [];
  const renderStill = async (slideProps) => {
    stillCalls.push(slideProps);
    return "/out/" + slideProps.headline + ".png";
  };
  return { spec, scriptGenerator, images, renderStill, stillCalls };
}

test("generate orchestrates spec -> images -> stills and returns paths in order", async () => {
  const f = fixtures();
  const engine = createImagePostEngine(f);
  const res = await engine.generate("tema", "carousel");
  assert.equal(res.caption, "cap");
  assert.deepEqual(res.hashtags, ["a"]);
  assert.deepEqual(res.imagePaths, ["/out/UNO.png", "/out/DOS.png", "/out/TRES.png"]);
  assert.equal(res.postSpec.slides.length, 3);
});

test("renderStill receives headline, image data and format", async () => {
  const f = fixtures();
  const engine = createImagePostEngine(f);
  await engine.generate("tema", "story");
  assert.equal(f.stillCalls[0].headline, "UNO");
  assert.equal(f.stillCalls[0].imagePath, "/i/img uno.png");
  assert.equal(f.stillCalls[0].format, "story");
});

test("image fallback flows through to renderStill", async () => {
  const f = fixtures();
  f.images = { async generate() { return { imagePath: null, isFallback: true, fallbackColor: "#123" }; } };
  const engine = createImagePostEngine(f);
  await engine.generate("tema", "post");
  assert.equal(f.stillCalls[0].isFallback, true);
  assert.equal(f.stillCalls[0].fallbackColor, "#123");
});

test("renderStill error propagates", async () => {
  const f = fixtures();
  f.renderStill = async () => { throw new Error("still falló"); };
  const engine = createImagePostEngine(f);
  await assert.rejects(() => engine.generate("t", "post"), /still falló/);
});
