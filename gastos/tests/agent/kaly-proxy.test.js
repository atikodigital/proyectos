const EventEmitter = require('events');
const { createLimiter, pipe } = require('../../src/agent/kaly-proxy');

test('createLimiter respeta perIp y global', () => {
  const lim = createLimiter({ perIp: 1, global: 2, perWindow: 100 });
  expect(lim.tryAcquire('a').ok).toBe(true);
  expect(lim.tryAcquire('a').ok).toBe(false); // perIp=1
  expect(lim.tryAcquire('b').ok).toBe(true);
  expect(lim.tryAcquire('c').ok).toBe(false); // global=2
  lim.release('a');
  expect(lim.tryAcquire('a').ok).toBe(true); // liberado
});

test('createLimiter respeta perWindow (arranques)', () => {
  const lim = createLimiter({ perIp: 99, global: 99, perWindow: 2, windowMs: 10000 });
  expect(lim.tryAcquire('a').ok).toBe(true);
  expect(lim.tryAcquire('a').ok).toBe(true);
  const r = lim.tryAcquire('a');
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('rate');
});

function fakeWs() {
  const e = new EventEmitter();
  e.readyState = 1;
  e.sent = [];
  e.send = (d) => e.sent.push(d);
  e.close = () => { e.closed = true; e.emit('close'); };
  return e;
}

test('pipe reenvía mensajes en ambos sentidos', () => {
  const c = fakeWs(), u = fakeWs();
  pipe(c, u);
  c.emit('message', 'hola');
  u.emit('message', 'audio');
  expect(u.sent).toEqual(['hola']);
  expect(c.sent).toEqual(['audio']);
});

test('pipe: cerrar uno cierra el otro y llama onClose una vez', () => {
  const c = fakeWs(), u = fakeWs();
  const onClose = jest.fn();
  pipe(c, u, { onClose });
  c.emit('close');
  expect(u.closed).toBe(true);
  expect(onClose).toHaveBeenCalledTimes(1);
});
