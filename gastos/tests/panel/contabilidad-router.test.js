// gastos/tests/panel/contabilidad-router.test.js
const request = require('supertest');
const express = require('express');
require('express-async-errors');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { signToken } = require('../../src/auth/jwt');
const cuentas = require('../../src/contabilidad/cuentas');
const { contabilizarMovimiento } = require('../../src/contabilidad/contabilizar');
const { createPanelRouter } = require('../../src/panel/router');

const COMPANY = '11111111-1111-1111-1111-111111111111';
const USER = '33333333-3333-3333-3333-333333333333';

async function makeApp() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await cuentas.sembrarCuentas(db, COMPANY);
  await contabilizarMovimiento(db, COMPANY, { id: 'e1', tipo: 'gasto', neto: 10000, iva: 1900, total: 11900, fecha: '2026-06-10', cuenta_sii_codigo: '4.3.10.1', proveedor: 'Sodimac' }, 'devengo');
  const app = express();
  app.use(express.json());
  app.use('/api/panel', createPanelRouter({ db }));
  const token = signToken({ kind: 'user', companyId: COMPANY, userId: USER, rol: 'owner' });
  return { app, token };
}

test('GET /api/panel/contabilidad/diario devuelve asientos (token user)', async () => {
  const { app, token } = await makeApp();
  const r = await request(app).get('/api/panel/contabilidad/diario?periodo=2026-06').set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(200);
  expect(Array.isArray(r.body.asientos)).toBe(true);
  expect(r.body.asientos.length).toBe(1);
});

test('GET /api/panel/contabilidad/balance cuadra', async () => {
  const { app, token } = await makeApp();
  const r = await request(app).get('/api/panel/contabilidad/balance?periodo=2026-06').set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(200);
  expect(r.body.cuadrado).toBe(true);
});

test('contabilidad sin token -> 401', async () => {
  const { app } = await makeApp();
  const r = await request(app).get('/api/panel/contabilidad/mayor');
  expect(r.status).toBe(401);
});

test('token de otro kind (employee) -> 403', async () => {
  const { app } = await makeApp();
  const t = signToken({ kind: 'employee', companyId: COMPANY, employeeId: 'x', rol: 'empleado' });
  const r = await request(app).get('/api/panel/contabilidad/flujo').set('Authorization', `Bearer ${t}`);
  expect(r.status).toBe(403);
});
