const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
const { createPanelRouter } = require('../src/panel/router');
const { createExpense, confirmExpense } = require('../src/expenses/repo');
const { createUser } = require('../src/users/repo');
const { hashPassword } = require('../src/auth/password');

async function setup(waConfigured = true) {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  const vals = waConfigured ? "'X','PNID','TK','56993300435'" : "'X',NULL,NULL,NULL";
  const c = await db.query(`INSERT INTO companies(nombre, wa_phone_number_id, wa_token, owner_whatsapp) VALUES(${vals}) RETURNING id`);
  const cid = c.rows[0].id;
  await createUser(db, { company_id: cid, email: 'o@x.cl', password_hash: await hashPassword('p'), rol: 'owner' });
  const g = await createExpense(db, { company_id: cid, tipo: 'gasto', categoria: 'Arriendos', fecha: '2026-06-05', total: 30000 });
  const i = await createExpense(db, { company_id: cid, tipo: 'ingreso', categoria: 'Ingreso', fecha: '2026-06-06', total: 80000 });
  await confirmExpense(db, g.id); await confirmExpense(db, i.id);
  const sent = [];
  const sendText = jest.fn(async (m) => { sent.push(m); return { messages: [{ id: 'wamid.1' }] }; });
  const app = express();
  app.use(express.json());
  app.use('/api/panel', createPanelRouter({ db, sendText }));
  const login = await request(app).post('/api/panel/login').send({ email: 'o@x.cl', password: 'p' });
  return { app, db, cid, token: login.body.token, sent, sendText };
}

test('envía el resumen al WhatsApp del dueño con las credenciales de la empresa', async () => {
  const { app, token, sent } = await setup(true);
  const res = await request(app).post('/api/panel/whatsapp/resumen').set('Authorization', 'Bearer ' + token).send({ periodo: '2026-06' });
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  expect(sent).toHaveLength(1);
  expect(sent[0].to).toBe('56993300435');
  expect(sent[0].phoneNumberId).toBe('PNID');
  expect(sent[0].token).toBe('TK');
  expect(sent[0].body).toContain('Saldo');
  expect(sent[0].body).toContain('$50.000');
});

test('400 si la empresa no tiene WhatsApp configurado', async () => {
  const { app, token } = await setup(false);
  const res = await request(app).post('/api/panel/whatsapp/resumen').set('Authorization', 'Bearer ' + token).send({ periodo: '2026-06' });
  expect(res.status).toBe(400);
});

test('502 si el envío de WhatsApp falla (ventana/plantilla)', async () => {
  const { app, token, sendText } = await setup(true);
  sendText.mockRejectedValueOnce(new Error('fuera de ventana 24h'));
  const res = await request(app).post('/api/panel/whatsapp/resumen').set('Authorization', 'Bearer ' + token).send({ periodo: '2026-06' });
  expect(res.status).toBe(502);
  expect(res.body.detalle).toMatch(/ventana/i);
});
