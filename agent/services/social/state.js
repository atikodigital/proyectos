const crypto = require("crypto");

// Secreto para firmar el `state` del OAuth. Reusa META_APP_SECRET si no hay uno dedicado.
function getSecret() {
  return process.env.SOCIAL_STATE_SECRET || process.env.META_APP_SECRET || "dev-insecure-secret";
}

function hmac(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

// Devuelve un `state` opaco y firmado que contiene el clientId + un nonce aleatorio.
// Protege contra CSRF: el callback solo acepta states que llevan nuestra firma.
function signState(clientId, { secret = getSecret(), nonce } = {}) {
  const n = nonce || crypto.randomBytes(16).toString("base64url");
  const encClient = Buffer.from(String(clientId), "utf8").toString("base64url");
  const payload = encClient + "." + n;
  const sig = hmac(payload, secret);
  return Buffer.from(payload + "." + sig, "utf8").toString("base64url");
}

// Verifica la firma y devuelve el clientId. Lanza si el state es inválido o manipulado.
function verifyState(state, { secret = getSecret() } = {}) {
  let decoded;
  try {
    decoded = Buffer.from(String(state), "base64url").toString("utf8");
  } catch (e) {
    throw new Error("state inválido");
  }
  const parts = decoded.split(".");
  if (parts.length !== 3) throw new Error("state inválido");
  const [encClient, nonce, sig] = parts;
  const expected = hmac(encClient + "." + nonce, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("state inválido (firma no coincide)");
  }
  return Buffer.from(encClient, "base64url").toString("utf8");
}

module.exports = { signState, verifyState };
