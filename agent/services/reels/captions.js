// Subtítulos karaoke aproximados: reparte el voiceLine entre la duración del audio
// ponderando por longitud de palabra (sin forced-alignment). Devuelve chunks con
// timing por palabra para resaltar la palabra activa al estilo TikTok.
function splitWords(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean);
}

function buildCaptions(voiceLine, durationMs, opts = {}) {
  const chunkSize = opts.chunkSize || 4;
  const words = splitWords(voiceLine);
  if (words.length === 0) return [];

  const weights = words.map((w) => w.length + 1);
  const total = weights.reduce((a, b) => a + b, 0);

  let t = 0;
  const timed = words.map((w, i) => {
    const dur = (weights[i] / total) * durationMs;
    const startMs = Math.round(t);
    t += dur;
    return { text: w, startMs, endMs: Math.round(t) };
  });
  // asegurar que la última palabra cierra exactamente en durationMs
  timed[timed.length - 1].endMs = Math.round(durationMs);

  const chunks = [];
  for (let i = 0; i < timed.length; i += chunkSize) {
    const group = timed.slice(i, i + chunkSize);
    chunks.push({
      startMs: group[0].startMs,
      endMs: group[group.length - 1].endMs,
      words: group,
    });
  }
  return chunks;
}

module.exports = { buildCaptions, splitWords };
