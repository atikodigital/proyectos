const { test } = require("node:test");
const assert = require("node:assert");
const { createMemoryContentStore } = require("../../services/content/content-store");

function sample(over = {}) {
  return {
    clientId: "casaluxe", format: "reel", network: "instagram",
    mediaUrl: "/widget/reels/x.mp4", caption: "hola", hashtags: ["a"], ...over,
  };
}

test("create assigns id, status draft and createdAt", async () => {
  const store = createMemoryContentStore();
  const item = await store.create(sample());
  assert.ok(item.id);
  assert.equal(item.status, "draft");
  assert.ok(item.createdAt);
  assert.equal(item.scheduledAt, null);
});

test("get returns the item, null if missing", async () => {
  const store = createMemoryContentStore();
  const it = await store.create(sample());
  assert.equal((await store.get(it.id)).caption, "hola");
  assert.equal(await store.get("nope"), null);
});

test("list filters by clientId and status", async () => {
  const store = createMemoryContentStore();
  await store.create(sample({ clientId: "a" }));
  await store.create(sample({ clientId: "b" }));
  assert.equal((await store.list({ clientId: "a" })).length, 1);
  assert.equal((await store.list({ status: "draft" })).length, 2);
});

test("updateStatus enforces the state machine", async () => {
  const store = createMemoryContentStore();
  const it = await store.create(sample());
  const a = await store.updateStatus(it.id, "approved");
  assert.equal(a.status, "approved");
  await assert.rejects(() => store.updateStatus(it.id, "published"), /Transición inválida/);
});

test("updateStatus applies patch fields (scheduledAt, error, etc.)", async () => {
  const store = createMemoryContentStore();
  const it = await store.create(sample());
  await store.updateStatus(it.id, "approved");
  const s = await store.updateStatus(it.id, "scheduled", { scheduledAt: "2026-06-12T18:00:00Z" });
  assert.equal(s.scheduledAt, "2026-06-12T18:00:00Z");
});

test("due returns scheduled items whose time has passed", async () => {
  const store = createMemoryContentStore();
  const past = await store.create(sample());
  await store.updateStatus(past.id, "approved");
  await store.updateStatus(past.id, "scheduled", { scheduledAt: "2026-06-10T00:00:00Z" });
  const future = await store.create(sample());
  await store.updateStatus(future.id, "approved");
  await store.updateStatus(future.id, "scheduled", { scheduledAt: "2999-01-01T00:00:00Z" });

  const now = new Date("2026-06-11T00:00:00Z");
  const due = await store.due(now);
  assert.equal(due.length, 1);
  assert.equal(due[0].id, past.id);
});
