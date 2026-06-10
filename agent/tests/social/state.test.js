const { test } = require("node:test");
const assert = require("node:assert");
const { signState, verifyState } = require("../../services/social/state");

test("verifyState recovers the clientId from a signed state", () => {
  const s = signState("casaluxe", { secret: "S", nonce: "n1" });
  assert.equal(verifyState(s, { secret: "S" }), "casaluxe");
});

test("verifyState throws if secret is wrong", () => {
  const s = signState("casaluxe", { secret: "S", nonce: "n1" });
  assert.throws(() => verifyState(s, { secret: "OTHER" }), /inválido|invalid/i);
});

test("verifyState throws on tampered state", () => {
  const s = signState("casaluxe", { secret: "S", nonce: "n1" });
  const flip = s.slice(-1) === "A" ? "B" : "A";
  const tampered = s.slice(0, -1) + flip;
  assert.throws(() => verifyState(tampered, { secret: "S" }), /inválido|invalid/i);
});

test("clientId containing dots survives round-trip", () => {
  const s = signState("a.b.c", { secret: "S", nonce: "n" });
  assert.equal(verifyState(s, { secret: "S" }), "a.b.c");
});

test("two calls without explicit nonce produce different states", () => {
  const a = signState("c", { secret: "S" });
  const b = signState("c", { secret: "S" });
  assert.notEqual(a, b);
  assert.equal(verifyState(a, { secret: "S" }), "c");
  assert.equal(verifyState(b, { secret: "S" }), "c");
});
