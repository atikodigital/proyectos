// gastos/tests/auxiliares/app-lineas-patch.test.js
const request = require('supertest');
const express = require('express');
require('express-async-errors');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { signToken } = require('../../src/auth/jwt');
const { createExpense } = require('../../src/expenses/repo');
const lineas = require('../../src/expenses/lineas-repo');
const aux = require('../../src/auxiliares/repo');
const { createAppRouter } = require('../../src/app/router');

const COMPANY = '11111111-1111-1111-1111-111111111111';
const EMP = '22222222-2222-2222-2222-222222222222';

async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await db.query("INSERT INTO companies (id, nombre) VALUES ($1,'T')", [COMPANY]);
  await db.query(`INSERT INTO employees(id, company_id, nombre, usuario, password_hash, activo) VALUES('${EMP}', '${COMPANY}', 'Test', 'test', 'x', true) ON CONFLICT DO NOTHING`);
  const a = await aux.createAuxiliar(db, COMPANY, { nombre: 'Harina' });
  const exp = await createExpense(db, { company_id: COMPANY, employee_id: EMP, tipo: 'gasto', total: 1000 });
  await lineas.createLineas(db, exp.id, [{ descripcion: 'X', total: 1000 }]);
  const ls = await lineas.getLineas(db, exp.id);
  const app = express(); app.use(express.json()); app.use('/api/app', createAppRouter({ db }));
  const token = signToken({ kind: 'employee', companyId: COMPANY, employeeId: EMP, rol: 'empleado' });
  return { app, token, auxId: a.id, lineaId: ls[0].id };
}

test('GET /api/app/auxiliares lista', async () => {
  const { app, token } = await setup();
  const r = await request(app).get('/api/app/auxiliares').set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(200);
  expect(r.body.auxiliares.length).toBe(1);
});

test('PATCH /api/app/lineas/:id reasigna auxiliar (tenant ok)', async () => {
  const { app, token, auxId, lineaId } = await setup();
  const r = await request(app).patch(`/api/app/lineas/${lineaId}`).set('Authorization', `Bearer ${token}`).send({ auxiliar_id: auxId });
  expect(r.status).toBe(200);
  expect(r.body.linea.auxiliar_id).toBe(auxId);
});

test('PATCH /api/app/lineas/:id de otra empresa -> 404', async () => {
  const { app, lineaId } = await setup();
  const otro = signToken({ kind: 'employee', companyId: '99999999-9999-9999-9999-999999999999', employeeId: 'x', rol: 'empleado' });
  const r = await request(app).patch(`/api/app/lineas/${lineaId}`).set('Authorization', `Bearer ${otro}`).send({ auxiliar_id: null });
  expect(r.status).toBe(404);
});
