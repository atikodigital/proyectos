const axios = require('axios');

const DEFAULT_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-2.0-flash-live-001';

// Crea un token efímero (v1alpha auth_tokens) para que la app abra la sesión Live
// sin conocer la API key real. uses:1 → un solo arranque de sesión por token.
async function createEphemeralToken({ apiKey, model = DEFAULT_MODEL, http = axios } = {}) {
  const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  const res = await http.post(
    `https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${apiKey}`,
    { uses: 1, expireTime, newSessionExpireTime, bidiGenerateContentSetup: { model: `models/${model}` } },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
  );
  const name = res && res.data && res.data.name;
  if (!name) throw new Error('token_efimero_invalido');
  return { token: name, expireAt: expireTime, model };
}

module.exports = { createEphemeralToken, DEFAULT_MODEL };
