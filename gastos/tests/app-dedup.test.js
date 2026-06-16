const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
const { createAppRouter } = require('../src/app/router');
const { createEmployee } = require('../src/companies/repo');
const { hashPassword } = require('../src/auth/password');

async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const cid = c.rows[0].id;
  const emp = await createEmployee(db, { company_id: cid, nombre: 'Jose', usuario: 'jose', password_hash: await hashPassword('p'), activo: true });
  const extract = async () => ({
    tipo: 'gasto', tipo_documento: 'factura', rut_emisor: '76.1-1', folio: '1', nro_operacion: '',
    proveedor: 'Sodimac', fecha: '2026-06-01', neto: 10000, iva: 1900, total: 11900,
    moneda: 'CLP', categoria: 'Otros gastos', cuenta_sii_codigo: '5', cuenta_sii_nombre: 'G', glosa: '', confianza: 80, raw_ocr: {},
  });
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/app', createAppRouter({ db, extractExpense: extract }));
  const login = await request(app).post('/api/app/login').send({ usuario: 'jose', password: 'p' });
  return { app, token: login.body.token, cid, db };
}
const img = Buffer.from('foto').toString('base64');

test('segunda carga del mismo doc → 409 duplicado', async () => {
  const { app, token } = await setup();
  const auth = (r) => r.set('Authorization', `Bearer ${token}`);
  const first = await auth(request(app).post('/api/app/expenses').send({ imageBase64: img }));
  expect(first.status).toBe(201);
  const second = await auth(request(app).post('/api/app/expenses').send({ imageBase64: img }));
  expect(second.status).toBe(409);
  expect(second.body.duplicado.nivel).toBe('fuerte');
});

test('override:true permite registrar igual → 201', async () => {
  const { app, token } = await setup();
  const auth = (r) => r.set('Authorization', `Bearer ${token}`);
  await auth(request(app).post('/api/app/expenses').send({ imageBase64: img }));
  const forced = await auth(request(app).post('/api/app/expenses').send({ imageBase64: img, override: true }));
  expect(forced.status).toBe(201);
  expect(forced.body.dedup_override).toBe(true);
});
