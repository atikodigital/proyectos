const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createAppRouter } = require('../../src/app/router');
const { createEmployee } = require('../../src/companies/repo');
const { hashPassword } = require('../../src/auth/password');

async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const cid = c.rows[0].id;
  await createEmployee(db, { company_id: cid, nombre: 'E1', usuario: 'e1', password_hash: await hashPassword('p'), activo: true });
  await createEmployee(db, { company_id: cid, nombre: 'E2', usuario: 'e2', password_hash: await hashPassword('p'), activo: true });
  const app = express(); app.use(express.json());
  app.use('/api/app', createAppRouter({ db }));
  const t1 = (await request(app).post('/api/app/login').send({ usuario: 'e1', password: 'p' })).body.token;
  const t2 = (await request(app).post('/api/app/login').send({ usuario: 'e2', password: 'p' })).body.token;
  return { app, t1, t2 };
}

test('memoria app: personal separada por empleado, empresa compartida', async () => {
  const { app, t1, t2 } = await setup();
  await request(app).post('/api/app/kaly/memoria').set('Authorization', 'Bearer ' + t1).send({ contenido: 'mi nota', alcance: 'personal' }).expect(201);
  await request(app).post('/api/app/kaly/memoria').set('Authorization', 'Bearer ' + t1).send({ contenido: 'horario tienda', alcance: 'empresa' }).expect(201);
  const r1 = await request(app).get('/api/app/kaly/memoria').set('Authorization', 'Bearer ' + t1);
  expect(r1.body.empresa.map((m) => m.contenido)).toEqual(['horario tienda']);
  expect(r1.body.personal.map((m) => m.contenido)).toEqual(['mi nota']);
  const r2 = await request(app).get('/api/app/kaly/memoria').set('Authorization', 'Bearer ' + t2);
  expect(r2.body.personal).toEqual([]);
  expect(r2.body.empresa.map((m) => m.contenido)).toEqual(['horario tienda']);
});
