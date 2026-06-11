const { test } = require("node:test");
const assert = require("node:assert");
const { validatePostSpec } = require("../../services/posts/post-spec-schema");

const slide = { headline: "Titular", imagePrompt: "oficina moderna 4:5 sin texto" };
const base = { caption: "hola 👇", hashtags: ["pyme"], slides: [slide] };

test("accepts valid post (1 slide)", () => {
  const r = validatePostSpec(base, "post");
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, []);
});

test("accepts valid story (1 slide)", () => {
  assert.equal(validatePostSpec(base, "story").valid, true);
});

test("accepts valid carousel (3-5 slides)", () => {
  const r = validatePostSpec({ ...base, slides: [slide, slide, slide] }, "carousel");
  assert.equal(r.valid, true);
  assert.equal(validatePostSpec({ ...base, slides: [slide, slide, slide, slide, slide] }, "carousel").valid, true);
});

test("rejects carousel with 2 slides", () => {
  const r = validatePostSpec({ ...base, slides: [slide, slide] }, "carousel");
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("slides")));
});

test("rejects post with 2 slides", () => {
  assert.equal(validatePostSpec({ ...base, slides: [slide, slide] }, "post").valid, false);
});

test("rejects slide missing headline", () => {
  const r = validatePostSpec({ ...base, slides: [{ imagePrompt: "x" }] }, "post");
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("headline")));
});

test("rejects unknown format", () => {
  const r = validatePostSpec(base, "tiktokdance");
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("format")));
});

test("rejects missing caption / non-array hashtags", () => {
  assert.equal(validatePostSpec({ ...base, caption: "" }, "post").valid, false);
  assert.equal(validatePostSpec({ ...base, hashtags: "x" }, "post").valid, false);
});
