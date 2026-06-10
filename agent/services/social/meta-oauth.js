const GRAPH_URL = "https://graph.facebook.com/v21.0";

const DEFAULT_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
];

function buildAuthUrl({ appId, redirectUri, state, scopes = DEFAULT_SCOPES }) {
  const u = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  u.searchParams.set("client_id", appId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("scope", scopes.join(","));
  u.searchParams.set("response_type", "code");
  return u.toString();
}

async function exchangeCodeForToken({ http, appId, appSecret, redirectUri, code }) {
  const u = new URL(GRAPH_URL + "/oauth/access_token");
  u.searchParams.set("client_id", appId);
  u.searchParams.set("client_secret", appSecret);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("code", code);
  const { data } = await http.get(u.toString());
  return { accessToken: data.access_token };
}

async function getLongLivedToken({ http, appId, appSecret, shortLivedToken }) {
  const u = new URL(GRAPH_URL + "/oauth/access_token");
  u.searchParams.set("grant_type", "fb_exchange_token");
  u.searchParams.set("client_id", appId);
  u.searchParams.set("client_secret", appSecret);
  u.searchParams.set("fb_exchange_token", shortLivedToken);
  const { data } = await http.get(u.toString());
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

module.exports = {
  GRAPH_URL, DEFAULT_SCOPES, buildAuthUrl,
  exchangeCodeForToken, getLongLivedToken,
};
