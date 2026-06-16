const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createAppRouter } = require('../../src/app/router');
const { createEmployee } = require('../../src/companies/repo');
const { hashPassword } = require('../../src/auth/password');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
async function setup() {
  const db = await makeDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const emp = await createEmployee(db, { company_id: c.rows[0].id, nombre: 'Jose', usuario: 'jose', password_hash: await hashPassword('p'), activo: true });
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/app', createAppRouter({ db }));
  const login = await request(app).post('/api/app/login').send({ usuario: 'jose', password: 'p' });
  return { app, token: login.body.token, eid: emp.id, db };
}

test('ingest guarda y aparece en conversaciones y mensajes', async () => {
  const { app, token } = await setup();
  await request(app).post('/api/app/chat/ingest').set('Authorization', `Bearer ${token}`)
    .send({ channel: 'whatsapp', contact: 'Juan', text: 'quiero 2 panes' }).expect(201);

  const convs = await request(app).get('/api/app/chat/conversaciones').set('Authorization', `Bearer ${token}`);
  expect(convs.status).toBe(200);
  expect(convs.body).toHaveLength(1);
  expect(convs.body[0].ultimo).toBe('quiero 2 panes');

  const msgs = await request(app).get('/api/app/chat/conversacion')
    .query({ channel: 'whatsapp', contact: 'Juan' }).set('Authorization', `Bearer ${token}`);
  expect(msgs.body.map((m) => m.text)).toEqual(['quiero 2 panes']);
});

test('ingest sin texto responde 400', async () => {
  const { app, token } = await setup();
  await request(app).post('/api/app/chat/ingest').set('Authorization', `Bearer ${token}`)
    .send({ channel: 'whatsapp', contact: 'Juan' }).expect(400);
});
