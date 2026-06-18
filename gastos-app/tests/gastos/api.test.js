import { api } from '../../src/gastos/api';
import { getToken, setToken, clearToken } from '../../src/gastos/session';

beforeEach(() => { clearToken(); global.fetch = jest.fn(); });

test('login guarda y devuelve el token', async () => {
  fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: 'TK', employee: { id: 'e1', nombre: 'Juan' } }) });
  const r = await api.login('juan', 'clave');
  expect(r.employee.nombre).toBe('Juan');
  expect(getToken()).toBe('TK');
  const [url, opts] = fetch.mock.calls[0];
  expect(url).toContain('/api/app/login');
  expect(JSON.parse(opts.body)).toEqual({ usuario: 'juan', password: 'clave' });
});

test('login 401 lanza, no guarda token', async () => {
  fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'credenciales' }) });
  await expect(api.login('juan', 'x')).rejects.toThrow();
  expect(getToken()).toBeNull();
});

test('createExpense manda token + imagen', async () => {
  setToken('TK');
  fetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'x1', estado: 'pendiente_confirmacion' }) });
  const exp = await api.createExpense('B64', 'image/jpeg');
  expect(exp.id).toBe('x1');
  const [url, opts] = fetch.mock.calls[0];
  expect(url).toContain('/api/app/expenses');
  expect(opts.headers.Authorization).toBe('Bearer TK');
  expect(JSON.parse(opts.body)).toEqual({ imageBase64: 'B64', mimeType: 'image/jpeg' });
});

test('listExpenses devuelve filas', async () => {
  setToken('TK');
  fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ([{ id: 'x1' }]) });
  expect(await api.listExpenses()).toHaveLength(1);
});

test('createExpense 409 lanza error con status y data.duplicado', async () => {
  setToken('TK');
  fetch.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'duplicado', duplicado: { nivel: 'fuerte', existente: { id: 'old' } } }) });
  await expect(api.createExpense('B64')).rejects.toMatchObject({ status: 409 });
  try { await api.createExpense('B64'); } catch (e) { expect(e.data.duplicado.nivel).toBe('fuerte'); }
});

test('createExpense con override manda override:true', async () => {
  setToken('TK');
  fetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'x2' }) });
  await api.createExpense('B64', 'image/jpeg', true);
  const [, opts] = fetch.mock.calls[fetch.mock.calls.length - 1];
  expect(JSON.parse(opts.body)).toEqual({ imageBase64: 'B64', mimeType: 'image/jpeg', override: true });
});

// ── K.A.L.Y. agent endpoints ─────────────────────────────────────────────────

test('agentSession hace POST /api/app/agent/session', async () => {
  setToken('TK');
  fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: 'ephemeral', expireAt: '2026-06-12T01:00:00Z', context: {} }) });
  const r = await api.agentSession();
  expect(r.token).toBe('ephemeral');
  const [url, opts] = fetch.mock.calls[fetch.mock.calls.length - 1];
  expect(url).toContain('/api/app/agent/session');
  expect(opts.method).toBe('POST');
});

test('agentPrefs hace PATCH /api/app/agent/prefs con el patch', async () => {
  setToken('TK');
  fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
  await api.agentPrefs({ nombre: 'José', trato: 'señor', onboarded: true });
  const [url, opts] = fetch.mock.calls[fetch.mock.calls.length - 1];
  expect(url).toContain('/api/app/agent/prefs');
  expect(opts.method).toBe('PATCH');
  expect(JSON.parse(opts.body)).toMatchObject({ nombre: 'José', trato: 'señor', onboarded: true });
});

test('pagarExpense hace PATCH /api/app/expenses/:id/pagar', async () => {
  setToken('TK');
  fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ estado_pago: 'pagado' }) });
  const r = await api.pagarExpense('exp-42');
  expect(r.estado_pago).toBe('pagado');
  const [url, opts] = fetch.mock.calls[fetch.mock.calls.length - 1];
  expect(url).toContain('/api/app/expenses/exp-42/pagar');
  expect(opts.method).toBe('PATCH');
});

test('resumenWhatsapp hace POST /api/app/agent/resumen-whatsapp', async () => {
  setToken('TK');
  fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, to: '+56912345678' }) });
  const r = await api.resumenWhatsapp();
  expect(r.to).toBe('+56912345678');
  const [url, opts] = fetch.mock.calls[fetch.mock.calls.length - 1];
  expect(url).toContain('/api/app/agent/resumen-whatsapp');
  expect(opts.method).toBe('POST');
});

test('kalyAprender hace POST a /api/app/kaly/aprender con la transcripción', async () => {
  setToken('TK');
  fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ creados: 2 }) });
  const payload = { transcripcion: [{ role: 'user', text: 'hola' }] };
  const out = await api.kalyAprender(payload);
  expect(out).toEqual({ creados: 2 });
  const [url, opts] = fetch.mock.calls[fetch.mock.calls.length - 1];
  expect(url).toContain('/api/app/kaly/aprender');
  expect(opts.method).toBe('POST');
  expect(JSON.parse(opts.body)).toEqual(payload);
});
