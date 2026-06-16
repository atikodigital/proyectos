// gastos/tests/match/api-sii.test.js
const request = require('supertest');
const express = require('express');
require('express-async-errors');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { signToken } = require('../../src/auth/jwt');
const cuentas = require('../../src/contabilidad/cuentas');
const { createAppRouter } = require('../../src/app/router');

const COMPANY = '11111111-1111-1111-1111-111111111111';
const EMP = '22222222-2222-2222-2222-222222222222';

async function makeApp() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  // Seed company and employee rows (needed for FK on expenses)
  await db.query(`INSERT INTO companies(id, nombre) VALUES('${COMPANY}', 'Test Co') ON CONFLICT DO NOTHING`);
  await db.query(`INSERT INTO employees(id, company_id, nombre, usuario, password_hash, activo) VALUES('${EMP}', '${COMPANY}', 'Test', 'test', 'x', true) ON CONFLICT DO NOTHING`);
  await cuentas.sembrarCuentas(db, COMPANY);
  const extractLibroSii = async () => ([
    { clase: 'compra', tipo_doc: 'factura', rut: '76.111.111-1', folio: '1234', fecha: '2026-06-05', neto: 10000, iva: 1900, total: 11900 },
  ]);
  const app = express(); app.use(express.json());
  app.use('/api/app', createAppRouter({ db, extractLibroSii }));
  const token = signToken({ kind: 'employee', companyId: COMPANY, employeeId: EMP, rol: 'empleado' });
  return { app, token, db };
}

test('POST /match/libro-sii devuelve informe con faltantes e IVA', async () => {
  const { app, token } = await makeApp();
  const r = await request(app).post('/api/app/match/libro-sii').set('Authorization', `Bearer ${token}`).send({ imageBase64: 'x', mimeType: 'image/jpeg' });
  expect(r.status).toBe(200);
  expect(r.body.faltantes.length).toBe(1);
  expect(r.body.iva.creditoSii).toBe(1900);
});

test('POST /match/sii/crear-movimiento registra y contabiliza el faltante', async () => {
  const { app, token, db } = await makeApp();
  const r = await request(app).post('/api/app/match/sii/crear-movimiento').set('Authorization', `Bearer ${token}`)
    .send({ clase: 'compra', rut: '76.111.111-1', folio: '1234', fecha: '2026-06-05', neto: 10000, iva: 1900, total: 11900, tipo_doc: 'factura' });
  expect(r.status).toBe(200);
  expect(r.body.ok).toBe(true);
  expect(r.body.expenseId).toBeTruthy();
  const exp = await db.query('SELECT * FROM expenses WHERE id=$1', [r.body.expenseId]);
  expect(exp.rows[0].tipo).toBe('gasto');
  expect(Number(exp.rows[0].total)).toBe(11900);
});
