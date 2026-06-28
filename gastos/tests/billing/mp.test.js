const { createPreapproval, cancelPreapproval } = require('../../src/billing/mp');

function mockFetch(status, body) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => { process.env.MP_ACCESS_TOKEN = 'TEST_TOKEN'; });
afterEach(() => { delete global.fetch; delete process.env.MP_ACCESS_TOKEN; jest.restoreAllMocks(); });

test('createPreapproval devuelve id + init_point con datos correctos', async () => {
  mockFetch(200, { id: 'PRE123', init_point: 'https://mp.cl/pay/PRE123' });
  const r = await createPreapproval('pyme', 'https://gastos.atikodigital.cl/panel/#plan', 'dueno@empresa.cl');
  expect(r).toEqual({ id: 'PRE123', init_point: 'https://mp.cl/pay/PRE123' });
  const body = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(body.auto_recurring.transaction_amount).toBe(24900);
  expect(body.auto_recurring.currency_id).toBe('CLP');
  expect(body.auto_recurring.frequency_type).toBe('months');
  expect(body.auto_recurring.frequency).toBe(1);
  expect(body.payer_email).toBe('dueno@empresa.cl');
});

test('createPreapproval lanza error para plan free (precio 0)', async () => {
  await expect(createPreapproval('free', 'https://x.cl')).rejects.toThrow('Plan no pagable');
});

test('createPreapproval lanza error si MP responde 4xx', async () => {
  mockFetch(401, { message: 'Unauthorized' });
  await expect(createPreapproval('basico', 'https://x.cl')).rejects.toThrow('MP 401');
});

test('createPreapproval lanza error si MP_ACCESS_TOKEN no está configurado', async () => {
  delete process.env.MP_ACCESS_TOKEN;
  await expect(createPreapproval('pyme', 'https://x.cl')).rejects.toThrow('MP_ACCESS_TOKEN');
});

test('cancelPreapproval llama PUT con status cancelled', async () => {
  mockFetch(200, { id: 'PRE123', status: 'cancelled' });
  await cancelPreapproval('PRE123');
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/preapproval/PRE123'),
    expect.objectContaining({ method: 'PUT' })
  );
  const body = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(body.status).toBe('cancelled');
});
