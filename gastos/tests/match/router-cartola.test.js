const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createAppRouter } = require('../../src/app/router');
const { createEmployee } = require('../../src/companies/repo');
const { createExpense, getExpense } = require('../../src/expenses/repo');
const { hashPassword } = require('../../src/auth/password');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}

async function setup(lineas) {
  const db = await makeDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const cid = c.rows[0].id;
  const emp = await createEmployee(db, { company_id: cid, nombre: 'Jose', usuario: 'jose', password_hash: await hashPassword('p'), activo: true });
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/app', createAppRouter({ db, extractCartola: async () => lineas }));
  const login = await request(app).post('/api/app/login').send({ usuario: 'jose', password: 'p' });
  return { app, token: login.body.token, cid, eid: emp.id, db };
}

test('POST /match/cartola devuelve informe (nuevo contrato: matched, sca, sba)', async () => {
  const lineas = [{ fecha: '2026-06-01', monto: 50000, tipo: 'cargo', n_operacion: '777' }];
  const { app, token, cid, eid, db } = await setup(lineas);
  await createExpense(db, { company_id: cid, employee_id: eid, tipo: 'gasto', total: 50000, fecha: '2026-06-01', nro_operacion: '777', estado_pago: 'pendiente' });
  const res = await request(app).post('/api/app/match/cartola').set('Authorization', `Bearer ${token}`).send({ imageBase64: 'x' });
  expect(res.status).toBe(200);
  // nuevo contrato: matched en lugar de conciliadas (la IA no está disponible → determinístico)
  expect(Array.isArray(res.body.matched)).toBe(true);
  expect(res.body.matched.length).toBeGreaterThanOrEqual(1);
  expect(typeof res.body.sca).toBe('number');
  expect(typeof res.body.sba).toBe('number');
});

test('POST /match/confirmar marca el gasto como conciliada', async () => {
  const { app, token, cid, eid, db } = await setup([]);
  const g = await createExpense(db, { company_id: cid, employee_id: eid, tipo: 'gasto', total: 50000, estado_pago: 'pendiente' });
  const res = await request(app).post('/api/app/match/confirmar').set('Authorization', `Bearer ${token}`).send({ ids: [g.id] });
  expect(res.status).toBe(200);
  expect(res.body.conciliadas).toBe(1);
  const after = await getExpense(db, g.id);
  expect(after.estado_pago).toBe('conciliada');
});

test('POST /match/confirmar no toca gastos de otra empresa', async () => {
  const { app, token, db } = await setup([]);
  const otra = await db.query("INSERT INTO companies(nombre) VALUES('Y') RETURNING id");
  const empY = await createEmployee(db, { company_id: otra.rows[0].id, nombre: 'Ana', usuario: 'ana', password_hash: await hashPassword('p'), activo: true });
  const g = await createExpense(db, { company_id: otra.rows[0].id, employee_id: empY.id, tipo: 'gasto', total: 999, estado_pago: 'pendiente' });
  const res = await request(app).post('/api/app/match/confirmar').set('Authorization', `Bearer ${token}`).send({ ids: [g.id] });
  expect(res.body.conciliadas).toBe(0);
  const after = await getExpense(db, g.id);
  expect(after.estado_pago).toBe('pendiente');
});
