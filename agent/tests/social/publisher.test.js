const { test } = require("node:test");
const assert = require("node:assert");
const { createPublisher } = require("../../services/social/publisher");
const { createMemoryTokenStore } = require("../../services/social/token-store");

test("publish to instagram uses stored ig token + igUserId", async () => {
  const store = createMemoryTokenStore();
  await store.save({
    clientId: "casaluxe", platform: "instagram",
    accountId: "IG1", accountName: "CASA LUXE",
    accessToken: "IGTOKEN", tokenExpiresAt: null, meta: { igUserId: "IG1" },
  });
  let received = null;
  const instagram = { async publishReel(args) { received = args; return { id: "PUBLISHED" }; } };
  const facebook = { async publishText() { throw new Error("wrong adapter"); } };

  const publisher = createPublisher({ tokenStore: store, facebook, instagram });
  const res = await publisher.publish({
    clientId: "casaluxe", platform: "instagram",
    videoUrl: "https://x/r.mp4", caption: "hola",
  });
  assert.equal(res.id, "PUBLISHED");
  assert.equal(received.igUserId, "IG1");
  assert.equal(received.token, "IGTOKEN");
  assert.equal(received.videoUrl, "https://x/r.mp4");
});

test("publish to facebook text uses page token + pageId", async () => {
  const store = createMemoryTokenStore();
  await store.save({
    clientId: "casaluxe", platform: "facebook",
    accountId: "PAGE1", accountName: "CASA LUXE",
    accessToken: "PAGETOKEN", tokenExpiresAt: null, meta: { pageId: "PAGE1" },
  });
  let received = null;
  const facebook = { async publishText(args) { received = args; return { id: "FBPOST" }; } };
  const instagram = { async publishReel() { throw new Error("wrong adapter"); } };

  const publisher = createPublisher({ tokenStore: store, facebook, instagram });
  const res = await publisher.publish({ clientId: "casaluxe", platform: "facebook", message: "Hola" });
  assert.equal(res.id, "FBPOST");
  assert.equal(received.pageId, "PAGE1");
  assert.equal(received.pageToken, "PAGETOKEN");
  assert.equal(received.message, "Hola");
});

test("publish throws if client has no connection for platform", async () => {
  const publisher = createPublisher({
    tokenStore: createMemoryTokenStore(),
    facebook: {}, instagram: {},
  });
  await assert.rejects(
    () => publisher.publish({ clientId: "x", platform: "facebook", message: "h" }),
    /no.*conexión|not connected/i
  );
});
