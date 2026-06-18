process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { hashPassword } = require('../../src/auth/password');
const { createAppRouter } = require('../../src/app/router');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}
async function seed(db) {
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const hash = await hashPassword('clave');
  await db.query("INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'J','juan',$2)", [c.rows[0].id, hash]);
}
function app(db) { const a = express(); a.use(express.json()); a.use('/api/app', createAppRouter({ db })); return a; }
async function token(a) { return (await request(a).post('/api/app/login').send({ usuario: 'juan', password: 'clave' })).body.token; }

test('POST crea, GET lista, DELETE borra (scoped + auth)', async () => {
  const db = await freshDb(); await seed(db); const a = app(db);
  const t = await token(a); const auth = (r) => r.set('Authorization', `Bearer ${t}`);

  await auth(request(a).post('/api/app/kaly/memoria').send({ tipo: 'negocio', contenido: 'Cierra domingos' })).expect(201);
  const lista = await auth(request(a).get('/api/app/kaly/memoria')).expect(200);
  expect(lista.body).toHaveLength(1);
  expect(lista.body[0].contenido).toBe('Cierra domingos');

  await auth(request(a).delete(`/api/app/kaly/memoria/${lista.body[0].id}`)).expect(200);
  expect((await auth(request(a).get('/api/app/kaly/memoria')).expect(200)).body).toHaveLength(0);
});

test('kaly/memoria exige token', async () => {
  const db = await freshDb(); await seed(db); const a = app(db);
  await request(a).get('/api/app/kaly/memoria').expect(401);
  await request(a).post('/api/app/kaly/memoria').send({ contenido: 'x' }).expect(401);
});
