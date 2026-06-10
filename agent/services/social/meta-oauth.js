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

module.exports = { GRAPH_URL, DEFAULT_SCOPES, buildAuthUrl };
