process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createCompany } = require('../../src/companies/repo');
const { hashPassword } = require('../../src/auth/password');
const { signToken } = require('../../src/auth/jwt');
const { createPanelRouter } = require('../../src/panel/router');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}

function buildApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/panel', createPanelRouter({ db }));
  return app;
}

async function seedOwner(db, companyId) {
  const hash = await hashPassword('claveOwner');
  await db.query(
    "INSERT INTO users(company_id, email, password_hash, rol) VALUES($1,'owner@test.cl',$2,'owner')",
    [companyId, hash]
  );
}

async function getToken(app) {
  const res = await request(app).post('/api/panel/login').send({ email: 'owner@test.cl', password: 'claveOwner' });
  return res.body.token;
}

test('GET /api/panel/suscripcion devuelve saldo free de la empresa autenticada', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestCo' });
  await seedOwner(db, co.id);

  const app = buildApp(db);
  const tok = await getToken(app);

  const res = await request(app)
    .get('/api/panel/suscripcion')
    .set('Authorization', `Bearer ${tok}`);

  expect(res.status).toBe(200);
  expect(res.body.plan).toBe('free');
  expect(res.body.limite).toBe(30);
  expect(res.body.restante).toBe(30);
});

test('GET /api/panel/suscripcion sin token → 401', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestCo2' });
  await seedOwner(db, co.id);

  const app = buildApp(db);
  const res = await request(app).get('/api/panel/suscripcion');
  expect(res.status).toBe(401);
});

test('POST /suscripcion/crear pasa payer_email a MP y devuelve url (CLP, back-compat init_point gone)', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestCo3' });
  await seedOwner(db, co.id);

  // Stub MP_ACCESS_TOKEN and global.fetch to intercept the MP call
  process.env.MP_ACCESS_TOKEN = 'TEST_TOKEN';
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: 'PRE-STUB', init_point: 'https://mp.cl/pay/PRE-STUB' }),
  });

  try {
    const app = buildApp(db);
    const tok = await getToken(app);

    const res = await request(app)
      .post('/api/panel/suscripcion/crear')
      .set('Authorization', `Bearer ${tok}`)
      .send({ plan: 'pyme' });

    expect(res.status).toBe(200);
    // Unified response key is now 'url'
    expect(res.body.url).toBe('https://mp.cl/pay/PRE-STUB');

    // Verify payer_email was included in the MP request body
    const mpCall = global.fetch.mock.calls.find((c) => String(c[0]).includes('/preapproval'));
    expect(mpCall).toBeTruthy();
    const capturedBody = JSON.parse(mpCall[1].body);
    expect(capturedBody.payer_email).toBe('owner@test.cl');

    // procesador='mp', moneda='CLP' persisted
    const subRow = await db.query('SELECT procesador, moneda FROM subscriptions WHERE company_id=$1', [co.id]);
    expect(subRow.rows[0].procesador).toBe('mp');
    expect(subRow.rows[0].moneda).toBe('CLP');
  } finally {
    delete global.fetch;
    delete process.env.MP_ACCESS_TOKEN;
  }
});

test('POST /suscripcion/crear moneda omitida → default CLP (MP) — back-compat', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestCoBackCompat' });
  await seedOwner(db, co.id);

  process.env.MP_ACCESS_TOKEN = 'TEST_TOKEN';
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: 'PRE-BC', init_point: 'https://mp.cl/pay/PRE-BC' }),
  });

  try {
    const app = buildApp(db);
    const tok = await getToken(app);

    // No moneda in body (old panel call)
    const res = await request(app)
      .post('/api/panel/suscripcion/crear')
      .set('Authorization', `Bearer ${tok}`)
      .send({ plan: 'basico' });

    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://mp.cl/pay/PRE-BC');

    const mpCall = global.fetch.mock.calls.find((c) => String(c[0]).includes('/preapproval'));
    expect(mpCall).toBeTruthy();

    const subRow = await db.query('SELECT procesador, moneda FROM subscriptions WHERE company_id=$1', [co.id]);
    expect(subRow.rows[0].procesador).toBe('mp');
    expect(subRow.rows[0].moneda).toBe('CLP');
  } finally {
    delete global.fetch;
    delete process.env.MP_ACCESS_TOKEN;
  }
});

test('POST /suscripcion/crear moneda USD → Lemon Squeezy; persiste procesador=lemonsqueezy, moneda=USD', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestCoUSD' });
  await seedOwner(db, co.id);

  process.env.LEMONSQUEEZY_API_KEY  = 'ls_key_usd';
  process.env.LEMONSQUEEZY_STORE_ID = '999';

  await db.query(
    `INSERT INTO lemonsqueezy_variants(plan, variant_id) VALUES('pyme','VAR-pyme-usd')`);

  global.fetch = jest.fn(async (url) => {
    const u = String(url);
    if (u.includes('/v1/checkouts'))
      return { ok: true, status: 201, json: async () => ({
        data: { id: 'chk-USD-1', attributes: { url: 'https://hashia.lemonsqueezy.com/checkout/chk-USD-1' } },
      }) };
    return { ok: false, status: 404, json: async () => ({}) };
  });

  try {
    const app = buildApp(db);
    const tok = await getToken(app);

    const res = await request(app)
      .post('/api/panel/suscripcion/crear')
      .set('Authorization', `Bearer ${tok}`)
      .send({ plan: 'pyme', moneda: 'USD' });

    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://hashia.lemonsqueezy.com/checkout/chk-USD-1');

    const lsCall = global.fetch.mock.calls.find((c) => String(c[0]).includes('/v1/checkouts'));
    expect(lsCall).toBeTruthy();

    const subRow = await db.query('SELECT procesador, moneda FROM subscriptions WHERE company_id=$1', [co.id]);
    expect(subRow.rows[0].procesador).toBe('lemonsqueezy');
    expect(subRow.rows[0].moneda).toBe('USD');
  } finally {
    delete global.fetch;
    delete process.env.LEMONSQUEEZY_API_KEY;
    delete process.env.LEMONSQUEEZY_STORE_ID;
  }
});

test('POST /suscripcion/crear moneda EUR → Lemon Squeezy; persiste procesador=lemonsqueezy, moneda=EUR', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestCoEUR' });
  await seedOwner(db, co.id);

  process.env.LEMONSQUEEZY_API_KEY  = 'ls_key_eur';
  process.env.LEMONSQUEEZY_STORE_ID = '999';

  await db.query(
    `INSERT INTO lemonsqueezy_variants(plan, variant_id) VALUES('empresa','VAR-empresa-eur')`);

  global.fetch = jest.fn(async (url) => {
    const u = String(url);
    if (u.includes('/v1/checkouts'))
      return { ok: true, status: 201, json: async () => ({
        data: { id: 'chk-EUR-1', attributes: { url: 'https://hashia.lemonsqueezy.com/checkout/chk-EUR-1' } },
      }) };
    return { ok: false, status: 404, json: async () => ({}) };
  });

  try {
    const app = buildApp(db);
    const tok = await getToken(app);

    const res = await request(app)
      .post('/api/panel/suscripcion/crear')
      .set('Authorization', `Bearer ${tok}`)
      .send({ plan: 'empresa', moneda: 'EUR' });

    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://hashia.lemonsqueezy.com/checkout/chk-EUR-1');

    const lsCall = global.fetch.mock.calls.find((c) => String(c[0]).includes('/v1/checkouts'));
    expect(lsCall).toBeTruthy();

    const subRow = await db.query('SELECT procesador, moneda FROM subscriptions WHERE company_id=$1', [co.id]);
    expect(subRow.rows[0].procesador).toBe('lemonsqueezy');
    expect(subRow.rows[0].moneda).toBe('EUR');
  } finally {
    delete global.fetch;
    delete process.env.LEMONSQUEEZY_API_KEY;
    delete process.env.LEMONSQUEEZY_STORE_ID;
  }
});

test('POST /suscripcion/crear moneda USD sin variante configurada → 502 pago_error', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestCoUSDSinVariante' });
  await seedOwner(db, co.id);

  process.env.LEMONSQUEEZY_API_KEY  = 'ls_key_novar';
  process.env.LEMONSQUEEZY_STORE_ID = '999';

  global.fetch = jest.fn(); // should not be called

  try {
    const app = buildApp(db);
    const tok = await getToken(app);

    const res = await request(app)
      .post('/api/panel/suscripcion/crear')
      .set('Authorization', `Bearer ${tok}`)
      .send({ plan: 'pyme', moneda: 'USD' });

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('pago_error');
  } finally {
    delete global.fetch;
    delete process.env.LEMONSQUEEZY_API_KEY;
    delete process.env.LEMONSQUEEZY_STORE_ID;
  }
});

test('POST /suscripcion/crear moneda XYZ → 400 moneda_invalida', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestCoXYZ' });
  await seedOwner(db, co.id);

  const app = buildApp(db);
  const tok = await getToken(app);

  const res = await request(app)
    .post('/api/panel/suscripcion/crear')
    .set('Authorization', `Bearer ${tok}`)
    .send({ plan: 'pyme', moneda: 'XYZ' });

  expect(res.status).toBe(400);
  expect(res.body.error).toBe('moneda_invalida');
});

test('POST /suscripcion/crear CLP → 409 payer_es_colector cuando MP dice "Payer and collector cannot be the same user"', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestCoColector' });
  await seedOwner(db, co.id);

  process.env.MP_ACCESS_TOKEN = 'TEST_TOKEN';
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 400,
    json: async () => ({ message: 'Payer and collector cannot be the same user', status: 400 }),
  });

  try {
    const app = buildApp(db);
    const tok = await getToken(app);

    const res = await request(app)
      .post('/api/panel/suscripcion/crear')
      .set('Authorization', `Bearer ${tok}`)
      .send({ plan: 'pyme' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('payer_es_colector');
    expect(res.body.mensaje).toMatch(/mismo correo|cuenta de cobro/i);
  } finally {
    delete global.fetch;
    delete process.env.MP_ACCESS_TOKEN;
  }
});

test('POST /suscripcion/crear → 400 email_requerido si usuario no existe en DB', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestCo4' });

  // Forge a token for a userId that doesn't exist in the users table
  const ghostUserId = '99999999-0000-0000-0000-000000000000';
  const tok = signToken({ kind: 'user', companyId: co.id, userId: ghostUserId, rol: 'owner' });

  const app = buildApp(db);
  const res = await request(app)
    .post('/api/panel/suscripcion/crear')
    .set('Authorization', `Bearer ${tok}`)
    .send({ plan: 'pyme' });

  expect(res.status).toBe(400);
  expect(res.body.error).toBe('email_requerido');
});
