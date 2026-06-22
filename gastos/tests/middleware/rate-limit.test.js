const { createRateLimiter } = require('../../src/middleware/rate-limit');

function mockReq(ip) { return { headers: {}, socket: { remoteAddress: ip } }; }
function mockRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
function run(rl, req) {
  const res = mockRes();
  let nexted = false;
  rl(req, res, () => { nexted = true; });
  return { res, nexted };
}

test('deja pasar hasta max y bloquea el siguiente con 429 rate_limited', () => {
  let t = 0;
  const rl = createRateLimiter({ windowMs: 1000, max: 3, now: () => t });
  const req = mockReq('1.1.1.1');
  for (let i = 0; i < 3; i++) expect(run(rl, req).nexted).toBe(true);
  const { res, nexted } = run(rl, req);
  expect(nexted).toBe(false);
  expect(res.statusCode).toBe(429);
  expect(res.body.error).toBe('rate_limited');
});

test('resetea el contador pasada la ventana', () => {
  let t = 0;
  const rl = createRateLimiter({ windowMs: 1000, max: 1, now: () => t });
  const req = mockReq('2.2.2.2');
  expect(run(rl, req).nexted).toBe(true);
  expect(run(rl, req).res.statusCode).toBe(429);
  t = 1001;
  expect(run(rl, req).nexted).toBe(true);
});

test('cada IP tiene su propio contador', () => {
  let t = 0;
  const rl = createRateLimiter({ windowMs: 1000, max: 1, now: () => t });
  expect(run(rl, mockReq('a')).nexted).toBe(true);
  expect(run(rl, mockReq('b')).nexted).toBe(true); // otra IP, no bloqueada
  expect(run(rl, mockReq('a')).res.statusCode).toBe(429);
});

test('usa x-forwarded-for si está presente', () => {
  let t = 0;
  const rl = createRateLimiter({ windowMs: 1000, max: 1, now: () => t });
  const req = { headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }, socket: {} };
  expect(run(rl, req).nexted).toBe(true);
  expect(run(rl, req).res.statusCode).toBe(429);
});
