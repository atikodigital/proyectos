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
