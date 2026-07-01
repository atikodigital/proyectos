export const SILENCE_MS = 5000; // 5 seconds of silence before closing
export const INACTIVITY_MS = 5 * 60 * 1000;

export function hoyStr(d = new Date()) { return d.toISOString().slice(0, 10); }

// Bandera de "ya saludó en esta apertura de la app" — vive en sessionStorage, así
// que dura mientras la app esté abierta (memoria de corto plazo) y se resetea sola
// cuando el usuario la cierra y la vuelve a abrir. KalyAgent puede montarse varias
// veces por navegación (cambios de pestaña, pantallas condicionales) sin repetir el
// saludo cada vez.
const GREETED_KEY = 'kaly_greeted_session';

export function decideAutoStart({ onboarded, yaSaludo }) {
  if (!onboarded) return 'onboarding';
  if (yaSaludo) return null; // ya saludó en esta apertura de la app: no repetir
  return 'saludo';
}

export function yaSaludoEnEstaSesion() {
  try { return sessionStorage.getItem(GREETED_KEY) === '1'; } catch (_) { return false; }
}

export function marcarSaludado() {
  try { sessionStorage.setItem(GREETED_KEY, '1'); } catch (_) {}
}

export function esNegativa(texto) {
  const t = String(texto || '').toLowerCase().trim();
  return /^(no|nada|no gracias|gracias|estoy bien|ninguna|nada m[aá]s|eso es todo|listo gracias)[.,!\s]*$/.test(t);
}
