process.env.KALY_TOKEN_MODE = 'key';
process.env.GEMINI_API_KEY = 'fake-key';

const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createPanelRouter } = require('../../src/panel/router');
const { createUser } = require('../../src/users/repo');
const { hashPassword } = require('../../src/auth/password');

async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  const c = await db.query("INSERT INTO companies(nombre) VALUES('Pizza X') RETURNING id");
  await createUser(db, { company_id: c.rows[0].id, email: 'o@x.cl', password_hash: await hashPassword('p'), rol: 'owner' });
  const app = express(); app.use(express.json());
  app.use('/api/panel', createPanelRouter({ db }));
  const t = (await request(app).post('/api/panel/login').send({ email: 'o@x.cl', password: 'p' })).body.token;
  return { app, t };
}

test('POST /agent/session: requiere user, devuelve token Gemini + contexto del dueño', async () => {
  const { app, t } = await setup();
  await request(app).post('/api/panel/agent/session').expect(401);
  const r = await request(app).post('/api/panel/agent/session').set('Authorization', `Bearer ${t}`);
  expect(r.status).toBe(200);
  expect(r.body.token).toBe('fake-key');
  expect(r.body.context).toBeTruthy();
  expect(r.body.context.empresaNombre).toBe('Pizza X');
  expect(r.body.context).toHaveProperty('resumen');
});
