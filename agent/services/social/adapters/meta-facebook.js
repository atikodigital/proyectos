const GRAPH_URL = "https://graph.facebook.com/v21.0";

function createFacebookAdapter({ http, graphUrl = GRAPH_URL }) {
  return {
    async publishText({ pageId, pageToken, message }) {
      const { data } = await http.post(graphUrl + "/" + pageId + "/feed", {
        message,
        access_token: pageToken,
      });
      return data;
    },
    async publishPhoto({ pageId, pageToken, imageUrl, caption }) {
      const { data } = await http.post(graphUrl + "/" + pageId + "/photos", {
        url: imageUrl,
        caption,
        access_token: pageToken,
      });
      return data;
    },
  };
}

module.exports = { createFacebookAdapter };
