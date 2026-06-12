const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
const { createAppRouter } = require('../src/app/router');
const { createPanelRouter } = require('../src/panel/router');
const { createExpense, getExpense } = require('../src/expenses/repo');
const { createEmployee } = require('../src/companies/repo');
const { createUser } = require('../src/users/repo');
const { hashPassword } = require('../src/auth/password');
const { listExpenses } = require('../src/expenses/query');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}

test('app: editar (PATCH) y anular un movimiento; la lista excluye anulados', async () => {
  const db = await makeDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const cid = c.rows[0].id;
  const emp = await createEmployee(db, { company_id: cid, nombre: 'Jose', usuario: 'jose', password_hash: await hashPassword('p'), activo: true });
  const exp = await createExpense(db, { company_id: cid, employee_id: emp.id, tipo: 'gasto', proveedor: 'Sodimac', total: 11900, estado: 'confirmado' });
  const app = express(); app.use(express.json());
  app.use('/api/app', createAppRouter({ db }));
  const login = await request(app).post('/api/app/login').send({ usuario: 'jose', password: 'p' });
  const auth = (r) => r.set('Authorization', 'Bearer ' + login.body.token);

  const edit = await auth(request(app).patch('/api/app/expenses/' + exp.id).send({ proveedor: 'Lider', total: 5000 }));
  expect(edit.status).toBe(200);
  expect(edit.body.proveedor).toBe('Lider');

  const anular = await auth(request(app).post('/api/app/expenses/' + exp.id + '/anular').send({}));
  expect(anular.status).toBe(200);
  expect(anular.body.estado).toBe('anulado');

  const list = await auth(request(app).get('/api/app/expenses'));
  expect(list.body.find((e) => e.id === exp.id)).toBeUndefined();
});

test('panel: editar, anular (tenant-scoped) y la query excluye anulados', async () => {
  const db = await makeDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const cid = c.rows[0].id;
  await createUser(db, { company_id: cid, email: 'o@x.cl', password_hash: await hashPassword('p'), rol: 'owner' });
  const exp = await createExpense(db, { company_id: cid, tipo: 'gasto', proveedor: 'Sodimac', total: 11900, estado: 'confirmado' });
  const app = express(); app.use(express.json());
  app.use('/api/panel', createPanelRouter({ db }));
  const login = await request(app).post('/api/panel/login').send({ email: 'o@x.cl', password: 'p' });
  const auth = (r) => r.set('Authorization', 'Bearer ' + login.body.token);

  const edit = await auth(request(app).patch('/api/panel/expenses/' + exp.id).send({ total: 7000 }));
  expect(edit.status).toBe(200);
  expect(Number(edit.body.total)).toBe(7000);

  // cross-tenant edit -> 404
  const c2 = await db.query("INSERT INTO companies(nombre) VALUES('Y') RETURNING id");
  const ajeno = await createExpense(db, { company_id: c2.rows[0].id, tipo: 'gasto', total: 1000, estado: 'confirmado' });
  const cross = await auth(request(app).post('/api/panel/expenses/' + ajeno.id + '/anular').send({}));
  expect(cross.status).toBe(404);

  const anular = await auth(request(app).post('/api/panel/expenses/' + exp.id + '/anular').send({}));
  expect(anular.body.estado).toBe('anulado');

  const rows = await listExpenses(db, cid, {});
  expect(rows.find((r) => r.id === exp.id)).toBeUndefined();
  const rowsAnulados = await listExpenses(db, cid, { estado: 'anulado' });
  expect(rowsAnulados.find((r) => r.id === exp.id)).toBeTruthy();
});
