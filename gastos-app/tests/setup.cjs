// Los tests están escritos en español; el i18n resuelve el idioma por
// navigator.language (en jsdom es 'en'). Forzamos 'es' para que t() devuelva
// español y los asserts (placeholders/textos) coincidan.
beforeEach(() => {
  try { window.localStorage.setItem('hash_idioma', 'es'); } catch (_) { /* sin storage */ }
});
