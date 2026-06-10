const { test } = require("node:test");
const assert = require("node:assert");
const { createFacebookAdapter } = require("../../services/social/adapters/meta-facebook");

function recordingHttp(responses) {
  const calls = [];
  return {
    calls,
    async post(url, data) {
      calls.push({ url, data });
      return { data: responses.shift() || {} };
    },
  };
}

test("publishText posts to /{pageId}/feed with message + token", async () => {
  const http = recordingHttp([{ id: "PAGE1_POST1" }]);
  const fb = createFacebookAdapter({ http });
  const res = await fb.publishText({ pageId: "PAGE1", pageToken: "TOK", message: "Hola" });
  assert.equal(res.id, "PAGE1_POST1");
  assert.match(http.calls[0].url, /\/v21\.0\/PAGE1\/feed$/);
  assert.equal(http.calls[0].data.message, "Hola");
  assert.equal(http.calls[0].data.access_token, "TOK");
});

test("publishPhoto posts to /{pageId}/photos with url + caption", async () => {
  const http = recordingHttp([{ id: "PHOTO1", post_id: "PAGE1_POST2" }]);
  const fb = createFacebookAdapter({ http });
  const res = await fb.publishPhoto({ pageId: "PAGE1", pageToken: "TOK", imageUrl: "https://x/img.jpg", caption: "pie" });
  assert.equal(res.id, "PHOTO1");
  assert.match(http.calls[0].url, /\/v21\.0\/PAGE1\/photos$/);
  assert.equal(http.calls[0].data.url, "https://x/img.jpg");
  assert.equal(http.calls[0].data.caption, "pie");
});
