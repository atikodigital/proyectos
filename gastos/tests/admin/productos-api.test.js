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
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  const app = express(); app.use(express.json());
  app.use('/api/admin', createAdminRouter({ db }));
  const t = (await request(app).post('/api/admin/login').send({ usuario: 'atiko', password: 'secreta' })).body.token;
  return { app, t };
}

test('PATCH /clientes/:id/productos requiere admin y aplica cambios', async () => {
  const { app, t } = await makeApp();
  const c = await request(app).post('/api/admin/clientes').set('Authorization', `Bearer ${t}`).send({ nombreEmpresa: 'Pizza X' });
  const id = c.body.empresa.id;
  await request(app).patch(`/api/admin/clientes/${id}/productos`).send({ productos: ['hashia', 'crm'] }).expect(401);
  const r = await request(app).patch(`/api/admin/clientes/${id}/productos`).set('Authorization', `Bearer ${t}`)
    .send({ productos: ['hashia', 'crm'], canales: ['whatsapp'], burbuja_activa: true, burbuja_apps: ['rappi'] });
  expect(r.status).toBe(200);
  expect(r.body.productos.sort()).toEqual(['crm', 'hashia']);
});

test('GET /clientes/:id devuelve la ficha; 404 si no existe', async () => {
  const { app, t } = await makeApp();
  const c = await request(app).post('/api/admin/clientes').set('Authorization', `Bearer ${t}`).send({ nombreEmpresa: 'Pizza X' });
  await request(app).get(`/api/admin/clientes/${c.body.empresa.id}`).expect(401); // sin token de admin
  const ok = await request(app).get(`/api/admin/clientes/${c.body.empresa.id}`).set('Authorization', `Bearer ${t}`);
  expect(ok.status).toBe(200);
  expect(ok.body.empresa.nombre).toBe('Pizza X');
  const no = await request(app).get('/api/admin/clientes/00000000-0000-0000-0000-000000000000').set('Authorization', `Bearer ${t}`);
  expect(no.status).toBe(404);
});
