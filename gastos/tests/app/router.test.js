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
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const db = mem.adapters.createPg();
  const client = new db.Pool();
  await migrate(client).catch(() => {});
  return client;
}

async function seedEmployee(db) {
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const hash = await hashPassword('clave');
  const e = await db.query(
    "INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'Juan','juan',$2) RETURNING id",
    [c.rows[0].id, hash]
  );
  return { companyId: c.rows[0].id, employeeId: e.rows[0].id };
}

function buildApp(db, deps) {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use('/api/app', createAppRouter({ db, ...deps }));
  return app;
}

async function loginToken(app) {
  const res = await request(app).post('/api/app/login').send({ usuario: 'juan', password: 'clave' });
  return res.body.token;
}

test('login correcto devuelve token; incorrecto 401', async () => {
  const db = await freshDb(); await seedEmployee(db);
  const app = buildApp(db, {});
  const ok = await request(app).post('/api/app/login').send({ usuario: 'juan', password: 'clave' });
  expect(ok.status).toBe(200);
  expect(ok.body.token).toBeTruthy();
  const bad = await request(app).post('/api/app/login').send({ usuario: 'juan', password: 'x' });
  expect(bad.status).toBe(401);
});

test('crear gasto con imagen (auth) corre el motor y guarda canal app', async () => {
  const db = await freshDb(); await seedEmployee(db);
  const extractExpense = jest.fn().mockResolvedValue({ proveedor: 'Copec', total: 25000, categoria: 'Otros gastos', cuenta_sii_codigo: '4.3.150.1', cuenta_sii_nombre: 'X' });
  const app = buildApp(db, { extractExpense });
  const token = await loginToken(app);
  const res = await request(app).post('/api/app/expenses')
    .set('Authorization', `Bearer ${token}`)
    .send({ imageBase64: Buffer.from('img').toString('base64'), mimeType: 'image/jpeg' });
  expect(res.status).toBe(201);
  expect(res.body.canal).toBe('app');
  expect(res.body.estado).toBe('pendiente_confirmacion');
  expect(extractExpense).toHaveBeenCalled();
});

test('sin token => 401', async () => {
  const db = await freshDb(); await seedEmployee(db);
  const app = buildApp(db, {});
  const res = await request(app).post('/api/app/expenses').send({ imageBase64: 'x' });
  expect(res.status).toBe(401);
});

test('confirmar y listar mis gastos', async () => {
  const db = await freshDb(); await seedEmployee(db);
  const extractExpense = jest.fn().mockResolvedValue({ total: 1000, categoria: 'Otros gastos', cuenta_sii_codigo: '4.3.150.1', cuenta_sii_nombre: 'X' });
  const app = buildApp(db, { extractExpense });
  const token = await loginToken(app);
  const created = await request(app).post('/api/app/expenses').set('Authorization', `Bearer ${token}`).send({ imageBase64: 'x' });
  const id = created.body.id;
  const conf = await request(app).post(`/api/app/expenses/${id}/confirm`).set('Authorization', `Bearer ${token}`);
  expect(conf.status).toBe(200);
  expect(conf.body.estado).toBe('confirmado');
  const list = await request(app).get('/api/app/expenses').set('Authorization', `Bearer ${token}`);
  expect(list.status).toBe(200);
  expect(list.body.length).toBe(1);
});
