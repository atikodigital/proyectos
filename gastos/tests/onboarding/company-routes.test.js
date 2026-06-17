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

test('GET /company devuelve perfil; PATCH actualiza nombre/giro/owner_whatsapp y marca onboarded', async () => {
  const db = await freshDb(); await seed(db); const a = app(db);
  const t = await token(a); const auth = (r) => r.set('Authorization', `Bearer ${t}`);

  const g0 = await auth(request(a).get('/api/app/company')).expect(200);
  expect(g0.body).toHaveProperty('nombre');
  expect(g0.body.onboarded_at == null).toBe(true);

  await auth(request(a).patch('/api/app/company').send({ nombre: 'Mi Pyme', giro: 'Pastelería', owner_whatsapp: '56999999999' })).expect(200);
  const g1 = await auth(request(a).get('/api/app/company')).expect(200);
  expect(g1.body.nombre).toBe('Mi Pyme');
  expect(g1.body.giro).toBe('Pastelería');
  expect(g1.body.owner_whatsapp).toBe('56999999999');

  await auth(request(a).patch('/api/app/company').send({ onboarded: true })).expect(200);
  const g2 = await auth(request(a).get('/api/app/company')).expect(200);
  expect(g2.body.onboarded_at).toBeTruthy();
});

test('GET/PATCH /company exigen token', async () => {
  const db = await freshDb(); await seed(db); const a = app(db);
  await request(a).get('/api/app/company').expect(401);
  await request(a).patch('/api/app/company').send({ nombre: 'x' }).expect(401);
});
