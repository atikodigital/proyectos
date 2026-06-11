// Valida el post-spec según el formato: post=1 slide, story=1 slide, carousel=3..5.
const SLIDE_COUNT = {
  post: { min: 1, max: 1 },
  story: { min: 1, max: 1 },
  carousel: { min: 3, max: 5 },
};

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function validatePostSpec(spec, format) {
  const errors = [];
  const range = SLIDE_COUNT[format];
  if (!range) {
    return { valid: false, errors: ["format desconocido: " + format] };
  }
  if (!spec || typeof spec !== "object") {
    return { valid: false, errors: ["postSpec debe ser un objeto"] };
  }
  if (!isNonEmptyString(spec.caption)) errors.push("caption es requerido (string)");
  if (!Array.isArray(spec.hashtags)) errors.push("hashtags debe ser un array");
  if (!Array.isArray(spec.slides) || spec.slides.length < range.min || spec.slides.length > range.max) {
    errors.push("slides debe tener entre " + range.min + " y " + range.max + " para format " + format);
  } else {
    spec.slides.forEach((s, i) => {
      if (!isNonEmptyString(s && s.headline)) errors.push("slide[" + i + "].headline es requerido");
      if (!isNonEmptyString(s && s.imagePrompt)) errors.push("slide[" + i + "].imagePrompt es requerido");
    });
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { validatePostSpec, SLIDE_COUNT };
