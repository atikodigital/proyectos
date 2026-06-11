const { test } = require("node:test");
const assert = require("node:assert");
const { buildCaptions } = require("../../services/reels/captions");

test("returns empty array for empty text", () => {
  assert.deepEqual(buildCaptions("", 3000), []);
});

test("distributes words across the full duration", () => {
  const chunks = buildCaptions("hola mundo cruel", 3000, { chunkSize: 10 });
  const words = chunks.flatMap((c) => c.words);
  assert.equal(words.length, 3);
  assert.equal(words[0].startMs, 0);
  // el último word termina ~ en la duración total
  assert.equal(words[words.length - 1].endMs, 3000);
  // monótono: cada word empieza donde acabó el anterior
  for (let i = 1; i < words.length; i++) {
    assert.equal(words[i].startMs, words[i - 1].endMs);
  }
});

test("groups words into chunks of chunkSize", () => {
  const chunks = buildCaptions("uno dos tres cuatro cinco seis siete", 7000, { chunkSize: 3 });
  assert.equal(chunks.length, 3); // 3 + 3 + 1
  assert.equal(chunks[0].words.length, 3);
  assert.equal(chunks[2].words.length, 1);
  // el chunk hereda el rango de sus words
  assert.equal(chunks[0].startMs, chunks[0].words[0].startMs);
  assert.equal(chunks[0].endMs, chunks[0].words[2].endMs);
});

test("longer words get more time than short words", () => {
  const chunks = buildCaptions("a internacional", 1000, { chunkSize: 10 });
  const [w1, w2] = chunks[0].words;
  const d1 = w1.endMs - w1.startMs;
  const d2 = w2.endMs - w2.startMs;
  assert.ok(d2 > d1, "la palabra larga debe durar más");
});
