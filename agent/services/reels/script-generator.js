const { validateReelSpec } = require("./reel-spec-schema");

function buildPrompt(topic) {
  return [
    "Eres un guionista de reels virales en español para una pyme.",
    "Dado un TEMA, devuelve SOLO un JSON (sin texto extra) con esta forma exacta:",
    '{ "title": string, "caption": string, "hashtags": string[], "scenes": [ { "text": string, "voiceLine": string, "imagePrompt": string } ] }',
    "Reglas: 4-7 escenas; `text` = frase corta en pantalla (gancho/idea); `voiceLine` = lo que dice la voz en off;",
    "`imagePrompt` = descripción para generar una imagen vertical 9:16 de fondo. caption con 1-2 emojis. 3-6 hashtags sin #.",
    "",
    "TEMA: " + topic,
  ].join("\n");
}

function extractJson(text) {
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  return JSON.parse(t);
}

function createScriptGenerator({ gemini }) {
  async function attempt(topic, extraInstruction) {
    const prompt = buildPrompt(topic) + (extraInstruction ? "\n\n" + extraInstruction : "");
    const raw = await gemini.generateText(prompt);
    let spec;
    try {
      spec = extractJson(raw);
    } catch (e) {
      return { ok: false, reason: "no se pudo parsear JSON" };
    }
    const v = validateReelSpec(spec);
    if (!v.valid) return { ok: false, reason: v.errors.join("; ") };
    return { ok: true, spec };
  }

  async function generate(topic) {
    let r = await attempt(topic);
    if (r.ok) return r.spec;
    r = await attempt(topic, "Tu respuesta anterior fue inválida (" + r.reason + "). Devuelve SOLO el JSON válido pedido.");
    if (r.ok) return r.spec;
    throw new Error("reel-spec inválido tras 2 intentos: " + r.reason);
  }

  return { generate };
}

module.exports = { createScriptGenerator };
