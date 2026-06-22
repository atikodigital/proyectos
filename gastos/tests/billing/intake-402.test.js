/**
 * Prueba que POST /expenses (app) y POST /expenses/ocr (panel) devuelven 402
 * cuando la empresa no tiene créditos.
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

let uuidCounter = 0;
async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => `00000000-0000-0000-0000-${String(++uuidCounter).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}

// Fake OCR: should NOT be called when credits are exhausted, but just in case.
const fakeExtract = async () => ({ tipo: 'gasto', proveedor: 'Prov', total: 1000, fecha: '2026-06-01', lineas: [] });

// ── App route helpers ──────────────────────────────────────────────────────

function buildAppInstance(db) {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use('/api/app', createAppRouter({ db, extractExpense: fakeExtract }));
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

// ── Panel route helpers ────────────────────────────────────────────────────

function buildPanelInstance(db) {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
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

// ── Tiny valid base64 JPEG (1×1 pixel) ────────────────────────────────────
const FAKE_IMAGE_B64 = Buffer.from('fake-image').toString('base64');

// ── Tests ──────────────────────────────────────────────────────────────────

test('POST /api/app/expenses → 402 cuando empresa sin créditos', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestApp' });
  await seedAppEmployee(db, co.id);
  // Exhaust credits
  await db.query('UPDATE subscriptions SET creditos_usados = creditos_limite WHERE company_id=$1', [co.id]);

  const app = buildAppInstance(db);
  const tok = await getAppToken(app);

  const res = await request(app)
    .post('/api/app/expenses')
    .set('Authorization', `Bearer ${tok}`)
    .send({ imageBase64: FAKE_IMAGE_B64, mimeType: 'image/jpeg' });

  expect(res.status).toBe(402);
  expect(res.body.error).toBe('sin_creditos');
  expect(res.body).toHaveProperty('saldo');
});

test('POST /api/app/expenses → 201 cuando hay créditos disponibles', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestAppOk' });
  await seedAppEmployee(db, co.id);

  const app = buildAppInstance(db);
  const tok = await getAppToken(app);

  const res = await request(app)
    .post('/api/app/expenses')
    .set('Authorization', `Bearer ${tok}`)
    .send({ imageBase64: FAKE_IMAGE_B64, mimeType: 'image/jpeg' });

  expect(res.status).toBe(201);
});

test('POST /api/panel/expenses/ocr → 402 cuando empresa sin créditos', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestPanel' });
  await seedOwner(db, co.id);
  // Exhaust credits
  await db.query('UPDATE subscriptions SET creditos_usados = creditos_limite WHERE company_id=$1', [co.id]);

  // Panel router needs extractExpense injected — it's not a named param in createPanelRouter,
  // so we inject via the module-level require by monkey-patching the intake module.
  // Actually createPanelRouter doesn't accept extractExpense — patch intakeFromImage instead.
  const intake = require('../../src/expenses/intake');
  const originalIntake = intake.intakeFromImage;
  // We restore after the test; but since credits are exhausted, SinCreditosError is thrown
  // before OCR is called anyway, so no patch is needed for the 402 path.

  const app = buildPanelInstance(db);
  const tok = await getPanelToken(app);

  const res = await request(app)
    .post('/api/panel/expenses/ocr')
    .set('Authorization', `Bearer ${tok}`)
    .send({ imageBase64: FAKE_IMAGE_B64, mimeType: 'image/jpeg' });

  expect(res.status).toBe(402);
  expect(res.body.error).toBe('sin_creditos');
  expect(res.body).toHaveProperty('saldo');
});
