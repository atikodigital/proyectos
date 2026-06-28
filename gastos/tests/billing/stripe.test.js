const crypto = require('crypto');
const { crearCheckoutSuscripcion, cancelarSuscripcion, verificarFirmaStripe } = require('../../src/billing/stripe');

function mockFetch(status, body) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => { process.env.STRIPE_SECRET_KEY = 'sk_test_x'; });
afterEach(() => { delete global.fetch; delete process.env.STRIPE_SECRET_KEY; jest.restoreAllMocks(); });

// ── Test 1: crearCheckoutSuscripcion pyme USD ──────────────────────────────
test('crearCheckoutSuscripcion pyme USD — llama Stripe con params correctos', async () => {
  mockFetch(200, { id: 'cs_123', url: 'https://checkout.stripe.com/c/cs_123' });

  const r = await crearCheckoutSuscripcion({
    plan: 'pyme',
    moneda: 'USD',
    payerEmail: 'c@x.com',
    successUrl: 'https://s',
    cancelUrl: 'https://c',
  });

  // Verify return value
  expect(r).toEqual({ id: 'cs_123', url: 'https://checkout.stripe.com/c/cs_123' });

  // Verify fetch was called
  expect(global.fetch).toHaveBeenCalledTimes(1);
  const [url, opts] = global.fetch.mock.calls[0];

  // Verify URL and method
  expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
  expect(opts.method).toBe('POST');

  // Verify headers
  expect(opts.headers['Authorization']).toBe('Bearer sk_test_x');
  expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');

  // Parse and verify urlencoded body
  const params = new URLSearchParams(opts.body);
  expect(params.get('mode')).toBe('subscription');
  expect(params.get('customer_email')).toBe('c@x.com');
  expect(params.get('success_url')).toBe('https://s');
  expect(params.get('cancel_url')).toBe('https://c');
  expect(params.get('line_items[0][price_data][currency]')).toBe('usd');
  expect(params.get('line_items[0][price_data][unit_amount]')).toBe('2900'); // 29 USD × 100
  expect(params.get('line_items[0][price_data][recurring][interval]')).toBe('month');
  expect(params.get('line_items[0][quantity]')).toBe('1');
  // product name should reference PLAN_LABELS (Hash IA Pyme)
  expect(params.get('line_items[0][price_data][product_data][name]')).toMatch(/pyme/i);
});

// ── Test 2: crearCheckoutSuscripcion basico EUR ────────────────────────────
test('crearCheckoutSuscripcion basico EUR — unit_amount=1100 currency=eur', async () => {
  mockFetch(200, { id: 'cs_456', url: 'https://checkout.stripe.com/c/cs_456' });

  await crearCheckoutSuscripcion({
    plan: 'basico',
    moneda: 'EUR',
    payerEmail: 'eu@example.com',
    successUrl: 'https://s',
    cancelUrl: 'https://c',
  });

  const params = new URLSearchParams(global.fetch.mock.calls[0][1].body);
  expect(params.get('line_items[0][price_data][currency]')).toBe('eur');
  expect(params.get('line_items[0][price_data][unit_amount]')).toBe('1100'); // 11 EUR × 100
});

// ── Test 3: rechaza CLP ───────────────────────────────────────────────────
test('crearCheckoutSuscripcion lanza error si moneda es CLP', async () => {
  await expect(
    crearCheckoutSuscripcion({
      plan: 'pyme',
      moneda: 'CLP',
      payerEmail: 'cl@test.com',
      successUrl: 'https://s',
      cancelUrl: 'https://c',
    })
  ).rejects.toThrow(/CLP/);
});

// ── Test 4: lanza si STRIPE_SECRET_KEY no configurado ─────────────────────
test('crearCheckoutSuscripcion lanza si STRIPE_SECRET_KEY no está configurado', async () => {
  delete process.env.STRIPE_SECRET_KEY;
  await expect(
    crearCheckoutSuscripcion({
      plan: 'pyme',
      moneda: 'USD',
      payerEmail: 'x@x.com',
      successUrl: 'https://s',
      cancelUrl: 'https://c',
    })
  ).rejects.toThrow(/STRIPE_SECRET_KEY/);
});

// ── Test 5: lanza en respuesta 4xx de Stripe ──────────────────────────────
test('crearCheckoutSuscripcion lanza con status en mensaje si Stripe responde 4xx', async () => {
  mockFetch(400, { error: { message: 'bad request' } });
  await expect(
    crearCheckoutSuscripcion({
      plan: 'pyme',
      moneda: 'USD',
      payerEmail: 'x@x.com',
      successUrl: 'https://s',
      cancelUrl: 'https://c',
    })
  ).rejects.toThrow(/400/);
});

// ── Test 6: verificarFirmaStripe ──────────────────────────────────────────
test('verificarFirmaStripe retorna true para firma válida', () => {
  const secret = 'whsec_test_secret';
  const rawBody = '{"type":"checkout.session.completed"}';
  const ts = '1700000000';
  const signed = ts + '.' + rawBody;
  const v1 = crypto.createHmac('sha256', secret).update(signed).digest('hex');
  const header = `t=${ts},v1=${v1}`;

  expect(verificarFirmaStripe(rawBody, header, secret)).toBe(true);
});

test('verificarFirmaStripe retorna false para secret incorrecto', () => {
  const rawBody = '{"type":"checkout.session.completed"}';
  const ts = '1700000000';
  const v1 = crypto.createHmac('sha256', 'correct_secret').update(ts + '.' + rawBody).digest('hex');
  const header = `t=${ts},v1=${v1}`;

  expect(verificarFirmaStripe(rawBody, header, 'wrong_secret')).toBe(false);
});

test('verificarFirmaStripe retorna false para header malformado', () => {
  expect(verificarFirmaStripe('body', 'malformed-header', 'secret')).toBe(false);
  expect(verificarFirmaStripe('body', '', 'secret')).toBe(false);
  expect(verificarFirmaStripe('body', 't=123', 'secret')).toBe(false); // sin v1
});

// ── Test 7: cancelarSuscripcion ───────────────────────────────────────────
test('cancelarSuscripcion llama DELETE a /v1/subscriptions/:id con Bearer auth', async () => {
  mockFetch(200, { id: 'sub_123', status: 'canceled' });

  await cancelarSuscripcion('sub_123');

  expect(global.fetch).toHaveBeenCalledTimes(1);
  const [url, opts] = global.fetch.mock.calls[0];
  expect(url).toBe('https://api.stripe.com/v1/subscriptions/sub_123');
  expect(opts.method).toBe('DELETE');
  expect(opts.headers['Authorization']).toBe('Bearer sk_test_x');
});
