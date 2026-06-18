// gastos/tests/varas/tool-endpoint.test.js
// F4b Task 1: POST /varas/tool (lectura server-side para la voz) en app y panel.
const request = require('supertest');
const express = require('express');
require('express-async-errors');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { signToken } = require('../../src/auth/jwt');
const cuentas = require('../../src/contabilidad/cuentas');
const { contabilizarMovimiento } = require('../../src/contabilidad/contabilizar');
const { createAppRouter } = require('../../src/app/router');
const { createPanelRouter } = require('../../src/panel/router');

const COMPANY = '11111111-1111-1111-1111-111111111111';
const COMPANY2 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EMP = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';

async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await db.query("INSERT INTO companies (id, nombre) VALUES ($1,'T'),($2,'T2')", [COMPANY, COMPANY2]);
  await cuentas.sembrarCuentas(db, COMPANY);
  await cuentas.sembrarCuentas(db, COMPANY2);
  // Solo COMPANY tiene un movimiento contabilizado.
  await contabilizarMovimiento(db, COMPANY, { id: 'e1', tipo: 'gasto', neto: 10000, iva: 1900, total: 11900, fecha: '2026-06-10', cuenta_sii_codigo: '4.3.10.1', proveedor: 'Sodimac' }, 'devengo');

  const app = express();
  app.use(express.json());
  app.use('/api/app', createAppRouter({ db }));
  app.use('/api/panel', createPanelRouter({ db }));
  const tokenEmp = signToken({ kind: 'employee', companyId: COMPANY, employeeId: EMP, rol: 'empleado' });
  const tokenUser = signToken({ kind: 'user', companyId: COMPANY, userId: USER, rol: 'owner' });
  const tokenEmp2 = signToken({ kind: 'employee', companyId: COMPANY2, employeeId: EMP, rol: 'empleado' });
  return { app, tokenEmp, tokenUser, tokenEmp2 };
}

describe('POST /varas/tool (app)', () => {
  test('tool de lectura válida (balance) devuelve { data }', async () => {
    const { app, tokenEmp } = await setup();
    const r = await request(app).post('/api/app/varas/tool').set('Authorization', `Bearer ${tokenEmp}`)
      .send({ name: 'balance', args: {} });
    expect(r.status).toBe(200);
    expect(r.body.data).toBeDefined();
    expect(r.body.data).toHaveProperty('cuadrado');
  });

  test('nombre no permitido (marcar_pagado) -> 400 tool_no_permitida', async () => {
    const { app, tokenEmp } = await setup();
    const r = await request(app).post('/api/app/varas/tool').set('Authorization', `Bearer ${tokenEmp}`)
      .send({ name: 'marcar_pagado', args: { descripcion: 'x' } });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('tool_no_permitida');
  });

  test('multi-tenant: otra empresa no ve los datos de la primera', async () => {
    const { app, tokenEmp, tokenEmp2 } = await setup();
    const r1 = await request(app).post('/api/app/varas/tool').set('Authorization', `Bearer ${tokenEmp}`)
      .send({ name: 'balance', args: {} });
    const r2 = await request(app).post('/api/app/varas/tool').set('Authorization', `Bearer ${tokenEmp2}`)
      .send({ name: 'balance', args: {} });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    // COMPANY tiene un movimiento; COMPANY2 no -> totales distintos.
    expect(Number(r1.body.data.totalDebe)).toBeGreaterThan(0);
    expect(Number(r2.body.data.totalDebe)).toBe(0);
  });

  test('sin token -> 401', async () => {
    const { app } = await setup();
    const r = await request(app).post('/api/app/varas/tool').send({ name: 'balance', args: {} });
    expect(r.status).toBe(401);
  });
});

describe('POST /varas/tool (panel)', () => {
  test('tool de lectura válida (balance) devuelve { data } (token user)', async () => {
    const { app, tokenUser } = await setup();
    const r = await request(app).post('/api/panel/varas/tool').set('Authorization', `Bearer ${tokenUser}`)
      .send({ name: 'balance', args: {} });
    expect(r.status).toBe(200);
    expect(r.body.data).toBeDefined();
    expect(r.body.data).toHaveProperty('cuadrado');
  });

  test('nombre no permitido -> 400 tool_no_permitida', async () => {
    const { app, tokenUser } = await setup();
    const r = await request(app).post('/api/panel/varas/tool').set('Authorization', `Bearer ${tokenUser}`)
      .send({ name: 'enviar_resumen_whatsapp', args: {} });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('tool_no_permitida');
  });
});
