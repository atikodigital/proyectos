/**
 * Tests para POST /api/app/expenses/manual (registro por KALY voz/texto).
 * Modelo unificado: 1 shot = 1 movimiento registrado por la IA. Verifica que
 * el registro manual cobra 1 crédito y que sin créditos devuelve 402 sin crear.
 */
process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createCompany } = require('../../src/companies/repo');
const { hashPassword } = require('../../src/auth/password');
const { createAppRouter } = require('../../src/app/router');

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

function buildApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/app', createAppRouter({ db }));
  return app;
}

async function seedEmployee(db, companyId) {
  const hash = await hashPassword('clave');
  await db.query(
    "INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'Emp','empuser',$2)",
    [companyId, hash]
  );
}

async function getToken(app) {
  const res = await request(app).post('/api/app/login').send({ usuario: 'empuser', password: 'clave' });
  return res.body.token;
}

async function usado(db, companyId) {
  const r = await db.query('SELECT creditos_usados FROM subscriptions WHERE company_id=$1', [companyId]);
  return r.rows[0] ? Number(r.rows[0].creditos_usados) : null;
}

test('registro manual (KALY voz/texto) cobra 1 shot de movimiento', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestManual' });
  await seedEmployee(db, co.id);
  const app = buildApp(db);
  const tok = await getToken(app);

  expect(await usado(db, co.id)).toBe(0);

  const res = await request(app)
    .post('/api/app/expenses/manual')
    .set('Authorization', `Bearer ${tok}`)
    .send({ tipo: 'gasto', proveedor: 'Bencina', total: 5000, categoria: 'transporte' });

  expect(res.status).toBe(201);
  expect(res.body.id).toBeDefined();
  // 1 movimiento × peso 1 = 1 crédito usado
  expect(await usado(db, co.id)).toBe(1);
});

test('dos registros manuales cobran 2 shots', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestManual2' });
  await seedEmployee(db, co.id);
  const app = buildApp(db);
  const tok = await getToken(app);

  for (const t of [1000, 2000]) {
    await request(app)
      .post('/api/app/expenses/manual')
      .set('Authorization', `Bearer ${tok}`)
      .send({ tipo: 'gasto', total: t });
  }

  expect(await usado(db, co.id)).toBe(2);
});

test('sin créditos → 402 sin_creditos y NO crea el movimiento', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'TestManualNoCred' });
  await seedEmployee(db, co.id);
  await db.query('UPDATE subscriptions SET creditos_usados = creditos_limite WHERE company_id=$1', [co.id]);
  const app = buildApp(db);
  const tok = await getToken(app);

  const res = await request(app)
    .post('/api/app/expenses/manual')
    .set('Authorization', `Bearer ${tok}`)
    .send({ tipo: 'gasto', total: 3000 });

  expect(res.status).toBe(402);
  expect(res.body.error).toBe('sin_creditos');
  const r = await db.query("SELECT count(*)::int AS n FROM expenses WHERE company_id=$1", [co.id]);
  expect(r.rows[0].n).toBe(0);
});
