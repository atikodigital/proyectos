/**
 * Tests para POST /agent/session/end en app y panel routers.
 * Verifica cobro de minutos de voz, validación, y SinCreditosError → 402.
 */
process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createCompany } = require('../../src/companies/repo');
const { hashPassword } = require('../../src/auth/password');
const { createAppRouter } = require('../../src/app/router');
const { createPanelRouter } = require('../../src/panel/router');

let uuidN = 0;
async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => `00000000-0000-0000-0000-${String(++uuidN).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}

// ── App helpers ───────────────────────────────────────────────────────────────

function buildAppInstance(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/app', createAppRouter({ db }));
  return app;
}

async function seedAppEmployee(db, companyId) {
  const hash = await hashPassword('clave');
  await db.query(
    "INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'Emp','empuser',$2)",
    [companyId, hash]
  );
}

async function getAppToken(app) {
  const res = await request(app).post('/api/app/login').send({ usuario: 'empuser', password: 'clave' });
  return res.body.token;
}

// ── Panel helpers ─────────────────────────────────────────────────────────────

function buildPanelInstance(db) {
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

async function getPanelToken(app) {
  const res = await request(app).post('/api/panel/login').send({ email: 'owner@test.cl', password: 'claveOwner' });
  return res.body.token;
}

// ─────────────────────────────────────────────────────────────────────────────
// APP ROUTER TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('app: 1er minuto gratis → 90s cobra solo 1 min (ceil(90/60)-1=1)', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestApp' });
  await seedAppEmployee(db, co.id);

  const app = buildAppInstance(db);
  const tok = await getAppToken(app);

  const res = await request(app)
    .post('/api/app/agent/session/end')
    .set('Authorization', `Bearer ${tok}`)
    .send({ duracion_seg: 90 });

  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  expect(res.body.saldo).toBeDefined();
  // Primer minuto gratis: 90s → ceil(90/60)-1 = 1 min × 3 = 3 créditos; free 30 → restante 27
  expect(res.body.saldo.usado).toBe(3);
  expect(res.body.saldo.restante).toBe(27);
});

test('app: voz corta (30s) NO cobra minuto — solo pagó su shot de movimiento aparte', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestApp30' });
  await seedAppEmployee(db, co.id);

  const app = buildAppInstance(db);
  const tok = await getAppToken(app);

  const res = await request(app)
    .post('/api/app/agent/session/end')
    .set('Authorization', `Bearer ${tok}`)
    .send({ duracion_seg: 30 });

  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  // 30s → ceil(30/60)-1 = 0 min → 0 créditos por voz (el 1er minuto es gratis)
  expect(res.body.saldo.usado).toBe(0);
});

test('app: duracion_seg=0 → 400 duracion_invalida', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestAppBad1' });
  await seedAppEmployee(db, co.id);

  const app = buildAppInstance(db);
  const tok = await getAppToken(app);

  for (const bad of [0, -10, 'abc', null, undefined]) {
    const body = bad === undefined ? {} : { duracion_seg: bad };
    const res = await request(app)
      .post('/api/app/agent/session/end')
      .set('Authorization', `Bearer ${tok}`)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('duracion_invalida');
  }
});

test('app: empresa sin créditos → 402 sin_creditos', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestAppNoCredits' });
  await seedAppEmployee(db, co.id);
  // Agotar todos los créditos
  await db.query('UPDATE subscriptions SET creditos_usados = creditos_limite WHERE company_id=$1', [co.id]);

  const app = buildAppInstance(db);
  const tok = await getAppToken(app);

  // 120s → ceil(120/60)-1 = 1 min a cobrar; sin créditos → 402
  const res = await request(app)
    .post('/api/app/agent/session/end')
    .set('Authorization', `Bearer ${tok}`)
    .send({ duracion_seg: 120 });

  expect(res.status).toBe(402);
  expect(res.body.error).toBe('sin_creditos');
  expect(res.body).toHaveProperty('saldo');
});

test('app: sin token → 401', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestAppNoAuth' });
  await seedAppEmployee(db, co.id);
  const app = buildAppInstance(db);

  const res = await request(app)
    .post('/api/app/agent/session/end')
    .send({ duracion_seg: 60 });

  expect(res.status).toBe(401);
});

// ─────────────────────────────────────────────────────────────────────────────
// PANEL ROUTER TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('panel: 90s → cobra 2 min, devuelve ok y saldo', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestPanel' });
  await seedOwner(db, co.id);

  const app = buildPanelInstance(db);
  const tok = await getPanelToken(app);

  const res = await request(app)
    .post('/api/panel/agent/session/end')
    .set('Authorization', `Bearer ${tok}`)
    .send({ duracion_seg: 90 });

  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  expect(res.body.saldo).toBeDefined();
  expect(res.body.saldo.usado).toBe(6);
  expect(res.body.saldo.restante).toBe(24);
});

test('panel: duracion_seg inválido → 400 duracion_invalida', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestPanelBad' });
  await seedOwner(db, co.id);

  const app = buildPanelInstance(db);
  const tok = await getPanelToken(app);

  for (const bad of [0, -5, 'texto']) {
    const res = await request(app)
      .post('/api/panel/agent/session/end')
      .set('Authorization', `Bearer ${tok}`)
      .send({ duracion_seg: bad });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('duracion_invalida');
  }
});

test('panel: empresa sin créditos → 402 sin_creditos', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestPanelNoCredits' });
  await seedOwner(db, co.id);
  // Agotar créditos
  await db.query('UPDATE subscriptions SET creditos_usados = creditos_limite WHERE company_id=$1', [co.id]);

  const app = buildPanelInstance(db);
  const tok = await getPanelToken(app);

  const res = await request(app)
    .post('/api/panel/agent/session/end')
    .set('Authorization', `Bearer ${tok}`)
    .send({ duracion_seg: 60 });

  expect(res.status).toBe(402);
  expect(res.body.error).toBe('sin_creditos');
  expect(res.body).toHaveProperty('saldo');
});
