const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
const { createAppRouter } = require('../src/app/router');
const { createEmployee, getAgentPrefs } = require('../src/companies/repo');
const { hashPassword } = require('../src/auth/password');

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
  const cid = c.rows[0].id;
  const emp = await createEmployee(db, { company_id: cid, nombre: 'Jose', usuario: 'jose', password_hash: await hashPassword('p'), activo: true });
  const app = express(); app.use(express.json());
  app.use('/api/app', createAppRouter({ db }));
  const login = await request(app).post('/api/app/login').send({ usuario: 'jose', password: 'p' });
  return { app, db, cid, empId: emp.id, token: login.body.token };
}

test('PATCH /agent/prefs guarda nombre/trato/onboarded y se puede leer', async () => {
  const { app, db, empId, token } = await setup();
  const res = await request(app).patch('/api/app/agent/prefs').set('Authorization', 'Bearer ' + token)
    .send({ nombre: 'José', trato: 'señor', onboarded: true });
  expect(res.status).toBe(200);
  expect(res.body.agent_prefs.nombre).toBe('José');
  const prefs = await getAgentPrefs(db, empId);
  expect(prefs.trato).toBe('señor');
  expect(prefs.onboarded_at).toBeTruthy();
});

test('PATCH /agent/prefs es merge parcial (no borra lo previo)', async () => {
  const { app, db, empId, token } = await setup();
  await request(app).patch('/api/app/agent/prefs').set('Authorization', 'Bearer ' + token).send({ nombre: 'José' });
  await request(app).patch('/api/app/agent/prefs').set('Authorization', 'Bearer ' + token).send({ trato: 'señor' });
  const prefs = await getAgentPrefs(db, empId);
  expect(prefs.nombre).toBe('José');
  expect(prefs.trato).toBe('señor');
});
