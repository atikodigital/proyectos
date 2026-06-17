// gastos/tests/contabilidad/manual-api.test.js
const request = require('supertest');
const express = require('express');
require('express-async-errors');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { signToken } = require('../../src/auth/jwt');
const cuentasMod = require('../../src/contabilidad/cuentas');
const { createAppRouter } = require('../../src/app/router');

const COMPANY = '11111111-1111-1111-1111-111111111111';
const EMP = '22222222-2222-2222-2222-222222222222';

async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await cuentasMod.sembrarCuentas(db, COMPANY);
  const app = express(); app.use(express.json()); app.use('/api/app', createAppRouter({ db }));
  const token = signToken({ kind: 'employee', companyId: COMPANY, employeeId: EMP, rol: 'empleado' });
  return { app, token, db };
}

test('GET /cuentas lista', async () => {
  const { app, token } = await setup();
  const r = await request(app).get('/api/app/cuentas').set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(200);
  expect(r.body.cuentas.length).toBeGreaterThan(2);
});

test('POST /asientos/manual crea balanceado y anular lo anula', async () => {
  const { app, token } = await setup();
  const cs = (await request(app).get('/api/app/cuentas').set('Authorization', `Bearer ${token}`)).body.cuentas;
  const r = await request(app).post('/api/app/asientos/manual').set('Authorization', `Bearer ${token}`)
    .send({ fecha: '2026-06-10', glosa: 'Ajuste', lineas: [{ cuenta_id: cs[0].id, debe: 5000, haber: 0 }, { cuenta_id: cs[1].id, debe: 0, haber: 5000 }] });
  expect(r.status).toBe(201);
  const id = r.body.asiento.id;
  const an = await request(app).post(`/api/app/asientos/${id}/anular`).set('Authorization', `Bearer ${token}`);
  expect(an.status).toBe(200);
});

test('POST /asientos/manual descuadrado -> 400', async () => {
  const { app, token } = await setup();
  const cs = (await request(app).get('/api/app/cuentas').set('Authorization', `Bearer ${token}`)).body.cuentas;
  const r = await request(app).post('/api/app/asientos/manual').set('Authorization', `Bearer ${token}`)
    .send({ lineas: [{ cuenta_id: cs[0].id, debe: 5000, haber: 0 }, { cuenta_id: cs[1].id, debe: 0, haber: 4000 }] });
  expect(r.status).toBe(400);
  expect(r.body.error).toBe('descuadrado');
});

test('sin token -> 401', async () => {
  const { app } = await setup();
  expect((await request(app).get('/api/app/cuentas')).status).toBe(401);
});
