const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createPanelRouter } = require('../../src/panel/router');
const { createUser } = require('../../src/users/repo');
const { hashPassword } = require('../../src/auth/password');

// Mock del OCR: intakeFromImage usa extractExpense, pero el endpoint del panel llama
// intakeFromImage real. Para no depender de Gemini, mockeamos el módulo OCR.
jest.mock('../../src/ocr/extract', () => ({
  extractExpense: jest.fn(async () => ({
    tipo: 'gasto', proveedor: 'Molino Don Pedro', rut_emisor: '76.123.456-7',
    folio: '1234', fecha: '2026-06-10', neto: 100000, iva: 19000, total: 119000, lineas: [],
  })),
}));

async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  const c = await db.query("INSERT INTO companies(nombre) VALUES('Pizza X') RETURNING id");
  await createUser(db, { company_id: c.rows[0].id, email: 'o@x.cl', password_hash: await hashPassword('p'), rol: 'owner' });
  const app = express(); app.use(express.json());
  app.use('/api/panel', createPanelRouter({ db }));
  const t = (await request(app).post('/api/panel/login').send({ email: 'o@x.cl', password: 'p' })).body.token;
  return { app, t };
}

test('POST /expenses/ocr: requiere auth y registra el gasto leído por OCR', async () => {
  const { app, t } = await setup();
  await request(app).post('/api/panel/expenses/ocr').send({ imageBase64: 'x' }).expect(401);

  const sinImg = await request(app).post('/api/panel/expenses/ocr').set('Authorization', `Bearer ${t}`).send({});
  expect(sinImg.status).toBe(400);

  const r = await request(app).post('/api/panel/expenses/ocr')
    .set('Authorization', `Bearer ${t}`)
    .send({ imageBase64: Buffer.from('fake-image').toString('base64'), mimeType: 'image/jpeg' });
  expect(r.status).toBe(201);
  expect(r.body.expense).toBeTruthy();
  expect(r.body.expense.proveedor).toBe('Molino Don Pedro');
  expect(r.body.expense.total).toBe(119000);
  expect(r.body.expense.tipo).toBe('gasto');
});
