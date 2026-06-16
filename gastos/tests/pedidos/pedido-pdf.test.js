process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { hashPassword } = require('../../src/auth/password');
const { createAppRouter } = require('../../src/app/router');
const pedidos = require('../../src/pedidos/repo');

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
  const companyId = c.rows[0].id;
  const hash = await hashPassword('clave');
  await db.query("INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'J','juan',$2)", [companyId, hash]);
  const ped = await pedidos.createPedido(db, companyId, { items: [{ descripcion: 'Torta', cantidad: 1, precio_unitario: 18000 }], impuesto_pct: 0, entrega: 'retiro' });
  return { companyId, pedidoId: ped.id };
}
function buildApp(db) { const app = express(); app.use(express.json()); app.use('/api/app', createAppRouter({ db })); return app; }
async function token(app) { return (await request(app).post('/api/app/login').send({ usuario: 'juan', password: 'clave' })).body.token; }

test('GET /pedido/:id/pdf → 200 application/pdf; 404 inexistente; 401 sin token', async () => {
  const db = await freshDb(); const { pedidoId } = await seed(db);
  const app = buildApp(db); const t = await token(app);
  const r = await request(app).get('/api/app/pedido/' + pedidoId + '/pdf').set('Authorization', `Bearer ${t}`).expect(200);
  expect(r.headers['content-type']).toContain('application/pdf');
  await request(app).get('/api/app/pedido/00000000-0000-0000-0000-000000009999/pdf').set('Authorization', `Bearer ${t}`).expect(404);
  await request(app).get('/api/app/pedido/' + pedidoId + '/pdf').expect(401);
});

test('getPedido es tenant-scoped (otra empresa → null)', async () => {
  const db = await freshDb(); const { companyId, pedidoId } = await seed(db);
  expect(await pedidos.getPedido(db, companyId, pedidoId)).toBeTruthy();
  expect(await pedidos.getPedido(db, '99999999-9999-9999-9999-999999999999', pedidoId)).toBeNull();
});
