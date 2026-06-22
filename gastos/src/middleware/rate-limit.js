// Rate limiter en memoria, por IP (ventana deslizante simple). Sin dependencias.
// Pensado para endpoints sensibles (login, registro) y para cortar fuerza bruta / DoS.
// `now` es inyectable para tests deterministas.
function createRateLimiter({ windowMs = 10 * 60 * 1000, max = 10, now = () => Date.now() } = {}) {
  const hits = new Map();
  return function rateLimit(req, res, next) {
    const fwd = req.headers && req.headers['x-forwarded-for'];
    const ip = String(fwd || (req.socket && req.socket.remoteAddress) || 'unknown').split(',')[0].trim() || 'unknown';
    const t = now();
    const arr = (hits.get(ip) || []).filter((x) => t - x < windowMs);
    arr.push(t);
    hits.set(ip, arr);
    if (arr.length > max) return res.status(429).json({ error: 'rate_limited' });
    return next();
  };
}

module.exports = { createRateLimiter };
