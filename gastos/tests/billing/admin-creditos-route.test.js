process.env.GASTOS_ADMIN_USER = 'atiko';
process.env.GASTOS_ADMIN_PASSWORD = 'secreta';

const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createAdminRouter } = require('../../src/admin/router');

async function makeApp() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  const app = express();
  app.use(express.json());
  app.use('/api/admin', createAdminRouter({ db }));
  return { app, db };
}

async function getToken(app) {
  const r = await request(app).post('/api/admin/login').send({ usuario: 'atiko', password: 'secreta' });
  return r.body.token;
}

test('PATCH /clientes/:id/creditos con plan ilimitado → creditos_limite 100000000', async () => {
  const { app } = await makeApp();
  const t = await getToken(app);
  // Crear un cliente primero
  const cr = await request(app)
    .post('/api/admin/clientes')
    .set('Authorization', `Bearer ${t}`)
    .send({ nombreEmpresa: 'Atiko Digital' });
  expect(cr.status).toBe(201);
  const id = cr.body.empresa.id;

  // Poner plan ilimitado
  const r = await request(app)
    .patch(`/api/admin/clientes/${id}/creditos`)
    .set('Authorization', `Bearer ${t}`)
    .send({ plan: 'ilimitado' });
  expect(r.status).toBe(200);
  expect(Number(r.body.creditos_limite)).toBe(100000000);
});

test('PATCH /clientes/:id/creditos con creditosLimite custom → limite exacto', async () => {
  const { app } = await makeApp();
  const t = await getToken(app);
  const cr = await request(app)
    .post('/api/admin/clientes')
    .set('Authorization', `Bearer ${t}`)
    .send({ nombreEmpresa: 'Cliente Especial' });
  const id = cr.body.empresa.id;

  const r = await request(app)
    .patch(`/api/admin/clientes/${id}/creditos`)
    .set('Authorization', `Bearer ${t}`)
    .send({ creditosLimite: 3500 });
  expect(r.status).toBe(200);
  expect(Number(r.body.creditos_limite)).toBe(3500);
  expect(r.body.plan).toBe('custom');
});

test('PATCH /clientes/:id/creditos requiere auth', async () => {
  const { app } = await makeApp();
  await request(app)
    .patch('/api/admin/clientes/00000000-0000-0000-0000-000000000000/creditos')
    .send({ plan: 'ilimitado' })
    .expect(401);
});
