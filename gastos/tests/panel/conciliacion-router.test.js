// gastos/tests/panel/conciliacion-router.test.js
const request = require('supertest');
const express = require('express');
require('express-async-errors');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { signToken } = require('../../src/auth/jwt');
const matchRepo = require('../../src/match/repo');
const { createPanelRouter } = require('../../src/panel/router');

const COMPANY = '11111111-1111-1111-1111-111111111111';
const USER = '33333333-3333-3333-3333-333333333333';

async function makeApp() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await matchRepo.guardarConciliacion(db, COMPANY, 'bancaria', { saldoFinalCartola: 88100, bancoContable: 90000, sca: 88100, sba: 88100, cuadrado: true, partidas: [{ tipo: 'nota_debito', monto: 1900 }], suggested: [], exceptions: [] });
  const app = express();
  app.use(express.json());
  app.use('/api/panel', createPanelRouter({ db }));
  const token = signToken({ kind: 'user', companyId: COMPANY, userId: USER, rol: 'owner' });
  return { app, token };
}

test('GET /api/panel/contabilidad/conciliacion devuelve el último workpaper', async () => {
  const { app, token } = await makeApp();
  const r = await request(app).get('/api/panel/contabilidad/conciliacion').set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(200);
  expect(r.body.cuadrado).toBe(true);
  expect(Number(r.body.sca)).toBe(88100);
});

test('sin conciliación previa -> 200 con null', async () => {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg(); const db = new pg.Pool(); await migrate(db);
  const app = express(); app.use(express.json()); app.use('/api/panel', createPanelRouter({ db }));
  const token = signToken({ kind: 'user', companyId: COMPANY, userId: USER, rol: 'owner' });
  const r = await request(app).get('/api/panel/contabilidad/conciliacion').set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(200);
  expect(r.body.conciliacion).toBeNull();
});

test('sin token -> 401', async () => {
  const { app } = await makeApp();
  const r = await request(app).get('/api/panel/contabilidad/conciliacion');
  expect(r.status).toBe(401);
});
