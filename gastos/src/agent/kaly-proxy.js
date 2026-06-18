// Proxy WebSocket para KALY en la landing PÚBLICA: el navegador conecta a /api/public/kaly-ws
// y el backend reenvía a Gemini Live usando la GEMINI_API_KEY (que NUNCA sale al cliente).
// Con rate-limit por IP/global y corte de sesiones largas (control de costo).
const { WebSocketServer, WebSocket } = require('ws');

const GEMINI_WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

// Limita: sesiones concurrentes por IP, concurrentes globales, y arranques por ventana.
function createLimiter({ perIp = 2, global = 20, perWindow = 40, windowMs = 10 * 60 * 1000 } = {}) {
  const active = new Map(); // ip -> count
  let activeGlobal = 0;
  const starts = []; // timestamps de arranques
  return {
    tryAcquire(ip) {
      const now = Date.now();
      while (starts.length && now - starts[0] > windowMs) starts.shift();
      if (starts.length >= perWindow) return { ok: false, reason: 'rate' };
      if (activeGlobal >= global) return { ok: false, reason: 'busy' };
      if ((active.get(ip) || 0) >= perIp) return { ok: false, reason: 'ip' };
      active.set(ip, (active.get(ip) || 0) + 1);
      activeGlobal += 1;
      starts.push(now);
      return { ok: true };
    },
    release(ip) {
      const n = (active.get(ip) || 1) - 1;
      if (n <= 0) active.delete(ip); else active.set(ip, n);
      activeGlobal = Math.max(0, activeGlobal - 1);
    },
    stats() { return { activeGlobal, ips: active.size }; },
  };
}

// Pipea dos sockets ws en ambos sentidos; al cerrar/erros uno, cierra el otro y llama onClose una vez.
function pipe(client, upstream, { onClose } = {}) {
  let closed = false;
  const end = () => {
    if (closed) return;
    closed = true;
    try { client.close(); } catch (e) { /* noop */ }
    try { upstream.close(); } catch (e) { /* noop */ }
    if (onClose) onClose();
  };
  client.on('message', (d) => { try { if (upstream.readyState === 1) upstream.send(d); } catch (e) { /* noop */ } });
  upstream.on('message', (d) => { try { if (client.readyState === 1) client.send(d); } catch (e) { /* noop */ } });
  client.on('close', end); client.on('error', end);
  upstream.on('close', end); upstream.on('error', end);
  return end;
}

// Engancha el proxy al http.Server (maneja el 'upgrade' del path indicado).
function attachKalyProxy(server, { apiKey, path = '/api/public/kaly-ws', maxMs = 5 * 60 * 1000, limiter = createLimiter(), WS = WebSocket } = {}) {
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    let pathname;
    try { pathname = new URL(req.url, 'http://x').pathname; } catch (e) { return; }
    if (pathname !== path) return; // no es nuestro; lo dejamos para otros handlers
    const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '').split(',')[0].trim();
    const g = limiter.tryAcquire(ip);
    if (!g.ok) { try { socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n'); } catch (e) {} return socket.destroy(); }
    wss.handleUpgrade(req, socket, head, (client) => {
      const upstream = new WS(`${GEMINI_WS}?key=${encodeURIComponent(apiKey)}`);
      let released = false;
      const release = () => { if (released) return; released = true; limiter.release(ip); };
      pipe(client, upstream, { onClose: release });
      const t = setTimeout(() => { try { client.close(); } catch (e) {} try { upstream.close(); } catch (e) {} }, maxMs);
      client.on('close', () => clearTimeout(t));
    });
  });
  return wss;
}

module.exports = { attachKalyProxy, createLimiter, pipe, GEMINI_WS };
