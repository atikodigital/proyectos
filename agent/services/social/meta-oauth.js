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

async function listPagesWithInstagram({ http, userToken }) {
  const accountsUrl = new URL(GRAPH_URL + "/me/accounts");
  accountsUrl.searchParams.set("fields", "id,name,access_token");
  accountsUrl.searchParams.set("access_token", userToken);
  const { data: accounts } = await http.get(accountsUrl.toString());

  const pages = [];
  for (const page of accounts.data || []) {
    const pageUrl = new URL(GRAPH_URL + "/" + page.id);
    pageUrl.searchParams.set("fields", "instagram_business_account");
    pageUrl.searchParams.set("access_token", page.access_token);
    const { data: pageData } = await http.get(pageUrl.toString());
    pages.push({
      pageId: page.id,
      pageName: page.name,
      pageAccessToken: page.access_token,
      igUserId: pageData.instagram_business_account
        ? pageData.instagram_business_account.id
        : null,
    });
  }
  return pages;
}

module.exports = {
  GRAPH_URL, DEFAULT_SCOPES, buildAuthUrl,
  exchangeCodeForToken, getLongLivedToken,
  listPagesWithInstagram,
};
