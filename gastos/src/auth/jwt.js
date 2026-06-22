const jwt = require('jsonwebtoken');

function secret() {
  const s = process.env.JWT_SECRET;
  if (s) return s;
  // En producción NUNCA usar un secreto débil en silencio: fallar fuerte.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET no configurado: es obligatorio en producción');
  }
  return 'dev-insecure-secret';
}

function signToken(payload, opts = {}) {
  return jwt.sign(payload, secret(), { expiresIn: opts.expiresIn || '30d' });
}

function verifyToken(token) {
  return jwt.verify(token, secret());
}

module.exports = { signToken, verifyToken };
