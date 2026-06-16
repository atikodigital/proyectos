const KEY = 'atiko_gastos_jwt';
export function getToken() { try { return localStorage.getItem(KEY); } catch { return null; } }
export function setToken(t) { try { if (t) localStorage.setItem(KEY, t); } catch { /* noop */ } }
export function clearToken() { try { localStorage.removeItem(KEY); } catch { /* noop */ } }
