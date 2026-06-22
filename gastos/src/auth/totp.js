// TOTP (RFC 6238) sin dependencias — para 2FA del admin con Google Authenticator/Authy.
const crypto = require('crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(s) {
  let bits = '';
  for (const c of String(s).toUpperCase().replace(/=+$/, '').replace(/\s/g, '')) {
    const v = B32.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function counterBuf(counter) {
  const buf = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i -= 1) { buf[i] = c % 256; c = Math.floor(c / 256); }
  return buf;
}

function hotp(secretBuf, counter, digits = 6) {
  const h = crypto.createHmac('sha1', secretBuf).update(counterBuf(counter)).digest();
  const off = h[h.length - 1] & 0x0f;
  const bin = ((h[off] & 0x7f) << 24) | ((h[off + 1] & 0xff) << 16) | ((h[off + 2] & 0xff) << 8) | (h[off + 3] & 0xff);
  return String(bin % (10 ** digits)).padStart(digits, '0');
}

function totp(secretBase32, { now = Date.now(), step = 30, digits = 6 } = {}) {
  const counter = Math.floor(now / 1000 / step);
  return hotp(base32Decode(secretBase32), counter, digits);
}

// Verifica el código tolerando ±`window` pasos (clock skew). Comparación de tiempo constante.
function verifyTotp(secretBase32, token, { now = Date.now(), step = 30, digits = 6, window = 1 } = {}) {
  if (!secretBase32 || !token) return false;
  const t = String(token).trim();
  if (t.length !== digits) return false;
  const buf = base32Decode(secretBase32);
  const counter = Math.floor(now / 1000 / step);
  let ok = false;
  for (let w = -window; w <= window; w += 1) {
    const cand = hotp(buf, counter + w, digits);
    if (cand.length === t.length && crypto.timingSafeEqual(Buffer.from(cand), Buffer.from(t))) ok = true;
  }
  return ok;
}

function randomBase32(len = 20) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (const b of bytes) out += B32[b % 32];
  return out;
}

// otpauth:// URL para enrolar en la app autenticadora (QR).
function otpauthUrl(secretBase32, { issuer = 'Hash IA Admin', account = 'atiko' } = {}) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}

module.exports = { totp, verifyTotp, randomBase32, otpauthUrl, base32Decode, hotp };
