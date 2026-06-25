process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createOnboardingRouter } = require('../../src/onboarding/router');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}
function app(db) {
  const a = express(); a.use(express.json());
  a.use('/api/onboarding', createOnboardingRouter({ db }));
  return a;
}

test('register-personal crea company personal + employee y devuelve token employee', async () => {
  const db = await freshDb();
  const a = app(db);
  const res = await request(a).post('/api/onboarding/register-personal').send({
    nombre: 'Juan Pérez', email: 'juan@gmail.com', password: 'clave123',
    sueldo_mensual: 800000, dia_pago: 5,
  });
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  expect(res.body.token).toBeTruthy();

  const { rows: [c] } = await db.query("SELECT tipo_cuenta, sueldo_mensual, dia_pago FROM companies WHERE nombre='Juan Pérez'");
  expect(c.tipo_cuenta).toBe('personal');
  expect(parseInt(c.sueldo_mensual)).toBe(800000);
  expect(parseInt(c.dia_pago)).toBe(5);

  const { verifyToken } = require('../../src/auth/jwt');
  const payload = verifyToken(res.body.token);
  expect(payload.kind).toBe('employee');
  expect(payload.companyId).toBeTruthy();
  expect(payload.employeeId).toBeTruthy();
});

test('register-personal rechaza email duplicado', async () => {
  const db = await freshDb();
  const a = app(db);
  await request(a).post('/api/onboarding/register-personal').send({
    nombre: 'Juan', email: 'juan@gmail.com', password: 'clave123', sueldo_mensual: 800000,
  });
  const res = await request(a).post('/api/onboarding/register-personal').send({
    nombre: 'Juan 2', email: 'juan@gmail.com', password: 'otra123', sueldo_mensual: 600000,
  });
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('email_en_uso');
});

test('register-personal valida campos requeridos', async () => {
  const db = await freshDb();
  const a = app(db);
  const r1 = await request(a).post('/api/onboarding/register-personal')
    .send({ email: 'x@x.com', password: 'abc123', sueldo_mensual: 800000 });
  expect(r1.status).toBe(400); expect(r1.body.error).toBe('campos_requeridos');

  const r2 = await request(a).post('/api/onboarding/register-personal')
    .send({ nombre: 'Juan', password: 'abc123', sueldo_mensual: 800000 });
  expect(r2.status).toBe(400); expect(r2.body.error).toBe('campos_requeridos');

  const r3 = await request(a).post('/api/onboarding/register-personal')
    .send({ nombre: 'Juan', email: 'j@j.com', password: 'ab', sueldo_mensual: 800000 });
  expect(r3.status).toBe(400); expect(r3.body.error).toBe('campos_requeridos');
});

test('register-personal valida sueldo_mensual > 0', async () => {
  const db = await freshDb();
  const a = app(db);
  const r = await request(a).post('/api/onboarding/register-personal').send({
    nombre: 'Juan', email: 'j@j.com', password: 'clave123', sueldo_mensual: 0,
  });
  expect(r.status).toBe(400);
  expect(r.body.error).toBe('sueldo_invalido');
});
