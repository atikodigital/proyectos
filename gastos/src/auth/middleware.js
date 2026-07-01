const { verifyToken } = require('./jwt');

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: 'no_token' });
  try {
    req.auth = verifyToken(m[1]);
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'token_invalido' });
  }
}

function requireKind(kind) {
  return (req, res, next) => {
    if (!req.auth || req.auth.kind !== kind) return res.status(403).json({ error: 'prohibido' });
    return next();
  };
}

function requireKindAny(kinds) {
  return (req, res, next) => {
    if (!req.auth || !kinds.includes(req.auth.kind)) return res.status(403).json({ error: 'prohibido' });
    return next();
  };
}

module.exports = { requireAuth, requireKind, requireKindAny };
