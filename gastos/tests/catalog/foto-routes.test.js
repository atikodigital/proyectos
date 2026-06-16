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
function buildApp(db, deps) {
  const app = express(); app.use(express.json({ limit: '15mb' }));
  app.use('/api/app', createAppRouter({ db, ...deps }));
  return app;
}
async function token(app) { return (await request(app).post('/api/app/login').send({ usuario: 'juan', password: 'clave' })).body.token; }

test('/catalog/extraer usa el extractor inyectado (no crea) + /products/bulk crea', async () => {
  const db = await freshDb(); await seed(db);
  const extraerProductos = jest.fn(async () => ({ productos: [{ nombre: 'A', precio: 1000 }, { nombre: 'B', precio: 2000 }] }));
  const app = buildApp(db, { extraerProductos });
  const t = await token(app); const auth = (r) => r.set('Authorization', `Bearer ${t}`);

  await auth(request(app).post('/api/app/catalog/extraer').send({})).expect(400);
  const ex = await auth(request(app).post('/api/app/catalog/extraer').send({ imageBase64: 'xx' })).expect(200);
  expect(ex.body.productos).toHaveLength(2);
  expect(extraerProductos).toHaveBeenCalled();
  expect((await auth(request(app).get('/api/app/products')).expect(200)).body).toHaveLength(0);

  await auth(request(app).post('/api/app/products/bulk').send({ productos: [] })).expect(400);
  const bulk = await auth(request(app).post('/api/app/products/bulk').send({ productos: [{ nombre: 'A', precio: 1000 }] })).expect(201);
  expect(bulk.body.creados).toBe(1);
  expect((await auth(request(app).get('/api/app/products')).expect(200)).body).toHaveLength(1);
});

test('catalog/extraer y products/bulk exigen token', async () => {
  const db = await freshDb(); await seed(db);
  const app = buildApp(db, {});
  await request(app).post('/api/app/catalog/extraer').send({ imageBase64: 'x' }).expect(401);
  await request(app).post('/api/app/products/bulk').send({ productos: [{ nombre: 'A' }] }).expect(401);
});
