const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
const { createPanelRouter } = require('../src/panel/router');
const { createExpense } = require('../src/expenses/repo');
const { createUser } = require('../src/users/repo');
const { hashPassword } = require('../src/auth/password');

async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const cid = c.rows[0].id;
  await createUser(db, { company_id: cid, email: 'o@x.cl', password_hash: await hashPassword('p'), rol: 'owner' });
  const exp = await createExpense(db, { company_id: cid, tipo: 'gasto', proveedor: 'Sodimac', total: 11900, estado: 'confirmado' });
  const app = express();
  app.use(express.json());
  app.use('/api/panel', createPanelRouter({ db }));
  const login = await request(app).post('/api/panel/login').send({ email: 'o@x.cl', password: 'p' });
  return { app, db, cid, expId: exp.id, token: login.body.token, otherCompany: async () => {
    const r = await db.query("INSERT INTO companies(nombre) VALUES('Y') RETURNING id"); return r.rows[0].id;
  } };
}

test('PATCH /expenses/:id/pagar marca estado_pago=pagada', async () => {
  const { app, token, expId } = await setup();
  const res = await request(app).patch('/api/panel/expenses/' + expId + '/pagar').set('Authorization', 'Bearer ' + token);
  expect(res.status).toBe(200);
  expect(res.body.estado_pago).toBe('pagada');
});

test('no puede pagar un gasto de otra empresa → 404', async () => {
  const { app, token, db, otherCompany } = await setup();
  const cid2 = await otherCompany();
  const ajeno = await createExpense(db, { company_id: cid2, tipo: 'gasto', total: 1000 });
  const res = await request(app).patch('/api/panel/expenses/' + ajeno.id + '/pagar').set('Authorization', 'Bearer ' + token);
  expect(res.status).toBe(404);
});
