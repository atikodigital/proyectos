// Implementaciones reales (Gemini vía REST con axios) que cumplen las interfaces inyectables.
// NOTA: confirmar IDs de modelo/endpoints vigentes en ai.google.dev antes de producción.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const KEY = () => process.env.GEMINI_API_KEY;

function tmpFile(ext) {
  return path.join(os.tmpdir(), "reel-" + crypto.randomBytes(8).toString("hex") + ext);
}

// gemini.generateText(prompt) -> string
const gemini = {
  async generateText(prompt) {
    const url = BASE + "/gemini-2.5-flash:generateContent?key=" + KEY();
    const { data } = await axios.post(url, { contents: [{ parts: [{ text: prompt }] }] });
    const parts = data.candidates && data.candidates[0] && data.candidates[0].content.parts;
    return (parts || []).map((p) => p.text || "").join("");
  },
};

// Gemini TTS devuelve PCM 24kHz mono base64; lo envolvemos en cabecera WAV.
function pcmToWav(pcmBuffer, sampleRate = 24000) {
  const numChannels = 1, bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

// tts(text) -> audioPath
// Voz e instrucciones de estilo configurables — sin esto el TTS suena plano/robótico.
const TTS_VOICE = process.env.GEMINI_TTS_VOICE || "Aoede";
const TTS_STYLE = process.env.GEMINI_TTS_STYLE ||
  "Di lo siguiente en español latino neutro, con tono cercano, enérgico y natural, como una creadora de contenido hablando a su comunidad (no como locutor formal):";

async function tts(text) {
  const url = BASE + "/gemini-2.5-flash-preview-tts:generateContent?key=" + KEY();
  const { data } = await axios.post(url, {
    contents: [{ parts: [{ text: TTS_STYLE + "\n" + text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } },
    },
  });
  const b64 = data.candidates[0].content.parts[0].inlineData.data;
  const pcm = Buffer.from(b64, "base64");
  const wav = pcmToWav(pcm, 24000);
  const out = tmpFile(".wav");
  fs.writeFileSync(out, wav);
  return out;
}

// measureDuration: duración exacta del WAV PCM 24kHz/16-bit/mono = bytesData / (24000*2) * 1000
async function measureDuration(audioPath) {
  const stat = fs.statSync(audioPath);
  const dataBytes = stat.size - 44; // restar cabecera WAV
  return Math.round((dataBytes / (24000 * 2)) * 1000);
}

// gen(prompt) -> imagePath (Gemini image / Nano Banana)
async function gen(prompt) {
  const url = BASE + "/gemini-2.5-flash-image:generateContent?key=" + KEY();
  const fullPrompt = prompt + " — formato vertical 9:16, alta calidad, sin texto.";
  const { data } = await axios.post(url, { contents: [{ parts: [{ text: fullPrompt }] }] });
  const parts = data.candidates[0].content.parts;
  const imgPart = parts.find((p) => p.inlineData);
  if (!imgPart) throw new Error("Gemini no devolvió imagen");
  const out = tmpFile(".png");
  fs.writeFileSync(out, Buffer.from(imgPart.inlineData.data, "base64"));
  return out;
}

module.exports = { gemini, tts, measureDuration, gen };
