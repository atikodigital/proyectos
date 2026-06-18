process.env.JWT_SECRET = 'test-secret';
process.env.GASTOS_ADMIN_USER = 'atiko';
process.env.GASTOS_ADMIN_PASSWORD = 'secreto';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createAdminRouter } = require('../../src/admin/router');
const { getCompanyProfile } = require('../../src/companies/repo');

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
function app(db) { const a = express(); a.use(express.json()); a.use('/api/admin', createAdminRouter({ db })); return a; }
async function adminToken(a) { return (await request(a).post('/api/admin/login').send({ usuario: 'atiko', password: 'secreto' })).body.token; }

test('admin setea kaly_persona y getCompanyProfile la devuelve', async () => {
  const db = await freshDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const id = c.rows[0].id;
  const a = app(db); const t = await adminToken(a);
  await request(a).patch(`/api/admin/clientes/${id}/kaly-persona`).set('Authorization', `Bearer ${t}`)
    .send({ nombre: 'Sofía', tono: 'cercano', instrucciones: 'Usa emojis con moderación' }).expect(200);
  const prof = await getCompanyProfile(db, id);
  expect(prof.kaly_persona).toEqual({ nombre: 'Sofía', tono: 'cercano', instrucciones: 'Usa emojis con moderación' });
});

test('kaly-persona exige admin', async () => {
  const db = await freshDb();
  const a = app(db);
  await request(a).patch('/api/admin/clientes/x/kaly-persona').send({ nombre: 'x' }).expect(401);
});
