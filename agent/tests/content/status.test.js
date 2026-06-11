const { test } = require("node:test");
const assert = require("node:assert");
const { canTransition, assertTransition, STATUSES } = require("../../services/content/status");

test("allows the happy path transitions", () => {
  assert.equal(canTransition("draft", "approved"), true);
  assert.equal(canTransition("approved", "scheduled"), true);
  assert.equal(canTransition("scheduled", "publishing"), true);
  assert.equal(canTransition("publishing", "published"), true);
  assert.equal(canTransition("publishing", "failed"), true);
});

test("allows the back/retry transitions", () => {
  assert.equal(canTransition("approved", "draft"), true);
  assert.equal(canTransition("scheduled", "approved"), true);
  assert.equal(canTransition("failed", "scheduled"), true);
});

test("rejects invalid jumps", () => {
  assert.equal(canTransition("draft", "scheduled"), false);
  assert.equal(canTransition("draft", "published"), false);
  assert.equal(canTransition("published", "draft"), false);
  assert.equal(canTransition("approved", "publishing"), false);
});

test("assertTransition throws on invalid, returns on valid", () => {
  assert.equal(assertTransition("draft", "approved"), "approved");
  assert.throws(() => assertTransition("draft", "published"), /Transición inválida/);
});

test("STATUSES lists all states", () => {
  assert.deepEqual(
    [...STATUSES].sort(),
    ["approved", "draft", "failed", "published", "publishing", "scheduled"]
  );
});
