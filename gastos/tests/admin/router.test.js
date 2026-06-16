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
async function token(app) {
  const r = await request(app).post('/api/admin/login').send({ usuario: 'atiko', password: 'secreta' });
  return r.body.token;
}

test('login: clave mala 401, clave buena devuelve token', async () => {
  const { app } = await makeApp();
  await request(app).post('/api/admin/login').send({ usuario: 'atiko', password: 'mala' }).expect(401);
  const ok = await request(app).post('/api/admin/login').send({ usuario: 'atiko', password: 'secreta' });
  expect(ok.status).toBe(200);
  expect(ok.body.token).toBeTruthy();
});

test('GET /clientes exige token de admin', async () => {
  const { app } = await makeApp();
  await request(app).get('/api/admin/clientes').expect(401);
  const t = await token(app);
  const r = await request(app).get('/api/admin/clientes').set('Authorization', `Bearer ${t}`);
  expect(r.status).toBe(200);
  expect(Array.isArray(r.body)).toBe(true);
});

test('crear cliente aparece en la lista con su plan', async () => {
  const { app } = await makeApp();
  const t = await token(app);
  await request(app).post('/api/admin/clientes').set('Authorization', `Bearer ${t}`)
    .send({ nombreEmpresa: 'Pastelería Dulce', plan: 'pyme', usuario: 'dulce', password: 'Clave123' }).expect(201);
  const r = await request(app).get('/api/admin/clientes').set('Authorization', `Bearer ${t}`);
  expect(r.body).toHaveLength(1);
  expect(r.body[0]).toMatchObject({ nombre: 'Pastelería Dulce', plan: 'pyme', empleados: 1 });
});
