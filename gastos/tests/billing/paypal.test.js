const {
  ppBase,
  getAccessToken,
  ensurePlanId,
  crearSuscripcionPaypal,
  verificarWebhookPaypal,
  _resetTokenCache,
} = require('../../src/billing/paypal');

// ── helpers ───────────────────────────────────────────────────────────────────

function mockFetch(responses) {
  // responses: array of { status, body } in call order
  let i = 0;
  return jest.fn().mockImplementation(async () => {
    const resp = responses[i] || responses[responses.length - 1];
    i++;
    return {
      ok:     resp.status >= 200 && resp.status < 300,
      status: resp.status,
      json:   async () => resp.body,
    };
  });
}

function singleFetch(status, body) {
  return mockFetch([{ status, body }]);
}

// Minimal DB mock with paypal_config and paypal_plans tables in-memory.
function makeDb({ planRow = null, configRow = null } = {}) {
  const paypalPlans  = planRow   ? [planRow]   : [];
  const paypalConfig = configRow ? [configRow] : [];

  const queries = [];
  return {
    _queries: queries,
    _paypalPlans:  paypalPlans,
    _paypalConfig: paypalConfig,
    query: jest.fn(async (sql, params) => {
      queries.push({ sql, params });

      if (sql.includes('paypal_plans') && sql.includes('SELECT')) {
        const found = paypalPlans.find(
          (r) => r.plan === (params && params[0]) && r.moneda === (params && params[1]),
        );
        return { rows: found ? [{ paypal_plan_id: found.paypal_plan_id }] : [] };
      }

      if (sql.includes('paypal_config') && sql.includes('SELECT')) {
        const found = paypalConfig.find((r) => r.key === 'product_id');
        return { rows: found ? [{ value: found.value }] : [] };
      }

      // INSERT/UPDATE → just store and return success.
      if (sql.includes('INSERT INTO paypal_config')) {
        paypalConfig.push({ key: 'product_id', value: params[0] });
      }
      if (sql.includes('INSERT INTO paypal_plans')) {
        paypalPlans.push({ plan: params[0], moneda: params[1], paypal_plan_id: params[2] });
      }

      return { rows: [] };
    }),
  };
}

// ── env setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.PAYPAL_CLIENT_ID = 'test-client-id';
  process.env.PAYPAL_SECRET    = 'test-secret';
  process.env.PAYPAL_WEBHOOK_ID = 'WH-TEST-123';
  process.env.PAYPAL_ENV       = 'sandbox';
  _resetTokenCache();
});

afterEach(() => {
  delete process.env.PAYPAL_CLIENT_ID;
  delete process.env.PAYPAL_SECRET;
  delete process.env.PAYPAL_WEBHOOK_ID;
  delete process.env.PAYPAL_ENV;
  _resetTokenCache();
  jest.restoreAllMocks();
});

// ── ppBase ────────────────────────────────────────────────────────────────────

test('ppBase devuelve sandbox URL cuando PAYPAL_ENV != live', () => {
  expect(ppBase()).toBe('https://api-m.sandbox.paypal.com');
});

test('ppBase devuelve live URL cuando PAYPAL_ENV=live', () => {
  process.env.PAYPAL_ENV = 'live';
  expect(ppBase()).toBe('https://api-m.paypal.com');
});

// ── getAccessToken ────────────────────────────────────────────────────────────

test('getAccessToken obtiene y cachea el token OAuth', async () => {
  const fi = singleFetch(200, { access_token: 'tok-abc', expires_in: 3600 });

  const tok = await getAccessToken({ fetchImpl: fi });
  expect(tok).toBe('tok-abc');
  expect(fi).toHaveBeenCalledTimes(1);

  // Second call uses cache → no new fetch.
  const tok2 = await getAccessToken({ fetchImpl: fi });
  expect(tok2).toBe('tok-abc');
  expect(fi).toHaveBeenCalledTimes(1);
});

test('getAccessToken usa Authorization Basic con credenciales codificadas', async () => {
  const fi = singleFetch(200, { access_token: 'tok-xyz', expires_in: 3600 });
  await getAccessToken({ fetchImpl: fi });

  const [, opts] = fi.mock.calls[0];
  const expected = 'Basic ' + Buffer.from('test-client-id:test-secret').toString('base64');
  expect(opts.headers['Authorization']).toBe(expected);
});

test('getAccessToken lanza si PAYPAL_CLIENT_ID no configurado', async () => {
  delete process.env.PAYPAL_CLIENT_ID;
  await expect(getAccessToken({ fetchImpl: jest.fn() })).rejects.toThrow(/PAYPAL_CLIENT_ID/);
});

test('getAccessToken lanza si PayPal responde 4xx', async () => {
  const fi = singleFetch(401, { error: 'invalid_client' });
  await expect(getAccessToken({ fetchImpl: fi })).rejects.toThrow(/401/);
});

// ── ensurePlanId ──────────────────────────────────────────────────────────────

test('ensurePlanId retorna plan existente sin llamar a PayPal', async () => {
  const db = makeDb({ planRow: { plan: 'pyme', moneda: 'USD', paypal_plan_id: 'P-existing' } });
  const fi = jest.fn();  // should not be called

  const planId = await ensurePlanId(db, 'pyme', 'USD', { fetchImpl: fi });

  expect(planId).toBe('P-existing');
  expect(fi).not.toHaveBeenCalled();
});

test('ensurePlanId crea producto y plan si no existen, y los persiste en DB', async () => {
  const db = makeDb(); // empty tables

  // Responses in order: 1) OAuth token, 2) create product, 3) create plan
  const fi = mockFetch([
    { status: 200, body: { access_token: 'tok', expires_in: 3600 } },
    { status: 200, body: { id: 'PROD-new-001' } },
    { status: 200, body: { id: 'P-new-plan-001' } },
  ]);

  const planId = await ensurePlanId(db, 'pyme', 'USD', { fetchImpl: fi });

  expect(planId).toBe('P-new-plan-001');

  // Product was created.
  const prodCall = fi.mock.calls.find(([url]) => url.includes('/v1/catalogs/products'));
  expect(prodCall).toBeTruthy();
  const prodBody = JSON.parse(prodCall[1].body);
  expect(prodBody.name).toBe('Hash IA');
  expect(prodBody.type).toBe('SERVICE');

  // Plan was created with correct pricing.
  const planCall = fi.mock.calls.find(([url]) => url.includes('/v1/billing/plans'));
  expect(planCall).toBeTruthy();
  const planBody = JSON.parse(planCall[1].body);
  expect(planBody.product_id).toBe('PROD-new-001');
  const price = planBody.billing_cycles[0].pricing_scheme.fixed_price;
  expect(price.value).toBe('35.00');  // pyme USD = 35
  expect(price.currency_code).toBe('USD');

  // Persisted in paypal_plans.
  const insertPlan = db._queries.find(
    (q) => q.sql.includes('INSERT INTO paypal_plans') && q.params[2] === 'P-new-plan-001',
  );
  expect(insertPlan).toBeTruthy();
});

test('ensurePlanId reutiliza product_id existente al crear un nuevo plan', async () => {
  const db = makeDb({ configRow: { key: 'product_id', value: 'PROD-cached' } });

  // Responses: 1) OAuth token, 2) create plan (no product create needed)
  const fi = mockFetch([
    { status: 200, body: { access_token: 'tok', expires_in: 3600 } },
    { status: 200, body: { id: 'P-basico-EUR' } },
  ]);

  const planId = await ensurePlanId(db, 'basico', 'EUR', { fetchImpl: fi });

  expect(planId).toBe('P-basico-EUR');

  // No product create call.
  const prodCall = fi.mock.calls.find(([url]) => url.includes('/v1/catalogs/products'));
  expect(prodCall).toBeUndefined();

  // Plan create has the cached product_id.
  const planCall = fi.mock.calls.find(([url]) => url.includes('/v1/billing/plans'));
  const planBody = JSON.parse(planCall[1].body);
  expect(planBody.product_id).toBe('PROD-cached');
});

// ── crearSuscripcionPaypal ────────────────────────────────────────────────────

test('crearSuscripcionPaypal crea suscripción con custom_id correcto y retorna { id, url }', async () => {
  const db = makeDb({ planRow: { plan: 'pyme', moneda: 'USD', paypal_plan_id: 'P-pyme-usd' } });

  // Responses: 1) OAuth token, 2) create subscription
  const fi = mockFetch([
    { status: 200, body: { access_token: 'tok', expires_in: 3600 } },
    {
      status: 200,
      body: {
        id:    'I-sub-abc',
        status:'APPROVAL_PENDING',
        links: [
          { rel: 'self',    href: 'https://api-m.sandbox.paypal.com/v1/billing/subscriptions/I-sub-abc' },
          { rel: 'approve', href: 'https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=BA-xyz' },
        ],
      },
    },
  ]);

  const result = await crearSuscripcionPaypal({
    plan: 'pyme', moneda: 'USD', payerEmail: 'user@test.com',
    returnUrl: 'https://panel/#plan', cancelUrl: 'https://panel/#plan',
    companyId: 'cid-123', db, fetchImpl: fi,
  });

  expect(result).toEqual({
    id:  'I-sub-abc',
    url: 'https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=BA-xyz',
  });

  const subCall = fi.mock.calls.find(([url]) => url.includes('/v1/billing/subscriptions'));
  const subBody = JSON.parse(subCall[1].body);
  const customId = JSON.parse(subBody.custom_id);
  expect(customId.companyId).toBe('cid-123');
  expect(customId.plan).toBe('pyme');
  expect(customId.moneda).toBe('USD');
  expect(subBody.subscriber.email_address).toBe('user@test.com');
});

test('crearSuscripcionPaypal lanza si moneda es CLP', async () => {
  const db = makeDb();
  await expect(
    crearSuscripcionPaypal({ plan: 'pyme', moneda: 'CLP', payerEmail: 'x@x.cl', returnUrl: '', cancelUrl: '', companyId: 'c', db }),
  ).rejects.toThrow(/CLP/);
});

// ── verificarWebhookPaypal ────────────────────────────────────────────────────

test('verificarWebhookPaypal retorna true cuando PayPal responde SUCCESS', async () => {
  // Responses: 1) OAuth token, 2) verify
  const fi = mockFetch([
    { status: 200, body: { access_token: 'tok', expires_in: 3600 } },
    { status: 200, body: { verification_status: 'SUCCESS' } },
  ]);

  const headers = {
    'paypal-auth-algo':       'SHA256withRSA',
    'paypal-cert-url':        'https://api.paypal.com/cert',
    'paypal-transmission-id': 'tx-123',
    'paypal-transmission-sig':'sig-abc',
    'paypal-transmission-time':'2024-01-01T00:00:00Z',
  };

  const result = await verificarWebhookPaypal(headers, { event_type: 'BILLING.SUBSCRIPTION.ACTIVATED' }, { fetchImpl: fi });
  expect(result).toBe(true);
});

test('verificarWebhookPaypal retorna false cuando PayPal responde FAILURE', async () => {
  const fi = mockFetch([
    { status: 200, body: { access_token: 'tok', expires_in: 3600 } },
    { status: 200, body: { verification_status: 'FAILURE' } },
  ]);

  const result = await verificarWebhookPaypal({}, {}, { fetchImpl: fi });
  expect(result).toBe(false);
});

test('verificarWebhookPaypal retorna false si PAYPAL_WEBHOOK_ID no configurado', async () => {
  delete process.env.PAYPAL_WEBHOOK_ID;
  const fi = jest.fn();
  const result = await verificarWebhookPaypal({}, {}, { fetchImpl: fi });
  expect(result).toBe(false);
  expect(fi).not.toHaveBeenCalled();
});

test('verificarWebhookPaypal retorna false si PayPal lanza error', async () => {
  const fi = mockFetch([
    { status: 200, body: { access_token: 'tok', expires_in: 3600 } },
    { status: 500, body: { message: 'internal error' } },
  ]);
  const result = await verificarWebhookPaypal({}, {}, { fetchImpl: fi });
  expect(result).toBe(false);
});
