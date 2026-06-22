const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createPanelRouter } = require('../../src/panel/router');
const { createUser } = require('../../src/users/repo');
const { hashPassword } = require('../../src/auth/password');

async function setupCompany(nombre, email) {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  const c = await db.query("INSERT INTO companies(nombre) VALUES($1) RETURNING id", [nombre]);
  await createUser(db, { company_id: c.rows[0].id, email, password_hash: await hashPassword('p'), rol: 'owner' });
  const app = express(); app.use(express.json());
  app.use('/api/panel', createPanelRouter({ db }));
  const t = (await request(app).post('/api/panel/login').send({ email, password: 'p' })).body.token;
  return { app, t, db };
}

test('memoria personal: el dueño guarda personal y empresa; GET las separa', async () => {
  const { app, t } = await setupCompany('Pizza X', 'o@x.cl');
  await request(app).post('/api/panel/kaly/memoria').set('Authorization', `Bearer ${t}`)
    .send({ contenido: 'abro de lunes a sábado', alcance: 'empresa' }).expect(201);
  await request(app).post('/api/panel/kaly/memoria').set('Authorization', `Bearer ${t}`)
    .send({ contenido: 'me dicen don José', alcance: 'personal' }).expect(201);
  const r = await request(app).get('/api/panel/kaly/memoria').set('Authorization', `Bearer ${t}`);
  expect(r.body.empresa.map((m) => m.contenido)).toEqual(['abro de lunes a sábado']);
  expect(r.body.personal.map((m) => m.contenido)).toEqual(['me dicen don José']);
});

test('DELETE alcance=personal limpia solo lo personal del caller', async () => {
  const { app, t } = await setupCompany('Pizza Y', 'o@y.cl');
  await request(app).post('/api/panel/kaly/memoria').set('Authorization', `Bearer ${t}`).send({ contenido: 'p1', alcance: 'personal' });
  await request(app).post('/api/panel/kaly/memoria').set('Authorization', `Bearer ${t}`).send({ contenido: 'emp', alcance: 'empresa' });
  const del = await request(app).delete('/api/panel/kaly/memoria?alcance=personal').set('Authorization', `Bearer ${t}`);
  expect(del.status).toBe(200);
  const r = await request(app).get('/api/panel/kaly/memoria').set('Authorization', `Bearer ${t}`);
  expect(r.body.personal).toEqual([]);
  expect(r.body.empresa.map((m) => m.contenido)).toEqual(['emp']);
});
