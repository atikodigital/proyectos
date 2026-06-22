process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createCompany } = require('../../src/companies/repo');
const { hashPassword } = require('../../src/auth/password');
const { consumirCredito } = require('../../src/billing/creditos');
const { createAppRouter } = require('../../src/app/router');

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
  app.use(express.json({ limit: '15mb' }));
  app.use('/api/app', createAppRouter({ db }));
  return app;
}

async function seedEmployee(db, companyId) {
  const hash = await hashPassword('clave');
  await db.query(
    "INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'Test','testuser',$2)",
    [companyId, hash]
  );
}

async function getToken(app) {
  const res = await request(app).post('/api/app/login').send({ usuario: 'testuser', password: 'clave' });
  return res.body.token;
}

test('GET /suscripcion devuelve saldo de la empresa autenticada', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'X' });
  await seedEmployee(db, co.id);
  await consumirCredito(db, co.id, { tipo: 'imagen', cantidad: 2 });

  const app = buildApp(db);
  const tok = await getToken(app);

  const res = await request(app)
    .get('/api/app/suscripcion')
    .set('Authorization', `Bearer ${tok}`);

  expect(res.status).toBe(200);
  expect(res.body.plan).toBe('free');
  expect(res.body.limite).toBe(30);
  expect(res.body.usado).toBe(2);
  expect(res.body.restante).toBe(28);
});
