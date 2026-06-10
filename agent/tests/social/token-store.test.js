const { test } = require("node:test");
const assert = require("node:assert");
const { createMemoryTokenStore } = require("../../services/social/token-store");

test("save then get returns the connection", async () => {
  const store = createMemoryTokenStore();
  const conn = {
    clientId: "casaluxe", platform: "instagram",
    accountId: "178414", accountName: "CASA LUXE",
    accessToken: "TOKEN123", tokenExpiresAt: null, meta: { igUserId: "178414" },
  };
  await store.save(conn);
  const got = await store.get("casaluxe", "instagram");
  assert.deepEqual(got, conn);
});

test("save twice for same client+platform overwrites", async () => {
  const store = createMemoryTokenStore();
  await store.save({ clientId: "c", platform: "facebook", accountId: "1", accountName: "A", accessToken: "old", tokenExpiresAt: null, meta: {} });
  await store.save({ clientId: "c", platform: "facebook", accountId: "1", accountName: "A", accessToken: "new", tokenExpiresAt: null, meta: {} });
  const got = await store.get("c", "facebook");
  assert.equal(got.accessToken, "new");
});

test("get returns null when not found", async () => {
  const store = createMemoryTokenStore();
  assert.equal(await store.get("nope", "facebook"), null);
});

test("list returns all platforms for a client", async () => {
  const store = createMemoryTokenStore();
  await store.save({ clientId: "c", platform: "facebook", accountId: "1", accountName: "A", accessToken: "t", tokenExpiresAt: null, meta: {} });
  await store.save({ clientId: "c", platform: "instagram", accountId: "2", accountName: "B", accessToken: "t", tokenExpiresAt: null, meta: {} });
  const all = await store.list("c");
  assert.equal(all.length, 2);
});
