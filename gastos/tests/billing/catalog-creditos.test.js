// Verifica que /catalog/extraer consume 1 crédito 'imagen' antes de llamar al extractor IA.
// Misma infraestructura que intake-creditos.test.js.
process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createCompany } = require('../../src/companies/repo');
const { hashPassword } = require('../../src/auth/password');
const { createAppRouter } = require('../../src/app/router');
const { saldo, SinCreditosError } = require('../../src/billing/creditos');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}

async function seedEmployee(db, companyId) {
  const hash = await hashPassword('clave');
  await db.query(
    "INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'J','juan',$2)",
    [companyId, hash]
  );
}

function buildApp(db, deps) {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use('/api/app', createAppRouter({ db, ...deps }));
  return app;
}

async function loginToken(app) {
  const res = await request(app).post('/api/app/login').send({ usuario: 'juan', password: 'clave' });
  return res.body.token;
}

test('catalog/extraer descuenta 1 crédito imagen antes del extractor', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestCo' });
  await seedEmployee(db, co.id);

  let extractorLlamado = false;
  const fakeExtractor = jest.fn(async () => {
    extractorLlamado = true;
    return { productos: [{ nombre: 'Pizza', precio: 5000 }] };
  });

  const app = buildApp(db, { extraerProductos: fakeExtractor });
  const token = await loginToken(app);

  const res = await request(app)
    .post('/api/app/catalog/extraer')
    .set('Authorization', `Bearer ${token}`)
    .send({ imageBase64: 'aGVsbG8=' }); // base64 "hello"

  expect(res.status).toBe(200);
  expect(extractorLlamado).toBe(true);

  const s = await saldo(db, co.id);
  expect(s.usado).toBe(1);
});

test('catalog/extraer con créditos agotados NO llama al extractor y devuelve 402', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestCo2' });
  await seedEmployee(db, co.id);

  // Agotar créditos
  await db.query('UPDATE subscriptions SET creditos_usados = creditos_limite WHERE company_id=$1', [co.id]);

  let extractorLlamado = false;
  const fakeExtractor = jest.fn(async () => {
    extractorLlamado = true;
    return { productos: [] };
  });

  const app = buildApp(db, { extraerProductos: fakeExtractor });
  const token = await loginToken(app);

  const res = await request(app)
    .post('/api/app/catalog/extraer')
    .set('Authorization', `Bearer ${token}`)
    .send({ imageBase64: 'aGVsbG8=' });

  expect(res.status).toBe(402);
  expect(extractorLlamado).toBe(false);
});
