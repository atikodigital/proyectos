# Endpoint público del token de KALY (atiko-agent)

Pegar en el server del agente (Express). Reusa `createEphemeralToken` (auth_tokens v1alpha).
El backend del agente es untracked y vive en el VPS — este endpoint se activa ahí, no se commitea en este repo.

```js
const { createEphemeralToken } = require('./token'); // o la ruta real en el agente
const _hits = new Map(); // IP -> [timestamps]
function rateLimited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000, max = 20;
  const arr = (_hits.get(ip) || []).filter(t => now - t < win);
  arr.push(now); _hits.set(ip, arr);
  return arr.length > max;
}
app.get('/api/public/kaly-token', async (req, res) => {
  const origin = req.headers.origin || '';
  const allowed = ['https://hash.atikodigital.cl', 'http://localhost:5173'];
  if (allowed.includes(origin)) res.set('Access-Control-Allow-Origin', origin);
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (rateLimited(ip)) return res.status(429).json({ error: 'rate_limited' });
  try {
    const tok = await createEphemeralToken({ apiKey: process.env.GEMINI_API_KEY });
    return res.json(tok); // { token, expireAt, model }
  } catch (e) { console.error('[kaly-token]', e.message); return res.status(502).json({ error: 'token_falla' }); }
});
```

Verificación en prod (tras activarlo): `curl -s https://<agente>/api/public/kaly-token` debe devolver `{ "token": "...", "model": "..." }`.
