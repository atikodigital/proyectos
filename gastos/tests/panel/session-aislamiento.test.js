process.env.KALY_TOKEN_MODE = 'key';
process.env.GEMINI_API_KEY = 'fake-key';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createPanelRouter } = require('../../src/panel/router');
const { createUser } = require('../../src/users/repo');
const { hashPassword } = require('../../src/auth/password');
const memory = require('../../src/agent/memory');

async function setup(nombre, email) {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  const c = await db.query("INSERT INTO companies(nombre) VALUES($1) RETURNING id", [nombre]);
  await createUser(db, { company_id: c.rows[0].id, email, password_hash: await hashPassword('p'), rol: 'owner' });
  const app = express(); app.use(express.json());
  app.use('/api/panel', createPanelRouter({ db }));
  const t = (await request(app).post('/api/panel/login').send({ email, password: 'p' })).body.token;
  return { app, t, companyId: c.rows[0].id, db };
}

test('dos sesiones de cuentas distintas reciben contexto y memoria distintos', async () => {
  const A = await setup('Pizza A', 'a@a.cl');
  const B = await setup('Pizza B', 'b@b.cl');
  await memory.crearMemoria(A.db, A.companyId, { contenido: 'salsa secreta de A', tipo: 'negocio' });
  await memory.crearMemoria(B.db, B.companyId, { contenido: 'salsa secreta de B', tipo: 'negocio' });
  const ra = await request(A.app).post('/api/panel/agent/session').set('Authorization', `Bearer ${A.t}`);
  const rb = await request(B.app).post('/api/panel/agent/session').set('Authorization', `Bearer ${B.t}`);
  expect(ra.body.context.empresaNombre).toBe('Pizza A');
  expect(rb.body.context.empresaNombre).toBe('Pizza B');
  const memA = ra.body.context.memorias.map((m) => m.contenido);
  expect(memA).toContain('salsa secreta de A');
  expect(memA).not.toContain('salsa secreta de B');
});
