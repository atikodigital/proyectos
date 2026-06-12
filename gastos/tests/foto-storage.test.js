const os = require('os');
const path = require('path');
const fs = require('fs');
// Punta a un dir temporal ANTES de requerir storage:
process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hashia-fotos-'));

const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
const { storeImage, readImage, deleteImage } = require('../src/expenses/storage');
const { intakeFromImage } = require('../src/expenses/intake');
const { createAppRouter } = require('../src/app/router');
const { createEmployee } = require('../src/companies/repo');
const { hashPassword } = require('../src/auth/password');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const fakeExtract = async () => ({ tipo: 'gasto', proveedor: 'Sodimac', fecha: '2026-06-01', total: 11900, neto: 10000, iva: 1900, categoria: 'Otros gastos', raw_ocr: {} });

test('storeImage/readImage/deleteImage roundtrip', () => {
  const name = storeImage(Buffer.from('IMG-BYTES'), 'image/jpeg', 'abc123');
  expect(name).toBe('abc123.jpg');
  expect(readImage(name).toString()).toBe('IMG-BYTES');
  deleteImage(name);
  expect(readImage(name)).toBeNull();
});

test('intake guarda la foto y setea foto_path', async () => {
  const db = await makeDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const { expense } = await intakeFromImage({ db, companyId: c.rows[0].id, imageBuffer: Buffer.from('FOTO'), mimeType: 'image/jpeg', extract: fakeExtract });
  expect(expense.foto_path).toMatch(/\.jpg$/);
  expect(readImage(expense.foto_path).toString()).toBe('FOTO');
});

test('GET /api/app/expenses/:id/foto sirve la imagen (y 404 si no hay)', async () => {
  const db = await makeDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const cid = c.rows[0].id;
  const emp = await createEmployee(db, { company_id: cid, nombre: 'Jose', usuario: 'jose', password_hash: await hashPassword('p'), activo: true });
  const app = express(); app.use(express.json({ limit: '10mb' }));
  app.use('/api/app', createAppRouter({ db, extractExpense: fakeExtract }));
  const login = await request(app).post('/api/app/login').send({ usuario: 'jose', password: 'p' });
  const tok = login.body.token;
  const created = await request(app).post('/api/app/expenses').set('Authorization', 'Bearer ' + tok).send({ imageBase64: Buffer.from('FOTOAPP').toString('base64') });
  const id = created.body.id;
  const foto = await request(app).get('/api/app/expenses/' + id + '/foto').set('Authorization', 'Bearer ' + tok);
  expect(foto.status).toBe(200);
  expect(foto.headers['content-type']).toMatch(/image/);
  expect(Buffer.from(foto.body).toString()).toBe('FOTOAPP');
});
