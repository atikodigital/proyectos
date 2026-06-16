process.env.JWT_SECRET = 'test-secret';
const os = require('os');
const path = require('path');
process.env.UPLOADS_DIR = path.join(os.tmpdir(), 'hashia-catalog-test-' + Date.now());
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { hashPassword } = require('../../src/auth/password');
const { createAppRouter } = require('../../src/app/router');

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
async function seedEmployee(db) {
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const hash = await hashPassword('clave');
  await db.query("INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'Juan','juan',$2)",
    [c.rows[0].id, hash]);
}
function buildApp(db) {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use('/api/app', createAppRouter({ db }));
  return app;
}
async function token(app) {
  const r = await request(app).post('/api/app/login').send({ usuario: 'juan', password: 'clave' });
  return r.body.token;
}

test('CRUD de productos vía /api/app exige token y crea/lista', async () => {
  const db = await freshDb(); await seedEmployee(db);
  const app = buildApp(db);

  await request(app).get('/api/app/products').expect(401); // sin token

  const t = await token(app);
  const auth = (r) => r.set('Authorization', `Bearer ${t}`);

  await auth(request(app).post('/api/app/products').send({})).expect(400); // falta nombre

  const creado = await auth(request(app).post('/api/app/products')
    .send({ nombre: 'Torta', precio_base: 18000, extras: [{ nombre: 'Velas', precio: 1500 }] })).expect(201);
  expect(creado.body.nombre).toBe('Torta');

  const lista = await auth(request(app).get('/api/app/products')).expect(200);
  expect(lista.body).toHaveLength(1);

  await auth(request(app).patch(`/api/app/products/${creado.body.id}/activo`).send({ activo: false })).expect(200);
  const soloActivos = await auth(request(app).get('/api/app/products')).expect(200);
  expect(soloActivos.body).toHaveLength(0);

  await auth(request(app).get('/api/app/products/no-existe')).expect(404);
});

test('foto: POST guarda y GET la devuelve', async () => {
  const db = await freshDb(); await seedEmployee(db);
  const app = buildApp(db);
  const t = await token(app);
  const auth = (r) => r.set('Authorization', `Bearer ${t}`);
  const creado = await auth(request(app).post('/api/app/products').send({ nombre: 'Torta' })).expect(201);
  const png = Buffer.from('89504e47', 'hex').toString('base64');
  await auth(request(app).post(`/api/app/products/${creado.body.id}/foto`).send({ imageBase64: png, mimeType: 'image/png' })).expect(200);
  const foto = await auth(request(app).get(`/api/app/products/${creado.body.id}/foto`)).expect(200);
  expect(foto.headers['content-type']).toMatch(/image/);
});
