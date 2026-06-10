const GRAPH_URL = "https://graph.facebook.com/v21.0";

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createInstagramAdapter({ http, graphUrl = GRAPH_URL, sleep = defaultSleep }) {
  async function createContainer({ igUserId, token, videoUrl, caption }) {
    const { data } = await http.post(graphUrl + "/" + igUserId + "/media", {
      media_type: "REELS",
      video_url: videoUrl,
      caption,
      access_token: token,
    });
    return data.id;
  }

  async function waitUntilFinished({ containerId, token, pollIntervalMs, maxPolls }) {
    for (let i = 0; i < maxPolls; i++) {
      const u = new URL(graphUrl + "/" + containerId);
      u.searchParams.set("fields", "status_code");
      u.searchParams.set("access_token", token);
      const { data } = await http.get(u.toString());
      if (data.status_code === "FINISHED") return;
      if (data.status_code === "ERROR") {
        throw new Error("Instagram container status: ERROR");
      }
      await sleep(pollIntervalMs);
    }
    throw new Error("Instagram container no terminó (timed out) tras " + maxPolls + " intentos");
  }

  async function publishReel({ igUserId, token, videoUrl, caption, pollIntervalMs = 3000, maxPolls = 20 }) {
    const containerId = await createContainer({ igUserId, token, videoUrl, caption });
    await waitUntilFinished({ containerId, token, pollIntervalMs, maxPolls });
    const { data } = await http.post(graphUrl + "/" + igUserId + "/media_publish", {
      creation_id: containerId,
      access_token: token,
    });
    return data;
  }

  return { publishReel };
}

module.exports = { createInstagramAdapter };
