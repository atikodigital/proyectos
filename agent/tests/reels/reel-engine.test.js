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

function avatarFixtures() {
  const spec = {
    title: "T", caption: "cap", hashtags: ["a"],
    scenes: [
      { type: "avatar", text: "gancho", voiceLine: "hola soy caro", imagePrompt: "x" },
      { type: "broll", text: "medio", voiceLine: "dato uno", imagePrompt: "img medio" },
      { type: "avatar", text: "cta", voiceLine: "sígueme", imagePrompt: "x" },
    ],
  };
  const scriptGenerator = { async generate() { return spec; } };
  const voice = { async synthesize(t) { return { audioPath: "/a/" + t + ".wav", durationMs: 1000 }; } };
  const images = { async generate(p) { return { imagePath: "/i/" + p + ".png", isFallback: false }; } };
  let renderInput = null;
  const render = async (input) => { renderInput = input; return "/out/reel.mp4"; };
  const avatar = { async generate({ avatarId, voiceLine }) { return { videoPath: "/v/" + voiceLine + ".mp4", durationMs: 8000 }; } };
  return { spec, scriptGenerator, voice, images, render, avatar, getRenderInput: () => renderInput };
}

test("avatar scenes route to avatar provider, broll to current flow", async () => {
  const f = avatarFixtures();
  const engine = createReelEngine(f);
  const res = await engine.generate("tema", { avatarId: "tp_1" });
  const input = f.getRenderInput();
  assert.equal(input.scenes[0].type, "avatar");
  assert.equal(input.scenes[0].videoPath, "/v/hola soy caro.mp4");
  assert.equal(input.scenes[0].durationMs, 8000);
  assert.equal(input.scenes[1].type, "broll");
  assert.equal(input.scenes[1].imagePath, "/i/img medio.png");
  assert.equal(res.usedAvatar, true);
  assert.equal(res.degraded, false);
});

test("scriptGenerator receives hasAvatar=true when avatar provider + avatarId present", async () => {
  const f = avatarFixtures();
  let seenOpts = null;
  f.scriptGenerator = { async generate(topic, opts) { seenOpts = opts; return f.spec; } };
  const engine = createReelEngine(f);
  await engine.generate("tema", { avatarId: "tp_1" });
  assert.equal(seenOpts.hasAvatar, true);
});

test("avatar failure degrades that scene to broll and flags degraded", async () => {
  const f = avatarFixtures();
  f.avatar = { async generate() { throw new Error("heygen caído"); } };
  const engine = createReelEngine(f);
  const res = await engine.generate("tema", { avatarId: "tp_1" });
  const input = f.getRenderInput();
  assert.equal(input.scenes[0].type, "broll");
  assert.ok(input.scenes[0].audioPath);
  assert.equal(res.degraded, true);
});

test("without avatarId everything is broll even if scenes say avatar", async () => {
  const f = avatarFixtures();
  const engine = createReelEngine(f);
  const res = await engine.generate("tema");
  const input = f.getRenderInput();
  assert.equal(input.scenes[0].type, "broll");
  assert.equal(res.usedAvatar, false);
});
