const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
const { createAppRouter } = require('../src/app/router');
const { createEmployee } = require('../src/companies/repo');
const { hashPassword } = require('../src/auth/password');
const { createUser } = require('../src/users/repo');
const { signToken } = require('../src/auth/jwt');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}

async function setup() {
  const db = await makeDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const cid = c.rows[0].id;
  const emp = await createEmployee(db, { company_id: cid, nombre: 'Jose', usuario: 'jose', password_hash: await hashPassword('p'), activo: true });
  const createLiveToken = jest.fn(async () => ({ token: 'auth_tokens/abc', expireAt: '2026-06-12T13:00:00Z' }));
  const app = express(); app.use(express.json());
  app.use('/api/app', createAppRouter({ db, createLiveToken }));
  const login = await request(app).post('/api/app/login').send({ usuario: 'jose', password: 'p' });
  return { app, db, cid, empId: emp.id, token: login.body.token, createLiveToken };
}

test('POST /agent/session devuelve token efímero + contexto', async () => {
  const { app, db, cid, token, createLiveToken } = await setup();
  // un movimiento confirmado para el resumen
  const { createExpense, confirmExpense } = require('../src/expenses/repo');
  // Fecha del MES ACTUAL: el resumen cuenta el mes en curso, así que un gasto con
  // fecha fija (ej. '2026-06-05') deja de contar cuando cambia el mes → test flaky.
  const g = await createExpense(db, { company_id: cid, tipo: 'gasto', categoria: 'Arriendos', fecha: new Date().toISOString().slice(0, 10), total: 30000 });
  await confirmExpense(db, g.id);
  const res = await request(app).post('/api/app/agent/session').set('Authorization', 'Bearer ' + token).send({});
  expect(res.status).toBe(200);
  expect(res.body.token).toBe('auth_tokens/abc');
  expect(createLiveToken).toHaveBeenCalled();
  expect(res.body.context.onboarded).toBe(false);
  expect(['dia', 'tarde', 'noche']).toContain(res.body.context.saludoHora);
  expect(res.body.context.resumen.gastos).toBe(30000);
  expect(res.body.context.empresaNombre).toBe('X');
});

test('POST /agent/session con prefs guardadas trae nombre/trato y onboarded true', async () => {
  const { app, token } = await setup();
  await request(app).patch('/api/app/agent/prefs').set('Authorization', 'Bearer ' + token).send({ nombre: 'José', trato: 'señor', onboarded: true });
  const res = await request(app).post('/api/app/agent/session').set('Authorization', 'Bearer ' + token).send({});
  expect(res.body.context.nombre).toBe('José');
  expect(res.body.context.onboarded).toBe(true);
});

test('503 si el emisor de tokens falla', async () => {
  const { app, token, createLiveToken } = await setup();
  createLiveToken.mockRejectedValueOnce(new Error('no soportado'));
  const res = await request(app).post('/api/app/agent/session').set('Authorization', 'Bearer ' + token).send({});
  expect(res.status).toBe(503);
  expect(res.body.error).toBe('live_no_disponible');
});

// El login social (Google/Facebook) crea una cuenta owner (kind='user', tabla
// `users`), no un empleado. El bug encontrado: la APK usaba SIEMPRE /api/app/agent/session,
// pero ese endpoint exigía requireKind('employee') → un owner recién registrado por
// Google/Facebook nunca podía iniciar sesión de voz con KALY en la APK.
test('POST /agent/session también funciona para un owner (login social), no solo empleados', async () => {
  const db = await makeDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('Owner Co') RETURNING id");
  const cid = c.rows[0].id;
  const user = await createUser(db, { company_id: cid, email: 'owner@x.cl', rol: 'owner', auth_provider: 'google', google_sub: 'g-1' });
  const ownerToken = signToken({ kind: 'user', companyId: cid, userId: user.id, rol: 'owner' });
  const createLiveToken = jest.fn(async () => ({ token: 'auth_tokens/owner', expireAt: '2026-06-12T13:00:00Z' }));
  const app = express(); app.use(express.json());
  app.use('/api/app', createAppRouter({ db, createLiveToken }));

  const res = await request(app).post('/api/app/agent/session').set('Authorization', 'Bearer ' + ownerToken).send({});
  expect(res.status).toBe(200);
  expect(res.body.token).toBe('auth_tokens/owner');
  expect(res.body.context.empresaNombre).toBe('Owner Co');
});
