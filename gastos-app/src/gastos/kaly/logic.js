export const SILENCE_MS = 5000; // 5 seconds of silence before closing
export const INACTIVITY_MS = 5 * 60 * 1000;

export function hoyStr(d = new Date()) { return d.toISOString().slice(0, 10); }

// Dos banderas de "ya saludó":
//  - GREETED_KEY (sessionStorage): dura mientras la app está abierta; evita repetir
//    el saludo al cambiar de pestaña o remontar KalyAgent en la misma sesión.
//  - LAST_GREET_KEY (localStorage = cache del celular): guarda la FECHA del último
//    saludo. Persiste aunque cierres y reabras la app → KALY saluda UNA vez al día.
const GREETED_KEY = 'kaly_greeted_session';
const LAST_GREET_KEY = 'kaly_last_greet';

export function decideAutoStart({ onboarded, yaSaludo }) {
  // Saluda UNA vez por apertura de la app: si ya saludó en esta sesión (sessionStorage),
  // no repite al cambiar de pestaña; pero al cerrar y volver a abrir, saluda de nuevo.
  if (yaSaludo) return null;
  return onboarded ? 'saludo' : 'onboarding';
}

// ¿Ya saludó HOY? (persistido en el celular, sobrevive a cerrar/reabrir la app).
export function yaSaludoHoy() {
  try { return localStorage.getItem(LAST_GREET_KEY) === hoyStr(); } catch (_) { return false; }
}

// Compat: ¿ya saludó en esta apertura de la app? (sessionStorage).
export function yaSaludoEnEstaSesion() {
  try { return sessionStorage.getItem(GREETED_KEY) === '1'; } catch (_) { return false; }
}

export function marcarSaludado() {
  try { sessionStorage.setItem(GREETED_KEY, '1'); } catch (_) {}
  try { localStorage.setItem(LAST_GREET_KEY, hoyStr()); } catch (_) {}
}

export function esNegativa(texto) {
  const t = String(texto || '').toLowerCase().trim();
  return /^(no|nada|no gracias|gracias|estoy bien|ninguna|nada m[aá]s|eso es todo|listo gracias)[.,!\s]*$/.test(t);
}
