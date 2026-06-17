const request = require('supertest');
const express = require('express');
require('express-async-errors');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { signToken } = require('../../src/auth/jwt');
const { createExpense } = require('../../src/expenses/repo');
const lineasRepo = require('../../src/expenses/lineas-repo');
const { createAppRouter } = require('../../src/app/router');

const COMPANY = '11111111-1111-1111-1111-111111111111';
const EMP = '22222222-2222-2222-2222-222222222222';

async function makeApp() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await db.query("INSERT INTO companies (id, nombre) VALUES ($1, 'Test')", [COMPANY]);
  const exp = await createExpense(db, { company_id: COMPANY, employee_id: null, canal: 'app', tipo: 'gasto', total: 11900, neto: 10000, iva: 1900 });
  await lineasRepo.createLineas(db, exp.id, [{ descripcion: 'Harina 25kg', cantidad: 2, unidad: 'kg', neto: 10000, iva: 1900, total: 11900 }]);
  const app = express(); app.use(express.json());
  app.use('/api/app', createAppRouter({ db }));
  const token = signToken({ kind: 'employee', companyId: COMPANY, employeeId: EMP, rol: 'empleado' });
  return { app, token, expId: exp.id };
}

test('GET /api/app/expenses/:id/lineas devuelve las líneas (auth + tenant)', async () => {
  const { app, token, expId } = await makeApp();
  const r = await request(app).get(`/api/app/expenses/${expId}/lineas`).set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(200);
  expect(r.body.lineas.length).toBe(1);
  expect(r.body.lineas[0].descripcion).toBe('Harina 25kg');
});

test('sin token -> 401', async () => {
  const { app, expId } = await makeApp();
  const r = await request(app).get(`/api/app/expenses/${expId}/lineas`);
  expect(r.status).toBe(401);
});
