export const SILENCE_MS = 5000; // 5 seconds of silence before closing
// Cuando KALY acaba de hacer una PREGUNTA (ej. "¿Ya lo pagaste?"), damos más tiempo
// para responder: no cortar la conversación por un silencio corto mientras el
// usuario piensa la respuesta.
export const SILENCE_ANSWER_MS = 15000; // 15s para responder una pregunta de KALY
export const INACTIVITY_MS = 5 * 60 * 1000;

// Cuánto debe pasar desde el último saludo para que KALY VUELVA a saludar.
// Es el proxy de "abriste la app de nuevo": si vuelves a los segundos (cambio de
// pestaña, remontaje del componente) NO saluda; si vuelves después de un rato, sí.
export const RESALUDO_MS = 30 * 60 * 1000; // 30 min

// ¿KALY hizo una PREGUNTA (espera respuesta)? Si lo que dijo incluye un signo de
// interrogación, la próxima respuesta del usuario —incluido un "no"— es la RESPUESTA
// a esa pregunta y NO debe cerrar la sesión ni cortarse por silencio corto.
export function kalyHizoPregunta(text) {
  return /[?¿]/.test(String(text || ''));
}

export function hoyStr(d = new Date()) { return d.toISOString().slice(0, 10); }

// Marca del último saludo: TIMESTAMP en localStorage.
//
// ⚠️ Antes esto era una bandera booleana en sessionStorage ('kaly_greeted_session').
// La suposición era "sessionStorage se borra al cerrar la app, así que al reabrir
// vuelve a saludar". Eso es cierto en una pestaña de navegador, pero NO en el WebView
// de Capacitor: al minimizar y reabrir Hash IA el WebView sigue vivo, la bandera
// seguía en '1' y KALY no volvía a saludar NUNCA ("no saluda al abrir la app").
// Con un timestamp la decisión no depende de que el WebView muera: basta con mirar
// cuánto tiempo pasó.
const LAST_GREET_TS_KEY = 'kaly_last_greet_ts';
const ONBOARDED_KEY = 'kaly_onboarded';
// Claves antiguas: ya no se leen, pero se limpian para no dejar basura de versiones
// previas en el celular (y para que un downgrade no reviva el bug).
const LEGACY_GREETED_KEY = 'kaly_greeted_session';
const LEGACY_LAST_GREET_KEY = 'kaly_last_greet';

// Resetea el estado de saludo/onboarding de KALY. Se llama al INICIAR y CERRAR
// sesión. En un mismo teléfono con varias cuentas, las flags de una cuenta (ya
// saludó / ya onboardó) no deben filtrarse a la siguiente: sin este reset, al
// entrar con otra cuenta KALY no saludaba ni onboardaba. Cada login parte de cero;
// el backend (context.onboarded) decide luego si onboarda o solo saluda.
export function resetKalyGreeting() {
  for (const [store, key] of [
    [() => localStorage, LAST_GREET_TS_KEY],
    [() => localStorage, ONBOARDED_KEY],
    [() => localStorage, LEGACY_LAST_GREET_KEY],
    [() => sessionStorage, LEGACY_GREETED_KEY],
  ]) {
    try { store().removeItem(key); } catch (_) { /* noop */ }
  }
}

// Decide si KALY debe arrancar sola al montarse, y con qué motivo.
// Saluda cuando NUNCA saludó o cuando pasó `resaludoMs` desde el último saludo.
export function decideAutoStart({ onboarded, ultimoSaludo = null, ahora = Date.now(), resaludoMs = RESALUDO_MS } = {}) {
  if (ultimoSaludo != null && (ahora - ultimoSaludo) < resaludoMs) return null;
  return onboarded ? 'saludo' : 'onboarding';
}

// Timestamp (ms) del último saludo, o null si nunca saludó.
export function ultimoSaludoMs() {
  try {
    const v = localStorage.getItem(LAST_GREET_TS_KEY);
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch (_) { return null; }
}

// ¿KALY saludó hace poco? Se usa para NO repetir el saludo cuando el componente
// se remonta (cambio de pestaña) y para reconectar sin saludar.
export function saludoReciente(ahora = Date.now(), resaludoMs = RESALUDO_MS) {
  const t = ultimoSaludoMs();
  return t != null && (ahora - t) < resaludoMs;
}

export function marcarSaludado(ahora = Date.now()) {
  try { localStorage.setItem(LAST_GREET_TS_KEY, String(ahora)); } catch (_) { /* noop */ }
}

export function esNegativa(texto) {
  const t = String(texto || '').toLowerCase().trim();
  return /^(no|nada|no gracias|gracias|estoy bien|ninguna|nada m[aá]s|eso es todo|listo gracias)[.,!\s]*$/.test(t);
}
