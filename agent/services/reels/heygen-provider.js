// HeyGen API: talking photo (foto del cliente) + nuestro audio -> video con lip-sync.
// NOTA: verificar endpoints/formatos vigentes en docs.heygen.com con HEYGEN_API_KEY antes de producción.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");

const API = "https://api.heygen.com";
const UPLOAD = "https://upload.heygen.com";
const KEY = () => process.env.HEYGEN_API_KEY;

function tmpFile(ext) {
  return path.join(os.tmpdir(), "avatar-" + crypto.randomBytes(8).toString("hex") + ext);
}

// Sube un archivo binario (audio) y devuelve su asset id.
async function uploadAsset(filePath, contentType) {
  const bin = fs.readFileSync(filePath);
  const { data } = await axios.post(UPLOAD + "/v1/asset", bin, {
    headers: { "X-Api-Key": KEY(), "Content-Type": contentType },
  });
  return data.data.id;
}

// Onboarding (una vez por persona): foto -> talking photo id (el heygenAvatarId del perfil).
async function createPhotoAvatar({ photoPath }) {
  const bin = fs.readFileSync(photoPath);
  const ext = path.extname(photoPath).toLowerCase();
  const contentType = ext === ".png" ? "image/png" : "image/jpeg";
  const { data } = await axios.post(UPLOAD + "/v1/talking_photo", bin, {
    headers: { "X-Api-Key": KEY(), "Content-Type": contentType },
  });
  return data.data.talking_photo_id;
}

// Genera el clip del avatar hablando NUESTRO audio. Asíncrono: submit + poll + download.
async function generateVideo({ avatarId, audioPath, pollIntervalMs = 5000, maxPolls = 60 }) {
  // HeyGen detecta los WAV como audio/x-wav y exige que el header coincida.
  const audioAssetId = await uploadAsset(audioPath, "audio/x-wav");
  const { data: gen } = await axios.post(API + "/v2/video/generate", {
    video_inputs: [{
      character: { type: "talking_photo", talking_photo_id: avatarId },
      voice: { type: "audio", audio_asset_id: audioAssetId },
    }],
    dimension: { width: 1080, height: 1920 },
  }, { headers: { "X-Api-Key": KEY() } });
  const videoId = gen.data.video_id;

  for (let i = 0; i < maxPolls; i++) {
    // espera ANTES de consultar (la generación nunca está lista al instante),
    // y así no hay un sleep desperdiciado tras el último intento
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const { data: st } = await axios.get(API + "/v1/video_status.get?video_id=" + videoId, {
      headers: { "X-Api-Key": KEY() },
    });
    const status = st.data.status;
    if (status === "completed") {
      const out = tmpFile(".mp4");
      const resp = await axios.get(st.data.video_url, { responseType: "arraybuffer" });
      fs.writeFileSync(out, Buffer.from(resp.data));
      return out;
    }
    if (status === "failed") {
      throw new Error("HeyGen video failed: " + JSON.stringify(st.data.error || {}));
    }
  }
  throw new Error("HeyGen video timed out tras " + maxPolls + " intentos");
}

module.exports = { generateVideo, createPhotoAvatar, uploadAsset };
