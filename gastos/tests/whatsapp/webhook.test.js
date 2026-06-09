const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createWebhookRouter } = require('../../src/whatsapp/webhook');

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

function buildApp(db, deps) {
  const app = express();
  app.use(express.json());
  app.use('/api/whatsapp/webhook', createWebhookRouter({ db, verifyToken: 'VT', ...deps }));
  return app;
}

function imageMsg(phoneNumberId, from, mediaId, msgId) {
  return { entry: [{ changes: [{ value: {
    metadata: { phone_number_id: phoneNumberId },
    messages: [{ id: msgId, from, type: 'image', image: { id: mediaId } }],
  } }] }] };
}
function textMsg(phoneNumberId, from, body, msgId) {
  return { entry: [{ changes: [{ value: {
    metadata: { phone_number_id: phoneNumberId },
    messages: [{ id: msgId, from, type: 'text', text: { body } }],
  } }] }] };
}

test('GET verificacion devuelve el challenge con token correcto', async () => {
  const db = await freshDb();
  const app = buildApp(db, {});
  const res = await request(app).get('/api/whatsapp/webhook')
    .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'VT', 'hub.challenge': '12345' });
  expect(res.status).toBe(200);
  expect(res.text).toBe('12345');
});

test('GET con token malo => 403', async () => {
  const db = await freshDb();
  const app = buildApp(db, {});
  const res = await request(app).get('/api/whatsapp/webhook')
    .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'MALO', 'hub.challenge': '12345' });
  expect(res.status).toBe(403);
});

test('imagen de empleado autorizado => intake + responde confirmacion', async () => {
  const db = await freshDb();
  const c = await db.query("INSERT INTO companies(nombre, wa_phone_number_id, wa_token) VALUES('X','PNID','TKN') RETURNING id");
  await db.query("INSERT INTO employees(company_id, nombre, phone) VALUES($1,'Juan','56988887777')", [c.rows[0].id]);

  const sent = [];
  const deps = {
    downloadMedia: jest.fn().mockResolvedValue({ buffer: Buffer.from('img'), mimeType: 'image/jpeg' }),
    extractExpense: jest.fn().mockResolvedValue({ proveedor: 'Copec', total: 25000, categoria: 'Combustible y transporte', cuenta_sii_codigo: '4.3.150.1', cuenta_sii_nombre: 'X', iva: 3992 }),
    sendText: jest.fn().mockImplementation(async ({ body }) => { sent.push(body); return {}; }),
  };
  const app = buildApp(db, deps);

  const res = await request(app).post('/api/whatsapp/webhook').send(imageMsg('PNID', '56988887777', 'MID', 'wamid.1'));
  expect(res.status).toBe(200);
  expect(deps.downloadMedia).toHaveBeenCalled();
  expect(deps.extractExpense).toHaveBeenCalled();
  expect(sent[0]).toContain('Copec');

  const pend = await db.query("SELECT * FROM expenses WHERE estado='pendiente_confirmacion'");
  expect(pend.rows).toHaveLength(1);
});

test('texto SI confirma el pendiente', async () => {
  const db = await freshDb();
  const c = await db.query("INSERT INTO companies(nombre, wa_phone_number_id, wa_token) VALUES('X','PNID','TKN') RETURNING id");
  const e = await db.query("INSERT INTO employees(company_id, nombre, phone) VALUES($1,'Juan','56988887777') RETURNING id", [c.rows[0].id]);
  await db.query("INSERT INTO expenses(company_id, employee_id, total, estado, categoria) VALUES($1,$2,25000,'pendiente_confirmacion','Otros gastos')", [c.rows[0].id, e.rows[0].id]);

  const deps = {
    downloadMedia: jest.fn(), extractExpense: jest.fn(),
    sendText: jest.fn().mockResolvedValue({}),
  };
  const app = buildApp(db, deps);
  const res = await request(app).post('/api/whatsapp/webhook').send(textMsg('PNID', '56988887777', 'sí', 'wamid.2'));
  expect(res.status).toBe(200);

  const conf = await db.query("SELECT estado FROM expenses LIMIT 1");
  expect(conf.rows[0].estado).toBe('confirmado');
  expect(deps.sendText).toHaveBeenCalled();
});

test('empleado NO autorizado recibe aviso y no crea gasto', async () => {
  const db = await freshDb();
  await db.query("INSERT INTO companies(nombre, wa_phone_number_id, wa_token) VALUES('X','PNID','TKN')");
  const deps = {
    downloadMedia: jest.fn(), extractExpense: jest.fn(),
    sendText: jest.fn().mockResolvedValue({}),
  };
  const app = buildApp(db, deps);
  const res = await request(app).post('/api/whatsapp/webhook').send(imageMsg('PNID', '56900000000', 'MID', 'wamid.3'));
  expect(res.status).toBe(200);
  expect(deps.extractExpense).not.toHaveBeenCalled();
  expect(deps.sendText.mock.calls[0][0].body.toLowerCase()).toContain('registrad');
});
