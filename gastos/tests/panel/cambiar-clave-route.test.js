process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { hashPassword } = require('../../src/auth/password');
const { createPanelRouter } = require('../../src/panel/router');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const db = mem.adapters.createPg();
  const client = new db.Pool();
  await migrate(client).catch(() => {});
  return client;
}

async function seedUser(db) {
  const c = await db.query("INSERT INTO companies(nombre) VALUES('Test') RETURNING id");
  const hash = await hashPassword('claveVieja');
  await db.query("INSERT INTO users(company_id, email, password_hash, rol) VALUES($1,'d@d.cl',$2,'owner')", [c.rows[0].id, hash]);
}

function app(db) {
  const a = express();
  a.use(express.json());
  a.use('/api/panel', createPanelRouter({ db }));
  return a;
}
const login = (a, password) => request(a).post('/api/panel/login').send({ email: 'd@d.cl', password });

describe('POST /api/panel/cambiar-clave', () => {
  test('cambia la clave: vieja deja de servir, nueva funciona', async () => {
    const db = await freshDb(); await seedUser(db); const a = app(db);
    const tok = (await login(a, 'claveVieja')).body.token;
    await request(a).post('/api/panel/cambiar-clave').set('Authorization', `Bearer ${tok}`)
      .send({ actual: 'claveVieja', nueva: 'claveNueva123' }).expect(200);
    expect((await login(a, 'claveVieja')).status).toBe(401);
    expect((await login(a, 'claveNueva123')).status).toBe(200);
  });

  test('clave actual incorrecta → 401', async () => {
    const db = await freshDb(); await seedUser(db); const a = app(db);
    const tok = (await login(a, 'claveVieja')).body.token;
    const r = await request(a).post('/api/panel/cambiar-clave').set('Authorization', `Bearer ${tok}`)
      .send({ actual: 'mala', nueva: 'claveNueva123' }).expect(401);
    expect(r.body.error).toBe('clave_actual_incorrecta');
  });

  test('clave nueva corta → 400', async () => {
    const db = await freshDb(); await seedUser(db); const a = app(db);
    const tok = (await login(a, 'claveVieja')).body.token;
    await request(a).post('/api/panel/cambiar-clave').set('Authorization', `Bearer ${tok}`)
      .send({ actual: 'claveVieja', nueva: 'corta' }).expect(400);
  });

  test('sin token → 401', async () => {
    const db = await freshDb(); await seedUser(db); const a = app(db);
    await request(a).post('/api/panel/cambiar-clave').send({ actual: 'claveVieja', nueva: 'claveNueva123' }).expect(401);
  });
});
