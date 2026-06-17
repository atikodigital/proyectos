import { fetchKalyToken, KALY_TOKEN_URL } from '../src/kaly/token.js';

test('fetchKalyToken devuelve token/model en éxito', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ token: 'tok-1', model: 'm', expireAt: 'x' }) }));
  const r = await fetchKalyToken({ fetchImpl });
  expect(fetchImpl).toHaveBeenCalledWith(KALY_TOKEN_URL, expect.objectContaining({ method: 'GET' }));
  expect(r).toEqual({ token: 'tok-1', model: 'm', expireAt: 'x' });
});

test('fetchKalyToken lanza rate_limited en 429', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: 'rate_limited' }) }));
  await expect(fetchKalyToken({ fetchImpl })).rejects.toThrow('rate_limited');
});

test('fetchKalyToken lanza token_falla en 502', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: false, status: 502, json: async () => ({ error: 'token_falla' }) }));
  await expect(fetchKalyToken({ fetchImpl })).rejects.toThrow('token_falla');
});
