const { test } = require("node:test");
const assert = require("node:assert");
const { createPostScriptGenerator } = require("../../services/posts/post-script-generator");

const goodPost = {
  caption: "cap 👇", hashtags: ["a"],
  slides: [{ headline: "H", imagePrompt: "p" }],
};
const goodCarousel = {
  ...goodPost,
  slides: [goodPost.slides[0], goodPost.slides[0], goodPost.slides[0]],
};

test("generate returns validated spec for post", async () => {
  const gemini = { async generateText() { return JSON.stringify(goodPost); } };
  const spec = await createPostScriptGenerator({ gemini }).generate("mi tema", "post");
  assert.deepEqual(spec, goodPost);
});

test("generate passes topic and format hints into the prompt", async () => {
  let seen = "";
  const gemini = { async generateText(p) { seen = p; return JSON.stringify(goodCarousel); } };
  await createPostScriptGenerator({ gemini }).generate("vender por whatsapp", "carousel");
  assert.match(seen, /vender por whatsapp/);
  assert.match(seen, /3 y 5/);
});

test("prompt demands images WITHOUT text", async () => {
  let seen = "";
  const gemini = { async generateText(p) { seen = p; return JSON.stringify(goodPost); } };
  await createPostScriptGenerator({ gemini }).generate("x", "post");
  assert.match(seen, /sin texto/i);
});

test("retries once on invalid output then succeeds", async () => {
  let calls = 0;
  const gemini = { async generateText() { calls++; return calls === 1 ? "basura" : JSON.stringify(goodPost); } };
  const spec = await createPostScriptGenerator({ gemini }).generate("x", "post");
  assert.equal(calls, 2);
  assert.equal(spec.caption, "cap 👇");
});

test("throws after two invalid outputs", async () => {
  const gemini = { async generateText() { return "{ mal }"; } };
  await assert.rejects(
    () => createPostScriptGenerator({ gemini }).generate("x", "post"),
    /post-spec inválido/
  );
});
