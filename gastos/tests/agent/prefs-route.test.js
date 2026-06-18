process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { hashPassword } = require('../../src/auth/password');
const { createAppRouter } = require('../../src/app/router');

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
async function seed(db) {
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const hash = await hashPassword('clave');
  await db.query("INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'J','juan',$2)", [c.rows[0].id, hash]);
}
function app(db) { const a = express(); a.use(express.json()); a.use('/api/app', createAppRouter({ db })); return a; }
async function token(a) { return (await request(a).post('/api/app/login').send({ usuario: 'juan', password: 'clave' })).body.token; }

describe('GET /api/app/agent/prefs', () => {
  test('401 sin token', async () => {
    const db = await freshDb(); await seed(db);
    await request(app(db)).get('/api/app/agent/prefs').expect(401);
  });

  test('devuelve las prefs (incl. proactividad tras PATCH)', async () => {
    const db = await freshDb(); await seed(db); const a = app(db);
    const t = await token(a);
    await request(a).patch('/api/app/agent/prefs').set('Authorization', `Bearer ${t}`).send({ proactividad: false }).expect(200);
    const res = await request(a).get('/api/app/agent/prefs').set('Authorization', `Bearer ${t}`).expect(200);
    expect(res.body.proactividad).toBe(false);
  });
});
