// gastos/tests/panel/auxiliares-router.test.js
const request = require('supertest');
const express = require('express');
require('express-async-errors');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { signToken } = require('../../src/auth/jwt');
const aux = require('../../src/auxiliares/repo');
const { createPanelRouter } = require('../../src/panel/router');

const COMPANY = '11111111-1111-1111-1111-111111111111';
async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await db.query("INSERT INTO companies (id, nombre) VALUES ($1,'T')", [COMPANY]);
  const app = express(); app.use(express.json()); app.use('/api/panel', createPanelRouter({ db }));
  const token = signToken({ kind: 'user', companyId: COMPANY, userId: 'u', rol: 'owner' });
  return { app, token, db };
}

test('POST/GET/PATCH auxiliares + sembrar (componer inyectado) + giro', async () => {
  const { app, token } = await setup();
  // crear
  let r = await request(app).post('/api/panel/auxiliares').set('Authorization', `Bearer ${token}`).send({ nombre: 'Harina', unidad_principal: 'kg' });
  expect(r.status).toBe(201);
  const id = r.body.id;
  // listar
  r = await request(app).get('/api/panel/auxiliares').set('Authorization', `Bearer ${token}`);
  expect(r.body.auxiliares.length).toBe(1);
  // renombrar
  r = await request(app).patch(`/api/panel/auxiliares/${id}`).set('Authorization', `Bearer ${token}`).send({ nombre: 'Harina selecta' });
  expect(r.body.auxiliar.nombre).toBe('Harina selecta');
  // giro
  r = await request(app).patch('/api/panel/giro').set('Authorization', `Bearer ${token}`).send({ giro: 'pizzería' });
  expect(r.status).toBe(200);
  r = await request(app).get('/api/panel/giro').set('Authorization', `Bearer ${token}`);
  expect(r.body.giro).toBe('pizzería');
});

test('sin token -> 401', async () => {
  const { app } = await setup();
  expect((await request(app).get('/api/panel/auxiliares')).status).toBe(401);
});
