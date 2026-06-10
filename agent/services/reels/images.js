const DEFAULT_FALLBACK = "#0A1F3F";

// gen(prompt) -> imagePath. Si falla, devuelve fallback (color sólido) en vez de romper.
function createImageProvider({ gen, fallbackColor = DEFAULT_FALLBACK }) {
  async function generate(prompt) {
    try {
      const imagePath = await gen(prompt);
      return { imagePath, isFallback: false };
    } catch (e) {
      return { imagePath: null, isFallback: true, fallbackColor };
    }
  }
  return { generate };
}

module.exports = { createImageProvider };
