const { test } = require("node:test");
const assert = require("node:assert");
const { createVoiceProvider } = require("../../services/reels/voice");

test("synthesize returns audioPath and durationMs", async () => {
  const calls = [];
  const tts = async (text) => { calls.push(text); return "/tmp/audio-1.wav"; };
  const measureDuration = async (p) => { assert.equal(p, "/tmp/audio-1.wav"); return 3200; };
  const voice = createVoiceProvider({ tts, measureDuration });
  const res = await voice.synthesize("hola mundo");
  assert.equal(res.audioPath, "/tmp/audio-1.wav");
  assert.equal(res.durationMs, 3200);
  assert.deepEqual(calls, ["hola mundo"]);
});

test("synthesize propagates tts errors", async () => {
  const tts = async () => { throw new Error("tts caído"); };
  const measureDuration = async () => 0;
  const voice = createVoiceProvider({ tts, measureDuration });
  await assert.rejects(() => voice.synthesize("x"), /tts caído/);
});
