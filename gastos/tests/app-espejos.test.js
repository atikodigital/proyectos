process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
const { createAppRouter } = require('../src/app/router');
const { createEmployee } = require('../src/companies/repo');
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
  const c = await db.query(
    "INSERT INTO companies(nombre, wa_phone_number_id, wa_token, owner_whatsapp) VALUES('X','PNID','TK','56993300435') RETURNING id"
  );
  const cid = c.rows[0].id;
  const emp = await createEmployee(db, { company_id: cid, nombre: 'Jose', usuario: 'jose', password_hash: await hashPassword('p'), activo: true });
  const sendText = jest.fn(async () => ({ messages: [{ id: 'wamid.1' }] }));
  const app = express(); app.use(express.json());
  app.use('/api/app', createAppRouter({ db, sendText }));
  const login = await request(app).post('/api/app/login').send({ usuario: 'jose', password: 'p' });
  return { app, db, cid, empId: emp.id, token: login.body.token, sendText };
}

test('PATCH /api/app/expenses/:id/pagar marca pagada (ownership empleado)', async () => {
  const { app, db, cid, token } = await setup();
  const { createExpense } = require('../src/expenses/repo');
  const e = await createExpense(db, { company_id: cid, tipo: 'gasto', total: 1000, estado: 'confirmado' });
  const res = await request(app).patch('/api/app/expenses/' + e.id + '/pagar').set('Authorization', 'Bearer ' + token);
  expect(res.status).toBe(200);
  expect(res.body.estado_pago).toBe('pagada');
});

test('POST /api/app/agent/resumen-whatsapp envía con las creds de la empresa', async () => {
  const { app, token, sendText } = await setup();
  const res = await request(app).post('/api/app/agent/resumen-whatsapp').set('Authorization', 'Bearer ' + token).send({});
  expect(res.status).toBe(200);
  expect(sendText).toHaveBeenCalled();
  expect(sendText.mock.calls[0][0].to).toBe('56993300435');
});

test('resumen-whatsapp 400 si la empresa no tiene WhatsApp', async () => {
  const db = await makeDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('Y') RETURNING id");
  const cid = c.rows[0].id;
  const emp = await createEmployee(db, { company_id: cid, nombre: 'Ana', usuario: 'ana', password_hash: await hashPassword('q'), activo: true });
  const sendText = jest.fn(async () => ({ messages: [{ id: 'wamid.2' }] }));
  const app = express(); app.use(express.json());
  app.use('/api/app', createAppRouter({ db, sendText }));
  const login = await request(app).post('/api/app/login').send({ usuario: 'ana', password: 'q' });
  const token = login.body.token;
  const res = await request(app).post('/api/app/agent/resumen-whatsapp').set('Authorization', 'Bearer ' + token).send({});
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('whatsapp_no_configurado');
});
