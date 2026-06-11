// Orquesta: tema+formato -> post-spec (Gemini) -> imagen limpia + titular overlay por slide.
const { mapWithConcurrency } = require("../lib/concurrency");

function createImagePostEngine({ scriptGenerator, images, renderStill, slideConcurrency = 2 }) {
  async function buildSlide(slide, format) {
    const image = await images.generate(slide.imagePrompt);
    return renderStill({
      headline: slide.headline,
      imagePath: image.imagePath,
      isFallback: image.isFallback,
      fallbackColor: image.fallbackColor,
      format,
    });
  }

  async function generate(topic, format) {
    const postSpec = await scriptGenerator.generate(topic, format);
    const imagePaths = await mapWithConcurrency(postSpec.slides, slideConcurrency, (s) => buildSlide(s, format));
    return { caption: postSpec.caption, hashtags: postSpec.hashtags, imagePaths, postSpec };
  }

  return { generate };
}

module.exports = { createImagePostEngine };
