process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { hashPassword } = require('../../src/auth/password');
const { createAppRouter } = require('../../src/app/router');
const { REGIONES_COMUNAS, comunaExiste, TODAS_LAS_COMUNAS } = require('../../src/pedidos/comunas-chile');

test('dataset: 16 regiones, >300 comunas, comunaExiste insensible a acento/mayúsculas', () => {
  expect(REGIONES_COMUNAS).toHaveLength(16);
  expect(TODAS_LAS_COMUNAS.length).toBeGreaterThan(300);
  expect(comunaExiste('Providencia')).toBe(true);
  expect(comunaExiste('providencia')).toBe(true);
  expect(comunaExiste('ÑUÑOA')).toBe(true);
  expect(comunaExiste('nunoa')).toBe(true);
  expect(comunaExiste('Comuna Inventada')).toBe(false);
});

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

test('GET /api/app/comunas devuelve el dataset (con token)', async () => {
  const db = await freshDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const hash = await hashPassword('clave');
  await db.query("INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'J','juan',$2)", [c.rows[0].id, hash]);
  const app = express(); app.use(express.json()); app.use('/api/app', createAppRouter({ db }));
  const t = (await request(app).post('/api/app/login').send({ usuario: 'juan', password: 'clave' })).body.token;
  const r = await request(app).get('/api/app/comunas').set('Authorization', `Bearer ${t}`).expect(200);
  expect(Array.isArray(r.body)).toBe(true);
  expect(r.body).toHaveLength(16);
  expect(r.body[0]).toHaveProperty('region');
  expect(Array.isArray(r.body[0].comunas)).toBe(true);
});
