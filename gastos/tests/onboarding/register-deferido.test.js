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
function app(db) { const a = express(); a.use(express.json()); a.use('/api/onboarding', createOnboardingRouter({ db })); return a; }

test('registro de negocio SIN nombre: crea la cuenta y pide los datos después (needsBusinessName + needs_setup)', async () => {
  const db = await freshDb(); const a = app(db);
  const r = await request(a).post('/api/onboarding/register').send({ email: 'dueno@x.cl', password: 'clave1234' }).expect(200);
  expect(r.body.token).toBeTruthy();
  expect(r.body.needsBusinessName).toBe(true);
  const c = await db.query('SELECT needs_setup, nombre FROM companies WHERE id=$1', [r.body.company.id]);
  expect(c.rows[0].needs_setup).toBe(true);
  expect(c.rows[0].nombre).toBe('Mi negocio'); // provisional, se completa después
});

test('registro de negocio CON nombre: entra directo, no pide datos después', async () => {
  const db = await freshDb(); const a = app(db);
  const r = await request(a).post('/api/onboarding/register').send({ nombre_negocio: 'Panadería Don José', email: 'd2@x.cl', password: 'clave1234' }).expect(200);
  expect(r.body.needsBusinessName).toBe(false);
  const c = await db.query('SELECT nombre FROM companies WHERE id=$1', [r.body.company.id]);
  expect(c.rows[0].nombre).toBe('Panadería Don José');
});

test('sigue exigiendo email y password', async () => {
  const db = await freshDb(); const a = app(db);
  await request(a).post('/api/onboarding/register').send({ email: 'x@x.cl' }).expect(400);
  await request(a).post('/api/onboarding/register').send({ email: 'x@x.cl', password: 'corta' }).expect(400);
});
