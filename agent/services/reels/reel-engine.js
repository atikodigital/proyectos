// Orquesta: tema -> guion (scriptGenerator) -> assets por escena (en paralelo) -> render.
// Escenas type "avatar" van al avatar provider (HeyGen); si falla, degradan a broll.

const { buildCaptions } = require("./captions");
const { mapWithConcurrency } = require("../lib/concurrency");

function createReelEngine({ scriptGenerator, voice, images, render, avatar, sceneConcurrency = 2 }) {
  async function buildBrollScene(scene, degraded) {
    const [audio, image] = await Promise.all([
      voice.synthesize(scene.voiceLine),
      images.generate(scene.imagePrompt),
    ]);
    return {
      type: "broll",
      text: scene.text,
      captions: buildCaptions(scene.voiceLine, audio.durationMs),
      audioPath: audio.audioPath,
      durationMs: audio.durationMs,
      imagePath: image.imagePath,
      isFallback: image.isFallback,
      fallbackColor: image.fallbackColor,
      degraded: !!degraded,
    };
  }

  async function buildScene(scene, avatarId, avatarType) {
    if (scene.type === "avatar" && avatar && avatarId) {
      try {
        const clip = await avatar.generate({ avatarId, avatarType, voiceLine: scene.voiceLine });
        return {
          type: "avatar",
          text: scene.text,
          captions: buildCaptions(scene.voiceLine, clip.durationMs),
          videoPath: clip.videoPath,
          durationMs: clip.durationMs,
          degraded: false,
        };
      } catch (e) {
        return buildBrollScene(scene, true); // degradación: el reel sale igual
      }
    }
    return buildBrollScene(scene, false);
  }

  async function generate(topic, opts = {}) {
    const avatarId = opts.avatarId || null;
    const avatarType = opts.avatarType;
    const hasAvatar = !!(avatar && avatarId);
    const reelSpec = await scriptGenerator.generate(topic, { hasAvatar });
    const scenes = await mapWithConcurrency(reelSpec.scenes, sceneConcurrency, (s) => buildScene(s, avatarId, avatarType));
    const mp4Path = await render({ title: reelSpec.title, scenes, musicPath: opts.musicPath });
    return {
      mp4Path,
      caption: reelSpec.caption,
      hashtags: reelSpec.hashtags,
      reelSpec,
      scenes,
      usedAvatar: scenes.some((s) => s.type === "avatar"),
      degraded: scenes.some((s) => s.degraded),
    };
  }

  return { generate };
}

module.exports = { createReelEngine };
