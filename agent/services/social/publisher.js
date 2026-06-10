function createPublisher({ tokenStore, facebook, instagram }) {
  async function publish({ clientId, platform, message, imageUrl, videoUrl, caption }) {
    const conn = await tokenStore.get(clientId, platform);
    if (!conn) {
      throw new Error("El cliente '" + clientId + "' no tiene conexión para " + platform + " (not connected)");
    }
    if (platform === "instagram") {
      return instagram.publishReel({
        igUserId: conn.meta.igUserId || conn.accountId,
        token: conn.accessToken,
        videoUrl,
        caption: caption || message || "",
      });
    }
    if (platform === "facebook") {
      const pageId = conn.meta.pageId || conn.accountId;
      if (imageUrl) {
        return facebook.publishPhoto({ pageId, pageToken: conn.accessToken, imageUrl, caption: caption || message || "" });
      }
      return facebook.publishText({ pageId, pageToken: conn.accessToken, message: message || caption || "" });
    }
    throw new Error("Plataforma no soportada: " + platform);
  }
  return { publish };
}

module.exports = { createPublisher };
