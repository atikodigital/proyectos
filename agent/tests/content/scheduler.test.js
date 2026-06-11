const { test } = require("node:test");
const assert = require("node:assert");
const { createScheduler } = require("../../services/content/scheduler");
const { createMemoryContentStore } = require("../../services/content/content-store");

async function scheduledItem(store, over = {}) {
  const it = await store.create({
    clientId: "c", format: "reel", network: "instagram",
    mediaUrl: "/widget/reels/x.mp4", caption: "hola", hashtags: [], ...over,
  });
  await store.updateStatus(it.id, "approved");
  await store.updateStatus(it.id, "scheduled", { scheduledAt: "2026-06-10T00:00:00Z" });
  return it;
}

const NOW = () => new Date("2026-06-11T00:00:00Z");

test("tick publishes due reel items via publisher and marks published", async () => {
  const store = createMemoryContentStore();
  const it = await scheduledItem(store);
  const calls = [];
  const publisher = { async publish(args) { calls.push(args); return { id: "FBPOST1" }; } };

  const scheduler = createScheduler({ store, publisher, now: NOW });
  const summary = await scheduler.tick();

  assert.deepEqual(summary, { published: 1, failed: 0 });
  assert.equal(calls[0].platform, "instagram");
  assert.equal(calls[0].videoUrl, "/widget/reels/x.mp4");
  assert.equal(calls[0].caption, "hola");
  const after = await store.get(it.id);
  assert.equal(after.status, "published");
  assert.equal(after.externalId, "FBPOST1");
  assert.ok(after.publishedAt);
});

test("tick maps post format to imageUrl", async () => {
  const store = createMemoryContentStore();
  await scheduledItem(store, { format: "post", mediaUrl: "/widget/img/p.jpg" });
  const calls = [];
  const publisher = { async publish(a) { calls.push(a); return { id: "X" }; } };
  await createScheduler({ store, publisher, now: NOW }).tick();
  assert.equal(calls[0].imageUrl, "/widget/img/p.jpg");
  assert.equal(calls[0].videoUrl, undefined);
});

test("tick marks story as failed (no soportado en 4a)", async () => {
  const store = createMemoryContentStore();
  const it = await scheduledItem(store, { format: "story" });
  const publisher = { async publish() { throw new Error("no debería llamarse"); } };
  const summary = await createScheduler({ store, publisher, now: NOW }).tick();
  assert.deepEqual(summary, { published: 0, failed: 1 });
  const after = await store.get(it.id);
  assert.equal(after.status, "failed");
  assert.match(after.error, /Fase 4c|stor/i);
});

test("tick ignores future and non-scheduled items", async () => {
  const store = createMemoryContentStore();
  const future = await store.create({ clientId: "c", format: "reel", network: "instagram", mediaUrl: "u", caption: "c", hashtags: [] });
  await store.updateStatus(future.id, "approved");
  await store.updateStatus(future.id, "scheduled", { scheduledAt: "2999-01-01T00:00:00Z" });
  const draft = await store.create({ clientId: "c", format: "reel", network: "instagram", mediaUrl: "u", caption: "c", hashtags: [] });

  let called = false;
  const publisher = { async publish() { called = true; return { id: "X" }; } };
  const summary = await createScheduler({ store, publisher, now: NOW }).tick();
  assert.deepEqual(summary, { published: 0, failed: 0 });
  assert.equal(called, false);
  assert.equal((await store.get(draft.id)).status, "draft");
});

test("one publish failure does not stop the rest", async () => {
  const store = createMemoryContentStore();
  const a = await scheduledItem(store, { caption: "uno" });
  const b = await scheduledItem(store, { caption: "dos" });
  const publisher = {
    async publish(args) {
      if (args.caption === "uno") throw new Error("falló uno");
      return { id: "OK" };
    },
  };
  const summary = await createScheduler({ store, publisher, now: NOW }).tick();
  assert.deepEqual(summary, { published: 1, failed: 1 });
  assert.equal((await store.get(a.id)).status, "failed");
  assert.equal((await store.get(a.id)).error, "falló uno");
  assert.equal((await store.get(b.id)).status, "published");
});
