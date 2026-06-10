const { test } = require("node:test");
const assert = require("node:assert");
const { createScriptGenerator } = require("../../services/reels/script-generator");

const goodSpec = {
  title: "Tema",
  caption: "cap",
  hashtags: ["a"],
  scenes: [{ text: "t", voiceLine: "v", imagePrompt: "p" }],
};

test("generate returns a validated reel spec parsed from gemini JSON", async () => {
  const gemini = { async generateText() { return JSON.stringify(goodSpec); } };
  const gen = createScriptGenerator({ gemini });
  const spec = await gen.generate("mi tema");
  assert.deepEqual(spec, goodSpec);
});

test("generate strips ```json fences before parsing", async () => {
  const gemini = { async generateText() { return "```json\n" + JSON.stringify(goodSpec) + "\n```"; } };
  const gen = createScriptGenerator({ gemini });
  const spec = await gen.generate("x");
  assert.equal(spec.title, "Tema");
});

test("generate passes the topic into the prompt", async () => {
  let seenPrompt = "";
  const gemini = { async generateText(p) { seenPrompt = p; return JSON.stringify(goodSpec); } };
  await createScriptGenerator({ gemini }).generate("vender por whatsapp");
  assert.match(seenPrompt, /vender por whatsapp/);
});

test("generate retries once when first output is invalid, then succeeds", async () => {
  let calls = 0;
  const gemini = {
    async generateText() {
      calls++;
      return calls === 1 ? "no soy json" : JSON.stringify(goodSpec);
    },
  };
  const spec = await createScriptGenerator({ gemini }).generate("x");
  assert.equal(calls, 2);
  assert.equal(spec.title, "Tema");
});

test("generate throws after two invalid outputs", async () => {
  const gemini = { async generateText() { return "{ invalido }"; } };
  await assert.rejects(() => createScriptGenerator({ gemini }).generate("x"), /reel-spec inválido/);
});

test("generate with hasAvatar asks for type per scene in the prompt", async () => {
  let seenPrompt = "";
  const gemini = { async generateText(p) { seenPrompt = p; return JSON.stringify(goodSpec); } };
  await createScriptGenerator({ gemini }).generate("tema x", { hasAvatar: true });
  assert.match(seenPrompt, /"type"/);
  assert.match(seenPrompt, /avatar/);
});

test("generate without opts does NOT mention avatar (retrocompatible)", async () => {
  let seenPrompt = "";
  const gemini = { async generateText(p) { seenPrompt = p; return JSON.stringify(goodSpec); } };
  await createScriptGenerator({ gemini }).generate("tema x");
  assert.ok(!/avatar/.test(seenPrompt));
});
