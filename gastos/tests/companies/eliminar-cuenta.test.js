/**
 * Tests para DELETE /api/app/company — eliminación de cuenta self-service
 * (requisito Google Play). Solo el dueño (kind='user'); borra empresa + datos.
 */
process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createCompany } = require('../../src/companies/repo');
const { signToken } = require('../../src/auth/jwt');
const { createAppRouter } = require('../../src/app/router');

let uuidN = 0;
async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => `00000000-0000-0000-0000-${String(++uuidN).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}

function buildApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/app', createAppRouter({ db }));
  return app;
}

async function count(db, tabla, companyId) {
  const r = await db.query(`SELECT count(*)::int AS n FROM ${tabla} WHERE company_id=$1`, [companyId]);
  return r.rows[0].n;
}

test('dueño (kind=user) elimina su empresa y todos sus datos', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'BorrarCo' });
  // createCompany deja una subscription asociada
  expect(await count(db, 'subscriptions', co.id)).toBe(1);
  const tok = signToken({ kind: 'user', companyId: co.id, userId: 'owner-1' });

  const app = buildApp(db);
  const res = await request(app)
    .delete('/api/app/company')
    .set('Authorization', `Bearer ${tok}`);

  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  // Empresa y datos borrados
  const emp = await db.query('SELECT count(*)::int AS n FROM companies WHERE id=$1', [co.id]);
  expect(emp.rows[0].n).toBe(0);
  expect(await count(db, 'subscriptions', co.id)).toBe(0);
});

test('empleado (kind=employee) NO puede eliminar la empresa → 403', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'NoBorrarCo' });
  const tok = signToken({ kind: 'employee', companyId: co.id, employeeId: 'emp-1' });

  const app = buildApp(db);
  const res = await request(app)
    .delete('/api/app/company')
    .set('Authorization', `Bearer ${tok}`);

  expect(res.status).toBe(403);
  // La empresa sigue existiendo
  const emp = await db.query('SELECT count(*)::int AS n FROM companies WHERE id=$1', [co.id]);
  expect(emp.rows[0].n).toBe(1);
});

test('sin token → 401', async () => {
  const db = await freshDb();
  const app = buildApp(db);
  const res = await request(app).delete('/api/app/company');
  expect(res.status).toBe(401);
});
