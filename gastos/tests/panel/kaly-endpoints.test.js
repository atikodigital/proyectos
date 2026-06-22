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

test('GET/PATCH /agent/prefs: guarda y lee nombre/trato/onboarding del dueño (nivel empresa)', async () => {
  const { app, t } = await setup();
  await request(app).get('/api/panel/agent/prefs').expect(401);

  const vacio = await request(app).get('/api/panel/agent/prefs').set('Authorization', `Bearer ${t}`);
  expect(vacio.status).toBe(200);
  expect(vacio.body).toEqual({});

  const patch = await request(app).patch('/api/panel/agent/prefs')
    .set('Authorization', `Bearer ${t}`).send({ nombre: 'José', trato: 'señor', onboarded: true });
  expect(patch.status).toBe(200);
  expect(patch.body.agent_prefs.nombre).toBe('José');
  expect(patch.body.agent_prefs.trato).toBe('señor');
  expect(patch.body.agent_prefs.onboarded_at).toBeTruthy();

  const leido = await request(app).get('/api/panel/agent/prefs').set('Authorization', `Bearer ${t}`);
  expect(leido.body.nombre).toBe('José');
});

test('PATCH /agent/prefs es merge parcial (no borra lo previo)', async () => {
  const { app, t } = await setup();
  await request(app).patch('/api/panel/agent/prefs').set('Authorization', `Bearer ${t}`).send({ nombre: 'José' });
  await request(app).patch('/api/panel/agent/prefs').set('Authorization', `Bearer ${t}`).send({ trato: 'señor' });
  const leido = await request(app).get('/api/panel/agent/prefs').set('Authorization', `Bearer ${t}`);
  expect(leido.body.nombre).toBe('José');
  expect(leido.body.trato).toBe('señor');
});

test('POST/GET /kaly/memoria: el dueño guarda y lista hechos del negocio', async () => {
  const { app, t } = await setup();
  await request(app).post('/api/panel/kaly/memoria').send({ contenido: 'x' }).expect(401);

  const vacio = await request(app).post('/api/panel/kaly/memoria').set('Authorization', `Bearer ${t}`).send({ contenido: '   ' });
  expect(vacio.status).toBe(400);

  const crea = await request(app).post('/api/panel/kaly/memoria')
    .set('Authorization', `Bearer ${t}`).send({ contenido: 'Abrimos de lunes a sábado', tipo: 'negocio' });
  expect(crea.status).toBe(201);
  expect(crea.body.memoria.contenido).toBe('Abrimos de lunes a sábado');

  const lista = await request(app).get('/api/panel/kaly/memoria').set('Authorization', `Bearer ${t}`);
  expect(lista.body.empresa.length).toBe(1);
  expect(lista.body.empresa[0].contenido).toBe('Abrimos de lunes a sábado');
});

test('/agent/session expone nombre/trato del dueño guardados en prefs', async () => {
  process.env.KALY_TOKEN_MODE = 'key';
  process.env.GEMINI_API_KEY = 'fake-key';
  const { app, t } = await setup();
  await request(app).patch('/api/panel/agent/prefs').set('Authorization', `Bearer ${t}`).send({ nombre: 'José', trato: 'señor', onboarded: true });
  const r = await request(app).post('/api/panel/agent/session').set('Authorization', `Bearer ${t}`);
  expect(r.status).toBe(200);
  expect(r.body.context.nombre).toBe('José');
  expect(r.body.context.trato).toBe('señor');
  expect(r.body.context.onboarded).toBe(true);
});
