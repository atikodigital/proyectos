// gastos/tests/auxiliares/api-consumo.test.js
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
  await db.query("INSERT INTO employees (id, company_id, nombre) VALUES ($1,$2,'E')", [EMP, COMPANY]);
  const harina = await aux.createAuxiliar(db, COMPANY, { nombre: 'Harina', unidad_principal: 'kg' });
  const e1 = await createExpense(db, { company_id: COMPANY, tipo: 'gasto', total: 11900, fecha: '2026-06-10' });
  await lineas.createLineas(db, e1.id, [{ descripcion: 'Harina 25kg', cantidad: 25, unidad: 'kg', total: 11900, auxiliar_id: harina.id }]);
  const app = express(); app.use(express.json()); app.use('/api/app', createAppRouter({ db }));
  const token = signToken({ kind: 'employee', companyId: COMPANY, employeeId: EMP, rol: 'empleado' });
  return { app, token, auxId: harina.id };
}

test('GET /auxiliares/:id/consumo', async () => {
  const { app, token, auxId } = await setup();
  const r = await request(app).get(`/api/app/auxiliares/${auxId}/consumo?periodo=2026-06`).set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(200);
  expect(r.body.cantidadPorUnidad.kg).toBe(25);
});

test('GET /auxiliares/consumo?nombre= devuelve consumo + frase', async () => {
  const { app, token } = await setup();
  const r = await request(app).get('/api/app/auxiliares/consumo?nombre=harina').set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(200);
  expect(r.body.auxiliar.nombre).toBe('Harina');
  expect(r.body.frase).toMatch(/Harina/);
});

test('sin token -> 401', async () => {
  const { app, auxId } = await setup();
  expect((await request(app).get(`/api/app/auxiliares/${auxId}/consumo`)).status).toBe(401);
});
