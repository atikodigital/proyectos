const { test } = require("node:test");
const assert = require("node:assert");
const { createInstagramAdapter } = require("../../services/social/adapters/meta-instagram");

test("publishReel creates container, polls until FINISHED, then publishes", async () => {
  const posts = [];
  const statuses = ["IN_PROGRESS", "FINISHED"];
  const http = {
    async post(url, data) {
      posts.push({ url, data });
      if (url.endsWith("/media")) return { data: { id: "CONTAINER1" } };
      if (url.endsWith("/media_publish")) return { data: { id: "IG_MEDIA1" } };
      throw new Error("unexpected post " + url);
    },
    async get(url) {
      assert.match(url, /\/CONTAINER1\?|\/CONTAINER1$/);
      return { data: { status_code: statuses.shift() } };
    },
  };
  const ig = createInstagramAdapter({ http, sleep: async () => {} });
  const res = await ig.publishReel({
    igUserId: "IG1", token: "TOK",
    videoUrl: "https://x/reel.mp4", caption: "viral",
    pollIntervalMs: 0, maxPolls: 5,
  });
  assert.equal(res.id, "IG_MEDIA1");
  assert.match(posts[0].url, /\/v21\.0\/IG1\/media$/);
  assert.equal(posts[0].data.media_type, "REELS");
  assert.equal(posts[0].data.video_url, "https://x/reel.mp4");
  assert.equal(posts[0].data.caption, "viral");
  assert.match(posts[1].url, /\/v21\.0\/IG1\/media_publish$/);
  assert.equal(posts[1].data.creation_id, "CONTAINER1");
});

test("publishReel throws if status becomes ERROR", async () => {
  const http = {
    async post(url) {
      if (url.endsWith("/media")) return { data: { id: "C1" } };
      throw new Error("should not publish");
    },
    async get() { return { data: { status_code: "ERROR" } }; },
  };
  const ig = createInstagramAdapter({ http, sleep: async () => {} });
  await assert.rejects(
    () => ig.publishReel({ igUserId: "IG1", token: "T", videoUrl: "u", caption: "c", pollIntervalMs: 0, maxPolls: 3 }),
    /ERROR/
  );
});

test("publishReel throws if not finished within maxPolls", async () => {
  const http = {
    async post(url) { if (url.endsWith("/media")) return { data: { id: "C1" } }; },
    async get() { return { data: { status_code: "IN_PROGRESS" } }; },
  };
  const ig = createInstagramAdapter({ http, sleep: async () => {} });
  await assert.rejects(
    () => ig.publishReel({ igUserId: "IG1", token: "T", videoUrl: "u", caption: "c", pollIntervalMs: 0, maxPolls: 2 }),
    /timed out|no termin/i
  );
});
