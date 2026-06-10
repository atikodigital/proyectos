function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function validateReelSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== "object") {
    return { valid: false, errors: ["reelSpec debe ser un objeto"] };
  }
  if (!isNonEmptyString(spec.title)) errors.push("title es requerido (string)");
  if (!isNonEmptyString(spec.caption)) errors.push("caption es requerido (string)");
  if (!Array.isArray(spec.hashtags)) errors.push("hashtags debe ser un array");
  if (!Array.isArray(spec.scenes) || spec.scenes.length === 0) {
    errors.push("scenes debe ser un array con al menos 1 escena");
  } else {
    spec.scenes.forEach((s, i) => {
      if (!isNonEmptyString(s && s.text)) errors.push("scene[" + i + "].text es requerido");
      if (!isNonEmptyString(s && s.voiceLine)) errors.push("scene[" + i + "].voiceLine es requerido");
      if (!isNonEmptyString(s && s.imagePrompt)) errors.push("scene[" + i + "].imagePrompt es requerido");
    });
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { validateReelSpec };
