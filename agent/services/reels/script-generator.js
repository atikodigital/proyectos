const { validateReelSpec } = require("./reel-spec-schema");

const STYLE_HINTS = {
  // Estilo "meme/hype creator" (referencia: reels virales de creators de IA/ecommerce):
  meme: [
    "ESTILO: meme/hype de viral creator.",
    "Frases MUY cortas e impactantes en el `text` (3-6 palabras, pueden ir en MAYÚSCULAS).",
    "Gancho con un número o resultado concreto (ej: '$10K/mes', 'en 5 minutos', 'GRATIS').",
    "Tono directo y energético, como un creator hablándole a su comunidad; cero corporativo.",
    "Cierra con CTA tipo 'comenta X y te mando la guía'.",
  ].join("\n"),
};

function buildPrompt(topic, hasAvatar, style) {
  const lines = [
    "Eres un guionista de reels virales en español para una pyme.",
    "Dado un TEMA, devuelve SOLO un JSON (sin texto extra) con esta forma exacta:",
    '{ "title": string, "caption": string, "hashtags": string[], "scenes": [ { "text": string, "voiceLine": string, "imagePrompt": string } ] }',
    "Reglas: 4-7 escenas; `text` = frase corta en pantalla (gancho/idea); `voiceLine` = lo que dice la voz en off;",
    "`imagePrompt` = descripción para generar una imagen vertical 9:16 de fondo. caption con 1-2 emojis. 3-6 hashtags sin #.",
  ];
  if (hasAvatar) {
    lines.push(
      'Además, cada escena debe incluir "type": "avatar" o "broll".',
      'La PRIMERA escena (gancho) y la ÚLTIMA (llamada a la acción) deben ser "type": "avatar" — la persona hablando a cámara, con voiceLine en primera persona.',
      'Las escenas del medio deben ser "type": "broll".'
    );
  }
  if (style && STYLE_HINTS[style]) {
    lines.push(STYLE_HINTS[style]);
  }
  lines.push("", "TEMA: " + topic);
  return lines.join("\n");
}

function extractJson(text) {
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  return JSON.parse(t);
}

function createScriptGenerator({ gemini }) {
  async function attempt(topic, hasAvatar, style, extraInstruction) {
    const prompt = buildPrompt(topic, hasAvatar, style) + (extraInstruction ? "\n\n" + extraInstruction : "");
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

  async function generate(topic, opts = {}) {
    const hasAvatar = !!opts.hasAvatar;
    const style = opts.style;
    let r = await attempt(topic, hasAvatar, style);
    if (r.ok) return r.spec;
    r = await attempt(topic, hasAvatar, style, "Tu respuesta anterior fue inválida (" + r.reason + "). Devuelve SOLO el JSON válido pedido.");
    if (r.ok) return r.spec;
    throw new Error("reel-spec inválido tras 2 intentos: " + r.reason);
  }

  return { generate };
}

module.exports = { createScriptGenerator };
