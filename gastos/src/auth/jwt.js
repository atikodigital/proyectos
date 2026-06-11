const jwt = require('jsonwebtoken');

function secret() {
  return process.env.JWT_SECRET || 'dev-insecure-secret';
}

function signToken(payload, opts = {}) {
  return jwt.sign(payload, secret(), { expiresIn: opts.expiresIn || '30d' });
}

function verifyToken(token) {
  return jwt.verify(token, secret());
}

module.exports = { signToken, verifyToken };
