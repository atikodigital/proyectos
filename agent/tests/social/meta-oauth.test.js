const { test } = require("node:test");
const assert = require("node:assert");
const oauth = require("../../services/social/meta-oauth");

test("buildAuthUrl includes app id, redirect, scopes and state", () => {
  const url = oauth.buildAuthUrl({
    appId: "APP123",
    redirectUri: "https://agent.atikodigital.cl/api/social/callback/meta",
    state: "casaluxe",
  });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, "https://www.facebook.com/v21.0/dialog/oauth");
  assert.equal(u.searchParams.get("client_id"), "APP123");
  assert.equal(u.searchParams.get("state"), "casaluxe");
  assert.equal(u.searchParams.get("redirect_uri"), "https://agent.atikodigital.cl/api/social/callback/meta");
  const scope = u.searchParams.get("scope");
  assert.match(scope, /pages_manage_posts/);
  assert.match(scope, /instagram_content_publish/);
});
