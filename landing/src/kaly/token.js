// Pide el token efímero de KALY al agente (endpoint público con rate-limit).
export const KALY_TOKEN_URL =
  globalThis.VITE_KALY_TOKEN_URL ||
  'https://gastos.atikodigital.cl/api/public/kaly-token';

export async function fetchKalyToken({ fetchImpl } = {}) {
  const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!f) throw new Error('sin_fetch');
  const res = await f(KALY_TOKEN_URL, { method: 'GET' });
  if (!res.ok) {
    let err = 'token_falla';
    try { const b = await res.json(); err = b.error || err; } catch { /* noop */ }
    if (res.status === 429) err = 'rate_limited';
    throw new Error(err);
  }
  const b = await res.json();
  return { token: b.token, model: b.model, expireAt: b.expireAt };
}
