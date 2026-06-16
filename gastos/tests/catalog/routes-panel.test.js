process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { hashPassword } = require('../../src/auth/password');
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
async function seedUser(db) {
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const hash = await hashPassword('clave');
  await db.query("INSERT INTO users(company_id, email, password_hash, rol) VALUES($1,'due@x.cl',$2,'owner')",
    [c.rows[0].id, hash]);
}
function buildApp(db) {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use('/api/panel', createPanelRouter({ db }));
  return app;
}

test('CRUD de productos vía /api/panel con token de dueño', async () => {
  const db = await freshDb(); await seedUser(db);
  const app = buildApp(db);
  await request(app).get('/api/panel/products').expect(401);
  const r = await request(app).post('/api/panel/login').send({ email: 'due@x.cl', password: 'clave' });
  const t = r.body.token;
  const auth = (rq) => rq.set('Authorization', `Bearer ${t}`);
  const creado = await auth(request(app).post('/api/panel/products').send({ nombre: 'Corte', tipo: 'servicio' })).expect(201);
  expect(creado.body.tipo).toBe('servicio');
  expect(creado.body.stock).toBeNull();
  const lista = await auth(request(app).get('/api/panel/products')).expect(200);
  expect(lista.body).toHaveLength(1);
});
