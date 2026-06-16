// gastos/tests/contabilidad/api.test.js
// TDD – T9: endpoints GET de reportes contables en /api/app
// TDD – T10: alta manual genera devengo con cuenta SII correcta
process.env.JWT_SECRET = 'test-secret';

const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createAppRouter } = require('../../src/app/router');
const { signToken } = require('../../src/auth/jwt');
const cuentas = require('../../src/contabilidad/cuentas');
const { contabilizarMovimiento } = require('../../src/contabilidad/contabilizar');
const { mapCategoryToSii } = require('../../src/domain/categories');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({
    name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => require('crypto').randomUUID(),
  });
  mem.public.registerFunction({
    name: 'now', returns: 'timestamptz', impure: true,
    implementation: () => new Date(),
  });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}

async function setup() {
  const db = await makeDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('TestCo') RETURNING id");
  const companyId = c.rows[0].id;
  const e = await db.query(
    "INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'Ana','ana','hash') RETURNING id",
    [companyId]
  );
  const employeeId = e.rows[0].id;

  // Sembrar cuentas y registrar un movimiento contable para tener datos
  await cuentas.sembrarCuentas(db, companyId);
  await contabilizarMovimiento(db, companyId, {
    id: 'e-test-1', tipo: 'gasto', neto: 10000, iva: 1900, total: 11900,
    fecha: '2026-06-10', cuenta_sii_codigo: '4.3.10.1', proveedor: 'Proveedor Test',
  }, 'devengo');

  const token = signToken({ kind: 'employee', companyId, employeeId, rol: 'empleado' });

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/app', createAppRouter({ db }));

  return { app, token, companyId };
}

test('GET /contabilidad/diario sin token devuelve 401', async () => {
  const { app } = await setup();
  const res = await request(app).get('/api/app/contabilidad/diario');
  expect(res.status).toBe(401);
});

test('GET /contabilidad/diario con token devuelve { asientos }', async () => {
  const { app, token } = await setup();
  const res = await request(app)
    .get('/api/app/contabilidad/diario')
    .set('Authorization', `Bearer ${token}`)
    .query({ periodo: '2026-06' });
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('asientos');
  expect(Array.isArray(res.body.asientos)).toBe(true);
  expect(res.body.asientos.length).toBeGreaterThanOrEqual(1);
});

test('GET /contabilidad/mayor con token devuelve { cuentas }', async () => {
  const { app, token } = await setup();
  const res = await request(app)
    .get('/api/app/contabilidad/mayor')
    .set('Authorization', `Bearer ${token}`)
    .query({ periodo: '2026-06' });
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('cuentas');
  expect(Array.isArray(res.body.cuentas)).toBe(true);
});

test('GET /contabilidad/balance con token devuelve objeto balanceComprobacion', async () => {
  const { app, token } = await setup();
  const res = await request(app)
    .get('/api/app/contabilidad/balance')
    .set('Authorization', `Bearer ${token}`)
    .query({ periodo: '2026-06' });
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('cuadrado');
  expect(res.body).toHaveProperty('totalDebe');
  expect(res.body).toHaveProperty('totalHaber');
  expect(res.body).toHaveProperty('cuentas');
});

test('GET /contabilidad/flujo con token devuelve objeto flujoCaja', async () => {
  const { app, token } = await setup();
  const res = await request(app)
    .get('/api/app/contabilidad/flujo')
    .set('Authorization', `Bearer ${token}`)
    .query({ periodo: '2026-06' });
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('entradas');
  expect(res.body).toHaveProperty('salidas');
  expect(res.body).toHaveProperty('neto');
  expect(res.body).toHaveProperty('movimientos');
});

test('T10: POST /expenses/manual GASTO genera devengo en la cuenta SII correcta (no genérica)', async () => {
  const { app, token } = await setup();
  const categoria = 'Servicios básicos';
  const cuentaEsperada = mapCategoryToSii(categoria);

  // 1. Crear un gasto manual – debe crear la expense Y contabilizarla
  const postRes = await request(app)
    .post('/api/app/expenses/manual')
    .set('Authorization', `Bearer ${token}`)
    .send({ tipo: 'gasto', total: 11900, neto: 10000, iva: 1900, categoria, fecha: '2026-06-10' });
  expect(postRes.status).toBe(201);

  // 2. El diario debe tener al menos un asiento (el devengo generado)
  const diarioRes = await request(app)
    .get('/api/app/contabilidad/diario')
    .set('Authorization', `Bearer ${token}`)
    .query({ periodo: '2026-06' });
  expect(diarioRes.status).toBe(200);
  expect(diarioRes.body.asientos.length).toBeGreaterThanOrEqual(1);

  // 3. El balance debe cuadrar
  const balanceRes = await request(app)
    .get('/api/app/contabilidad/balance')
    .set('Authorization', `Bearer ${token}`)
    .query({ periodo: '2026-06' });
  expect(balanceRes.status).toBe(200);
  expect(balanceRes.body.cuadrado).toBe(true);

  // 4. El mayor debe contener la cuenta SII mapeada desde la categoría con debe > 0
  const mayorRes = await request(app)
    .get('/api/app/contabilidad/mayor')
    .set('Authorization', `Bearer ${token}`)
    .query({ periodo: '2026-06' });
  expect(mayorRes.status).toBe(200);
  const cuentaMayor = mayorRes.body.cuentas.find(c => c.codigo === cuentaEsperada.codigo);
  expect(cuentaMayor).toBeDefined();
  expect(cuentaMayor.debe).toBeGreaterThan(0);
});
