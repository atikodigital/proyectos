// Test (a): extract clasifica cartola y libro_compra_venta
jest.mock('../src/ocr/preprocess', () => ({ preprocessForOcr: async (b) => b }));
jest.mock('../src/ocr/documentai', () => ({ documentAiExtract: async () => ({}) }));
jest.mock('../src/ocr/gemini', () => ({ geminiExtract: jest.fn() }));

const { geminiExtract } = require('../src/ocr/gemini');
const { extractExpense } = require('../src/ocr/extract');

// Test (b): intake con cartola
const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
const { intakeFromImage } = require('../src/expenses/intake');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
async function company(db) {
  const r = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  return r.rows[0].id;
}

// Test (c): app router
const express = require('express');
const request = require('supertest');
const { createAppRouter } = require('../src/app/router');
const { createEmployee } = require('../src/companies/repo');
const { hashPassword } = require('../src/auth/password');

async function setupApp() {
  const db = await makeDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const cid = c.rows[0].id;
  const emp = await createEmployee(db, { company_id: cid, nombre: 'Jose', usuario: 'jose', password_hash: await hashPassword('p'), activo: true });
  const extract = async () => ({
    tipo: 'cartola', raw_ocr: {},
  });
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/app', createAppRouter({ db, extractExpense: extract }));
  const login = await request(app).post('/api/app/login').send({ usuario: 'jose', password: 'p' });
  return { app, token: login.body.token, cid, db };
}

test('extract clasifica cartola y libro_compra_venta', async () => {
  geminiExtract.mockResolvedValue({ tipo: 'cartola' });
  expect((await extractExpense({ imageBuffer: Buffer.from('x') })).tipo).toBe('cartola');
  geminiExtract.mockResolvedValue({ tipo: 'libro_compra_venta' });
  expect((await extractExpense({ imageBuffer: Buffer.from('x') })).tipo).toBe('libro_compra_venta');
});

test('intake con cartola NO inserta y devuelve documento', async () => {
  const db = await makeDb();
  const cid = await company(db);
  const { expense, documento } = await intakeFromImage({
    db, companyId: cid, imageBuffer: Buffer.from('a'),
    extract: async () => ({ tipo: 'cartola', raw_ocr: {} }),
  });
  expect(expense).toBeNull();
  expect(documento).toBe('cartola');
  const n = await db.query('SELECT count(*)::int AS n FROM expenses');
  expect(n.rows[0].n).toBe(0);
});

test('POST /api/app/expenses con cartola responde 202 match pendiente', async () => {
  const { app, token } = await setupApp();
  const img = Buffer.from('foto').toString('base64');
  const res = await request(app)
    .post('/api/app/expenses')
    .set('Authorization', `Bearer ${token}`)
    .send({ imageBase64: img });
  expect(res.status).toBe(202);
  expect(res.body.documento).toBe('cartola');
  expect(res.body.match).toBe('pendiente');
});
