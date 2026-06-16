process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { hashPassword } = require('../../src/auth/password');
const { createAppRouter } = require('../../src/app/router');
const { createPanelRouter } = require('../../src/panel/router');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}

test('panel: GET/PATCH /pedido-config', async () => {
  const db = await freshDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const hash = await hashPassword('clave');
  await db.query("INSERT INTO users(company_id, email, password_hash, rol) VALUES($1,'d@x.cl',$2,'owner')", [c.rows[0].id, hash]);
  const app = express(); app.use(express.json()); app.use('/api/panel', createPanelRouter({ db }));
  const t = (await request(app).post('/api/panel/login').send({ email: 'd@x.cl', password: 'clave' })).body.token;
  const auth = (r) => r.set('Authorization', `Bearer ${t}`);
  const def = await auth(request(app).get('/api/panel/pedido-config')).expect(200);
  expect(def.body.pie).toBeNull();
  expect(def.body.iva_incluido).toBe(true);
  await auth(request(app).patch('/api/panel/pedido-config').send({ iva_incluido: false })).expect(200);
  const upd = await auth(request(app).get('/api/panel/pedido-config')).expect(200);
  expect(upd.body.iva_incluido).toBe(false);
});

test('app: GET /pedido-config para la vista previa', async () => {
  const db = await freshDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const hash = await hashPassword('clave');
  await db.query("INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'J','juan',$2)", [c.rows[0].id, hash]);
  const app = express(); app.use(express.json()); app.use('/api/app', createAppRouter({ db }));
  const t = (await request(app).post('/api/app/login').send({ usuario: 'juan', password: 'clave' })).body.token;
  const r = await request(app).get('/api/app/pedido-config').set('Authorization', `Bearer ${t}`).expect(200);
  expect(r.body.pie).toBeNull();
  expect(r.body.iva_incluido).toBe(true);
});
