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

function fakeHttp(routes) {
  return {
    async get(url) {
      const u = new URL(url);
      const handler = routes[u.pathname];
      if (!handler) throw new Error("no route for " + u.pathname);
      return { data: handler(u.searchParams) };
    },
  };
}

test("exchangeCodeForToken returns short-lived token", async () => {
  const http = fakeHttp({
    "/v21.0/oauth/access_token": (p) => {
      assert.equal(p.get("code"), "CODE1");
      return { access_token: "SHORT", token_type: "bearer" };
    },
  });
  const res = await oauth.exchangeCodeForToken({
    http, appId: "A", appSecret: "S",
    redirectUri: "https://x/cb", code: "CODE1",
  });
  assert.equal(res.accessToken, "SHORT");
});

test("getLongLivedToken exchanges short for long", async () => {
  const http = fakeHttp({
    "/v21.0/oauth/access_token": (p) => {
      assert.equal(p.get("grant_type"), "fb_exchange_token");
      assert.equal(p.get("fb_exchange_token"), "SHORT");
      return { access_token: "LONG", expires_in: 5184000 };
    },
  });
  const res = await oauth.getLongLivedToken({ http, appId: "A", appSecret: "S", shortLivedToken: "SHORT" });
  assert.equal(res.accessToken, "LONG");
  assert.equal(res.expiresIn, 5184000);
});

test("listPagesWithInstagram returns pages and linked ig account", async () => {
  const http = {
    async get(url) {
      const u = new URL(url);
      if (u.pathname === "/v21.0/me/accounts") {
        return { data: { data: [
          { id: "PAGE1", name: "CASA LUXE", access_token: "PAGETOKEN1" },
        ] } };
      }
      if (u.pathname === "/v21.0/PAGE1") {
        return { data: { instagram_business_account: { id: "IG1" } } };
      }
      throw new Error("no route for " + u.pathname);
    },
  };
  const pages = await oauth.listPagesWithInstagram({ http, userToken: "USERTOK" });
  assert.equal(pages.length, 1);
  assert.equal(pages[0].pageId, "PAGE1");
  assert.equal(pages[0].pageName, "CASA LUXE");
  assert.equal(pages[0].pageAccessToken, "PAGETOKEN1");
  assert.equal(pages[0].igUserId, "IG1");
});
