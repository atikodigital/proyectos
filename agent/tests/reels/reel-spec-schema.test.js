const { test } = require("node:test");
const assert = require("node:assert");
const { validateReelSpec } = require("../../services/reels/reel-spec-schema");

const valid = {
  title: "5 errores al vender por WhatsApp",
  caption: "¿Cometes alguno? 👇",
  hashtags: ["ventas", "whatsapp"],
  scenes: [
    { text: "Error #1", voiceLine: "El primero es tardar.", imagePrompt: "persona con teléfono 9:16" },
  ],
};

test("accepts a valid reel spec", () => {
  const r = validateReelSpec(valid);
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, []);
});

test("rejects missing title", () => {
  const r = validateReelSpec({ ...valid, title: undefined });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("title")));
});

test("rejects empty scenes array", () => {
  const r = validateReelSpec({ ...valid, scenes: [] });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("scenes")));
});

test("rejects a scene missing imagePrompt", () => {
  const r = validateReelSpec({ ...valid, scenes: [{ text: "t", voiceLine: "v" }] });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("imagePrompt")));
});

test("rejects non-array hashtags", () => {
  const r = validateReelSpec({ ...valid, hashtags: "ventas" });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("hashtags")));
});

test("accepts scenes with type avatar or broll", () => {
  const r = validateReelSpec({
    ...valid,
    scenes: [
      { type: "avatar", text: "t", voiceLine: "v", imagePrompt: "p" },
      { type: "broll", text: "t2", voiceLine: "v2", imagePrompt: "p2" },
    ],
  });
  assert.equal(r.valid, true);
});

test("accepts scenes WITHOUT type (retrocompatible, default broll)", () => {
  const r = validateReelSpec(valid);
  assert.equal(r.valid, true);
});

test("rejects invalid scene type", () => {
  const r = validateReelSpec({
    ...valid,
    scenes: [{ type: "hologram", text: "t", voiceLine: "v", imagePrompt: "p" }],
  });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("type")));
});
