// gastos/tests/panel/manual-api.test.js
const request = require('supertest');
const express = require('express');
require('express-async-errors');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { signToken } = require('../../src/auth/jwt');
const cuentasMod = require('../../src/contabilidad/cuentas');
const { createPanelRouter } = require('../../src/panel/router');

const COMPANY = '11111111-1111-1111-1111-111111111111';

async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await cuentasMod.sembrarCuentas(db, COMPANY);
  const app = express(); app.use(express.json()); app.use('/api/panel', createPanelRouter({ db }));
  const token = signToken({ kind: 'user', companyId: COMPANY, userId: 'u', rol: 'owner' });
  return { app, token };
}

test('panel: GET /cuentas + POST /asientos/manual + anular', async () => {
  const { app, token } = await setup();
  const cs = (await request(app).get('/api/panel/cuentas').set('Authorization', `Bearer ${token}`)).body.cuentas;
  expect(cs.length).toBeGreaterThan(2);
  const r = await request(app).post('/api/panel/asientos/manual').set('Authorization', `Bearer ${token}`)
    .send({ fecha: '2026-06-10', glosa: 'Sueldos', lineas: [{ cuenta_id: cs[0].id, debe: 8000, haber: 0 }, { cuenta_id: cs[1].id, debe: 0, haber: 8000 }] });
  expect(r.status).toBe(201);
  const an = await request(app).post(`/api/panel/asientos/${r.body.asiento.id}/anular`).set('Authorization', `Bearer ${token}`);
  expect(an.status).toBe(200);
});

test('panel descuadrado -> 400; sin token -> 401', async () => {
  const { app, token } = await setup();
  const cs = (await request(app).get('/api/panel/cuentas').set('Authorization', `Bearer ${token}`)).body.cuentas;
  const r = await request(app).post('/api/panel/asientos/manual').set('Authorization', `Bearer ${token}`)
    .send({ lineas: [{ cuenta_id: cs[0].id, debe: 8000, haber: 0 }, { cuenta_id: cs[1].id, debe: 0, haber: 1 }] });
  expect(r.status).toBe(400);
  expect((await request(app).get('/api/panel/cuentas')).status).toBe(401);
});
