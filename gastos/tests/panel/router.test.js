process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const ExcelJS = require('exceljs');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { hashPassword } = require('../../src/auth/password');
const { createPanelRouter } = require('../../src/panel/router');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const db = mem.adapters.createPg();
  const client = new db.Pool();
  await migrate(client).catch(() => {});
  return client;
}

async function seedOwner(db) {
  const c = await db.query("INSERT INTO companies(nombre, owner_whatsapp) VALUES('X','56999') RETURNING id");
  const cid = c.rows[0].id;
  const hash = await hashPassword('clave');
  await db.query("INSERT INTO users(company_id, email, password_hash, rol) VALUES($1,'jefe@x.cl',$2,'owner')", [cid, hash]);
  await db.query("INSERT INTO expenses(company_id, fecha, proveedor, total, estado, categoria) VALUES($1,'2026-06-05','Copec',25000,'confirmado','Otros gastos')", [cid]);
  return cid;
}

function buildApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/panel', createPanelRouter({ db }));
  return app;
}
async function token(app) {
  const r = await request(app).post('/api/panel/login').send({ email: 'jefe@x.cl', password: 'clave' });
  return r.body.token;
}

test('login owner ok/mal', async () => {
  const db = await freshDb(); await seedOwner(db);
  const app = buildApp(db);
  expect((await request(app).post('/api/panel/login').send({ email: 'jefe@x.cl', password: 'clave' })).status).toBe(200);
  expect((await request(app).post('/api/panel/login').send({ email: 'jefe@x.cl', password: 'x' })).status).toBe(401);
});

test('lista gastos del tenant', async () => {
  const db = await freshDb(); await seedOwner(db);
  const app = buildApp(db); const t = await token(app);
  const res = await request(app).get('/api/panel/expenses').set('Authorization', `Bearer ${t}`);
  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(1);
  expect(res.body[0].proveedor).toBe('Copec');
});

test('descarga xlsx', async () => {
  const db = await freshDb(); await seedOwner(db);
  const app = buildApp(db); const t = await token(app);
  const res = await request(app).get('/api/panel/expenses.xlsx').set('Authorization', `Bearer ${t}`).buffer().parse((r, cb) => {
    const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toContain('spreadsheet');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(res.body);
  const ws0 = wb.worksheets[0];
  const colOf = {};
  ws0.getRow(1).eachCell((cell, col) => { colOf[cell.value] = col; });
  expect(ws0.getRow(2).getCell(colOf['Proveedor/Pagador']).value).toBe('Copec');
});

test('crea empleado y lo lista', async () => {
  const db = await freshDb(); await seedOwner(db);
  const app = buildApp(db); const t = await token(app);
  const cr = await request(app).post('/api/panel/employees').set('Authorization', `Bearer ${t}`)
    .send({ nombre: 'Ana', phone: '56911', usuario: 'ana', password: 'clave' });
  expect(cr.status).toBe(201);
  expect(cr.body.password_hash).toBeUndefined();
  const list = await request(app).get('/api/panel/employees').set('Authorization', `Bearer ${t}`);
  expect(list.body.length).toBe(1);
});

test('actualiza ajustes de empresa', async () => {
  const db = await freshDb(); await seedOwner(db);
  const app = buildApp(db); const t = await token(app);
  const res = await request(app).patch('/api/panel/company').set('Authorization', `Bearer ${t}`).send({ resumen_frecuencia: 'semanal' });
  expect(res.status).toBe(200);
  expect(res.body.resumen_frecuencia).toBe('semanal');
});

test('sin token 401', async () => {
  const db = await freshDb(); await seedOwner(db);
  const app = buildApp(db);
  expect((await request(app).get('/api/panel/expenses')).status).toBe(401);
});
