const { test } = require("node:test");
const assert = require("node:assert");
const { createAvatarProvider } = require("../../services/reels/avatar");

test("generate synthesizes voice then asks heygen with that audio", async () => {
  const calls = [];
  const voice = {
    async synthesize(text) { calls.push(["tts", text]); return { audioPath: "/tmp/v.wav", durationMs: 4500 }; },
  };
  const heygen = {
    async generateVideo({ avatarId, audioPath }) {
      calls.push(["heygen", avatarId, audioPath]);
      return "/tmp/avatar-clip.mp4";
    },
  };
  const avatar = createAvatarProvider({ heygen, voice });
  const res = await avatar.generate({ avatarId: "tp_abc", voiceLine: "Hola, soy Caro" });
  assert.equal(res.videoPath, "/tmp/avatar-clip.mp4");
  assert.equal(res.durationMs, 4500);
  assert.deepEqual(calls, [["tts", "Hola, soy Caro"], ["heygen", "tp_abc", "/tmp/v.wav"]]);
});

test("generate propagates heygen errors (el engine degradará)", async () => {
  const voice = { async synthesize() { return { audioPath: "/a.wav", durationMs: 1000 }; } };
  const heygen = { async generateVideo() { throw new Error("heygen caído"); } };
  const avatar = createAvatarProvider({ heygen, voice });
  await assert.rejects(() => avatar.generate({ avatarId: "x", voiceLine: "y" }), /heygen caído/);
});
