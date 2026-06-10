// Genera la voz con NUESTRO TTS (voz coherente con el resto del reel) y
// HeyGen anima al avatar hablando ese audio (lip-sync).
function createAvatarProvider({ heygen, voice }) {
  async function generate({ avatarId, voiceLine }) {
    const { audioPath, durationMs } = await voice.synthesize(voiceLine);
    const videoPath = await heygen.generateVideo({ avatarId, audioPath });
    return { videoPath, durationMs };
  }
  return { generate };
}

module.exports = { createAvatarProvider };
