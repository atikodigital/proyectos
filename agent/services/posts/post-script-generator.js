const { validatePostSpec } = require("./post-spec-schema");

const FORMAT_HINTS = {
  post: 'Genera EXACTAMENTE 1 slide. Imagen vertical 4:5 (1080x1350).',
  story: 'Genera EXACTAMENTE 1 slide. Imagen vertical 9:16 (1080x1920), pensada para historia.',
  carousel: 'Genera entre 3 y 5 slides que cuenten una SECUENCIA (gancho → desarrollo → cierre/CTA). Imagen vertical 4:5 (1080x1350).',
};

function buildPrompt(topic, format) {
  return [
    "Eres un creador de contenido visual para redes sociales de una pyme, en español.",
    "Dado un TEMA, devuelve SOLO un JSON (sin texto extra) con esta forma exacta:",
    '{ "caption": string, "hashtags": string[], "slides": [ { "headline": string, "imagePrompt": string } ] }',
    "Reglas: `headline` = frase corta y potente que irá SOBRE la imagen (máx 8 palabras);",
    "`imagePrompt` = descripción para generar la imagen de fondo — SIEMPRE estética, profesional y SIN TEXTO, sin letras, sin logos.",
    "caption con 1-2 emojis y llamada a la acción. 3-6 hashtags sin #.",
    FORMAT_HINTS[format] || FORMAT_HINTS.post,
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

function createPostScriptGenerator({ gemini }) {
  async function attempt(topic, format, extraInstruction) {
    const prompt = buildPrompt(topic, format) + (extraInstruction ? "\n\n" + extraInstruction : "");
    const raw = await gemini.generateText(prompt);
    let spec;
    try {
      spec = extractJson(raw);
    } catch (e) {
      return { ok: false, reason: "no se pudo parsear JSON" };
    }
    const v = validatePostSpec(spec, format);
    if (!v.valid) return { ok: false, reason: v.errors.join("; ") };
    return { ok: true, spec };
  }

  async function generate(topic, format) {
    let r = await attempt(topic, format);
    if (r.ok) return r.spec;
    r = await attempt(topic, format, "Tu respuesta anterior fue inválida (" + r.reason + "). Devuelve SOLO el JSON válido pedido.");
    if (r.ok) return r.spec;
    throw new Error("post-spec inválido tras 2 intentos: " + r.reason);
  }

  return { generate };
}

module.exports = { createPostScriptGenerator };
