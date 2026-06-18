// gastos/tests/varas/api.test.js
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

async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await db.query("INSERT INTO companies (id, nombre) VALUES ($1,'T')", [COMPANY]);
  await cuentas.sembrarCuentas(db, COMPANY);
  // Gemini fake: 1ª vez pide tool balance, 2ª responde texto.
  let n = 0;
  const varasGemini = async () => { n++; return n === 1 ? { tool: { name: 'balance', args: {} } } : { text: 'Tu balance cuadra.' }; };
  const app = express(); app.use(express.json());
  app.use('/api/app', createAppRouter({ db, varasGemini }));
  const token = signToken({ kind: 'employee', companyId: COMPANY, employeeId: EMP, rol: 'empleado' });
  return { app, token };
}

test('POST /varas/chat responde texto usando una tool', async () => {
  const { app, token } = await setup();
  const r = await request(app).post('/api/app/varas/chat').set('Authorization', `Bearer ${token}`).send({ messages: [{ role: 'user', text: '¿mi balance cuadra?' }] });
  expect(r.status).toBe(200);
  expect(r.body.reply).toMatch(/cuadra/i);
});

test('POST /varas/accion ejecuta una acción', async () => {
  const { app, token } = await setup();
  const cs = (await request(app).get('/api/app/cuentas').set('Authorization', `Bearer ${token}`)).body.cuentas;
  const r = await request(app).post('/api/app/varas/accion').set('Authorization', `Bearer ${token}`)
    .send({ tipo: 'crear_asiento_manual', args: { glosa: 'Ajuste', lineas: [{ cuenta_id: cs[0].id, debe: 1000, haber: 0 }, { cuenta_id: cs[1].id, debe: 0, haber: 1000 }] } });
  expect(r.status).toBe(200);
  expect(r.body.ok).toBe(true);
});

test('sin token -> 401', async () => {
  const { app } = await setup();
  expect((await request(app).post('/api/app/varas/chat').send({ messages: [] })).status).toBe(401);
});
