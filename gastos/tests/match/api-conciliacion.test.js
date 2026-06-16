// gastos/tests/match/api-conciliacion.test.js
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
  await cuentas.sembrarCuentas(db, COMPANY);
  // cartola OCR fake: 1 cargo (comisión) sin match
  const extractCartola = async () => ({ lineas: [{ fecha: '2026-06-15', tipo: 'cargo', monto: 1900, glosa: 'COMISION', n_operacion: '' }], saldoInicial: 100000, saldoFinal: 98100 });
  // IA fake: sugiere asiento de comisión
  const componer = async () => ({ reconciliation_status: 'con_diferencias', matched_transactions: [], reconciling_items_in_transit: [], suggested_journal_entries: [{ descripcion: 'Comisión', tipo: 'nota_debito', monto: 1900, fecha: '2026-06-15', cuentaClaveDebe: 'gastos_financieros', cuentaClaveHaber: 'banco' }], exceptions_for_review: [] });
  const app = express();
  app.use(express.json());
  app.use('/api/app', createAppRouter({ db, extractCartola, componer }));
  const token = signToken({ kind: 'employee', companyId: COMPANY, employeeId: EMP, rol: 'empleado' });
  return { app, token };
}

test('POST /match/cartola devuelve informe con sca/sba/suggested', async () => {
  const { app, token } = await makeApp();
  const r = await request(app).post('/api/app/match/cartola').set('Authorization', `Bearer ${token}`).send({ imageBase64: 'x', mimeType: 'image/jpeg' });
  expect(r.status).toBe(200);
  expect(r.body.suggested.length).toBe(1);
  expect(typeof r.body.sca).toBe('number');
  expect(typeof r.body.sba).toBe('number');
  expect(r.body.suggested[0].id).toBeTruthy();
});

test('POST /match/asiento/confirmar contabiliza el asiento sugerido', async () => {
  const { app, token } = await makeApp();
  const r = await request(app).post('/api/app/match/asiento/confirmar').set('Authorization', `Bearer ${token}`)
    .send({ tipo: 'nota_debito', monto: 1900, fecha: '2026-06-15', descripcion: 'Comisión', cuentaClaveDebe: 'gastos_financieros', cuentaClaveHaber: 'banco' });
  expect(r.status).toBe(200);
  expect(r.body.ok).toBe(true);
  expect(r.body.asientoId).toBeTruthy();
});

test('confirmar asiento es idempotente (mismo id no duplica)', async () => {
  const { app, token } = await makeApp();
  const body = { id: 'sug1', tipo: 'nota_debito', monto: 1900, fecha: '2026-06-15', descripcion: 'Comisión', cuentaClaveDebe: 'gastos_financieros', cuentaClaveHaber: 'banco' };
  const r1 = await request(app).post('/api/app/match/asiento/confirmar').set('Authorization', `Bearer ${token}`).send(body);
  const r2 = await request(app).post('/api/app/match/asiento/confirmar').set('Authorization', `Bearer ${token}`).send(body);
  expect(r1.body.asientoId).toBe(r2.body.asientoId);
  expect(r2.body.yaExistia).toBe(true);
});

test('confirmar asiento con cuentas iguales -> 400', async () => {
  const { app, token } = await makeApp();
  const r = await request(app).post('/api/app/match/asiento/confirmar').set('Authorization', `Bearer ${token}`).send({ monto: 100, cuentaClaveDebe: 'banco', cuentaClaveHaber: 'banco' });
  expect(r.status).toBe(400);
});
