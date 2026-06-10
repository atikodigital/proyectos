const { test } = require("node:test");
const assert = require("node:assert");
const { createReelEngine } = require("../../services/reels/reel-engine");

function fixtures() {
  const spec = {
    title: "T", caption: "cap", hashtags: ["a"],
    scenes: [
      { text: "uno", voiceLine: "voz uno", imagePrompt: "img uno" },
      { text: "dos", voiceLine: "voz dos", imagePrompt: "img dos" },
    ],
  };
  const scriptGenerator = { async generate() { return spec; } };
  const voice = {
    async synthesize(text) { return { audioPath: "/a/" + text + ".wav", durationMs: text.length * 100 }; },
  };
  const images = {
    async generate(prompt) { return { imagePath: "/i/" + prompt + ".png", isFallback: false }; },
  };
  let renderInput = null;
  const render = async (input) => { renderInput = input; return "/out/reel.mp4"; };
  return { spec, scriptGenerator, voice, images, render, getRenderInput: () => renderInput };
}

test("generate orchestrates script -> assets -> render and returns result", async () => {
  const f = fixtures();
  const engine = createReelEngine(f);
  const res = await engine.generate("mi tema");

  assert.equal(res.mp4Path, "/out/reel.mp4");
  assert.equal(res.caption, "cap");
  assert.deepEqual(res.hashtags, ["a"]);
  assert.equal(res.reelSpec.title, "T");

  const input = f.getRenderInput();
  assert.equal(input.title, "T");
  assert.equal(input.scenes.length, 2);
  assert.equal(input.scenes[0].text, "uno");
  assert.equal(input.scenes[0].audioPath, "/a/voz uno.wav");
  assert.equal(input.scenes[0].imagePath, "/i/img uno.png");
  assert.equal(input.scenes[0].durationMs, "voz uno".length * 100);
  assert.equal(input.scenes[0].isFallback, false);
});

test("generate carries fallbackColor through when an image fails", async () => {
  const f = fixtures();
  f.images = { async generate() { return { imagePath: null, isFallback: true, fallbackColor: "#111" }; } };
  const engine = createReelEngine(f);
  await engine.generate("x");
  const input = f.getRenderInput();
  assert.equal(input.scenes[0].isFallback, true);
  assert.equal(input.scenes[0].fallbackColor, "#111");
});

test("generate propagates a render error", async () => {
  const f = fixtures();
  f.render = async () => { throw new Error("render falló"); };
  const engine = createReelEngine(f);
  await assert.rejects(() => engine.generate("x"), /render falló/);
});
