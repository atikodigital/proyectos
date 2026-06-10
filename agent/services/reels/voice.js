// tts(text) -> audioPath ; measureDuration(audioPath) -> durationMs. Ambos inyectados.
function createVoiceProvider({ tts, measureDuration }) {
  async function synthesize(text) {
    const audioPath = await tts(text);
    const durationMs = await measureDuration(audioPath);
    return { audioPath, durationMs };
  }
  return { synthesize };
}

module.exports = { createVoiceProvider };
