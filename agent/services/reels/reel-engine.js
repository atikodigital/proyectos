// Orquesta: tema -> guion (scriptGenerator) -> voz+imagen por escena (en paralelo) -> render.
function createReelEngine({ scriptGenerator, voice, images, render }) {
  async function buildScene(scene) {
    const [audio, image] = await Promise.all([
      voice.synthesize(scene.voiceLine),
      images.generate(scene.imagePrompt),
    ]);
    return {
      text: scene.text,
      audioPath: audio.audioPath,
      durationMs: audio.durationMs,
      imagePath: image.imagePath,
      isFallback: image.isFallback,
      fallbackColor: image.fallbackColor,
    };
  }

  async function generate(topic) {
    const reelSpec = await scriptGenerator.generate(topic);
    const scenes = await Promise.all(reelSpec.scenes.map(buildScene));
    const mp4Path = await render({ title: reelSpec.title, scenes });
    return {
      mp4Path,
      caption: reelSpec.caption,
      hashtags: reelSpec.hashtags,
      reelSpec,
      scenes,
    };
  }

  return { generate };
}

module.exports = { createReelEngine };
