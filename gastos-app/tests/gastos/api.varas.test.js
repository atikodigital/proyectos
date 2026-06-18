import { api } from '../../src/gastos/api';
import { setToken, clearToken } from '../../src/gastos/session';

beforeEach(() => { clearToken(); global.fetch = jest.fn(); });

test('varasChat hace POST /api/app/varas/chat con messages y retorna reply', async () => {
  setToken('TK');
  fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ reply: 'Tu saldo en banco es $100.000.' }) });
  const r = await api.varasChat([{ role: 'user', text: 'hola' }]);
  expect(r.reply).toBe('Tu saldo en banco es $100.000.');
  const [url, opts] = fetch.mock.calls[fetch.mock.calls.length - 1];
  expect(url).toContain('/api/app/varas/chat');
  expect(opts.method).toBe('POST');
  expect(opts.headers.Authorization).toBe('Bearer TK');
  expect(JSON.parse(opts.body)).toEqual({ messages: [{ role: 'user', text: 'hola' }] });
});

test('varasAccion hace POST /api/app/varas/accion con tipo y args', async () => {
  setToken('TK');
  fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
  const r = await api.varasAccion('marcar_pagado', { descripcion: 'x' });
  expect(r.ok).toBe(true);
  const [url, opts] = fetch.mock.calls[fetch.mock.calls.length - 1];
  expect(url).toContain('/api/app/varas/accion');
  expect(opts.method).toBe('POST');
  expect(JSON.parse(opts.body)).toEqual({ tipo: 'marcar_pagado', args: { descripcion: 'x' } });
});
