process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createCompany } = require('../../src/companies/repo');
const { hashPassword } = require('../../src/auth/password');
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
