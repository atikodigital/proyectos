const { test } = require("node:test");
const assert = require("node:assert");
const { createMemoryAvatarProfiles } = require("../../services/reels/avatar-profiles");

const profile = {
  clientId: "casaluxe", displayName: "Caro de Casa Luxe",
  heygenAvatarId: "tp_abc123", consentSigned: true, consentDate: "2026-06-10",
};

test("save then getAuthorized returns the profile when consent is signed", async () => {
  const store = createMemoryAvatarProfiles();
  await store.save(profile);
  const got = await store.getAuthorized("casaluxe");
  assert.deepEqual(got, profile);
});

test("getAuthorized returns null when consent NOT signed (gate legal)", async () => {
  const store = createMemoryAvatarProfiles();
  await store.save({ ...profile, consentSigned: false });
  assert.equal(await store.getAuthorized("casaluxe"), null);
});

test("getAuthorized returns null for unknown client", async () => {
  const store = createMemoryAvatarProfiles();
  assert.equal(await store.getAuthorized("nadie"), null);
});

test("get returns the profile even without consent (para administrar)", async () => {
  const store = createMemoryAvatarProfiles();
  await store.save({ ...profile, consentSigned: false });
  const got = await store.get("casaluxe");
  assert.equal(got.consentSigned, false);
});
