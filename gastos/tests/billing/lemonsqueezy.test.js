const crypto = require('crypto');
const {
  lsBase,
  lsHeaders,
  getVariantId,
  crearCheckoutLS,
  verificarFirmaLS,
} = require('../../src/billing/lemonsqueezy');

// ── helpers ───────────────────────────────────────────────────────────────────

function mockFetch(status, body) {
  return jest.fn().mockImplementation(async () => ({
    ok:     status >= 200 && status < 300,
    status,
    json:   async () => body,
  }));
}

// Minimal DB mock with a lemonsqueezy_variants table in-memory.
function makeDb({ variantRow = null } = {}) {
  const variants = variantRow ? [variantRow] : [];
  const queries = [];
  return {
    _queries: queries,
    _variants: variants,
    query: jest.fn(async (sql, params) => {
      queries.push({ sql, params });
      if (sql.includes('lemonsqueezy_variants') && sql.includes('SELECT')) {
        const found = variants.find((r) => r.plan === (params && params[0]));
        return { rows: found ? [{ variant_id: found.variant_id }] : [] };
      }
      return { rows: [] };
    }),
  };
}

// ── env setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.LEMONSQUEEZY_API_KEY        = 'test-api-key';
  process.env.LEMONSQUEEZY_STORE_ID       = '12345';
  process.env.LEMONSQUEEZY_WEBHOOK_SECRET = 'whsec-test-secret';
});

afterEach(() => {
  delete process.env.LEMONSQUEEZY_API_KEY;
  delete process.env.LEMONSQUEEZY_STORE_ID;
  delete process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  jest.restoreAllMocks();
});

// ── lsBase ────────────────────────────────────────────────────────────────────

test('lsBase devuelve la URL de la API de Lemon Squeezy', () => {
  expect(lsBase()).toBe('https://api.lemonsqueezy.com');
});

// ── lsHeaders ─────────────────────────────────────────────────────────────────

test('lsHeaders arma Accept/Content-Type/Authorization', () => {
  const h = lsHeaders();
  expect(h.Accept).toBe('application/vnd.api+json');
  expect(h['Content-Type']).toBe('application/vnd.api+json');
  expect(h.Authorization).toBe('Bearer test-api-key');
});

test('lsHeaders lanza si LEMONSQUEEZY_API_KEY no configurado', () => {
  delete process.env.LEMONSQUEEZY_API_KEY;
  expect(() => lsHeaders()).toThrow(/LEMONSQUEEZY_API_KEY/);
});

// ── getVariantId ──────────────────────────────────────────────────────────────

test('getVariantId retorna el variant_id sembrado', async () => {
  const db = makeDb({ variantRow: { plan: 'pyme', variant_id: 'VAR-pyme-1' } });
  const id = await getVariantId(db, 'pyme');
  expect(id).toBe('VAR-pyme-1');
});

test('getVariantId retorna null si no hay variante configurada', async () => {
  const db = makeDb();
  const id = await getVariantId(db, 'pyme');
  expect(id).toBeNull();
});

// ── crearCheckoutLS ───────────────────────────────────────────────────────────

test('crearCheckoutLS arma el body de checkout correctamente y retorna { id, url }', async () => {
  const db = makeDb({ variantRow: { plan: 'pyme', variant_id: 'VAR-pyme-1' } });

  const fi = mockFetch(201, {
    data: {
      id: 'chk-123',
      attributes: { url: 'https://hashia.lemonsqueezy.com/checkout/chk-123' },
    },
  });

  const result = await crearCheckoutLS({
    plan: 'pyme', moneda: 'USD', payerEmail: 'user@test.com',
    redirectUrl: 'https://panel/#plan', companyId: 'cid-123',
    db, fetchImpl: fi,
  });

  expect(result).toEqual({ id: 'chk-123', url: 'https://hashia.lemonsqueezy.com/checkout/chk-123' });

  expect(fi).toHaveBeenCalledTimes(1);
  const [url, opts] = fi.mock.calls[0];
  expect(url).toBe('https://api.lemonsqueezy.com/v1/checkouts');

  const body = JSON.parse(opts.body);
  expect(body.data.type).toBe('checkouts');
  expect(body.data.attributes.checkout_data.email).toBe('user@test.com');
  expect(body.data.attributes.checkout_data.custom.company_id).toBe('cid-123');
  expect(body.data.attributes.checkout_data.custom.plan).toBe('pyme');
  expect(body.data.attributes.product_options.redirect_url).toBe('https://panel/#plan');
  expect(body.data.relationships.store.data.id).toBe('12345');
  expect(body.data.relationships.variant.data.id).toBe('VAR-pyme-1');

  expect(opts.headers.Authorization).toBe('Bearer test-api-key');
  expect(opts.headers.Accept).toBe('application/vnd.api+json');
});

test('crearCheckoutLS lanza variante_no_configurada si no hay variant_id para el plan', async () => {
  const db = makeDb(); // empty
  const fi = jest.fn();

  await expect(
    crearCheckoutLS({
      plan: 'pyme', moneda: 'USD', payerEmail: 'user@test.com',
      redirectUrl: 'https://panel/#plan', companyId: 'cid-123', db, fetchImpl: fi,
    }),
  ).rejects.toThrow(/variante_no_configurada/);

  expect(fi).not.toHaveBeenCalled();
});

test('crearCheckoutLS lanza con status cuando LS responde error', async () => {
  const db = makeDb({ variantRow: { plan: 'pyme', variant_id: 'VAR-pyme-1' } });
  const fi = mockFetch(422, { errors: [{ detail: 'invalid variant' }] });

  await expect(
    crearCheckoutLS({
      plan: 'pyme', moneda: 'USD', payerEmail: 'user@test.com',
      redirectUrl: 'https://panel/#plan', companyId: 'cid-123', db, fetchImpl: fi,
    }),
  ).rejects.toThrow(/422/);
});

// ── verificarFirmaLS ──────────────────────────────────────────────────────────

test('verificarFirmaLS retorna true con firma HMAC correcta', () => {
  const rawBody = JSON.stringify({ meta: { event_name: 'subscription_created' } });
  const sig = crypto.createHmac('sha256', 'whsec-test-secret').update(rawBody).digest('hex');
  expect(verificarFirmaLS(rawBody, sig)).toBe(true);
});

test('verificarFirmaLS retorna false con firma incorrecta', () => {
  const rawBody = JSON.stringify({ meta: { event_name: 'subscription_created' } });
  expect(verificarFirmaLS(rawBody, 'firma-incorrecta-0000000000000000000000000000000000000000000000000000000000000000')).toBe(false);
});

test('verificarFirmaLS retorna false si falta LEMONSQUEEZY_WEBHOOK_SECRET (fail-closed)', () => {
  delete process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  const rawBody = JSON.stringify({ meta: { event_name: 'subscription_created' } });
  const sig = crypto.createHmac('sha256', 'whsec-test-secret').update(rawBody).digest('hex');
  expect(verificarFirmaLS(rawBody, sig)).toBe(false);
});
