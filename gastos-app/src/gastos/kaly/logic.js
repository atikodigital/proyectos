export const SILENCE_MS = 5000; // 5 seconds of silence before closing
export const INACTIVITY_MS = 5 * 60 * 1000;

export function hoyStr(d = new Date()) { return d.toISOString().slice(0, 10); }

export function decideAutoStart({ onboarded }) {
  if (!onboarded) return 'onboarding';
  return 'saludo'; // Always auto-start when the component mounts
}

export function esNegativa(texto) {
  const t = String(texto || '').toLowerCase().trim();
  return /^(no|nada|no gracias|gracias|estoy bien|ninguna|nada m[aá]s|eso es todo|listo gracias)[.,!\s]*$/.test(t);
}
