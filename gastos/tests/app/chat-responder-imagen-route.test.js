process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { hashPassword } = require('../../src/auth/password');
const { createAppRouter } = require('../../src/app/router');
const chatRepo = require('../../src/chat/repo');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const db = mem.adapters.createPg();
  const client = new db.Pool();
  await migrate(client).catch(() => {});
  return client;
}

async function seedEmployee(db, { wa = true } = {}) {
  const cols = wa ? 'nombre, wa_phone_number_id, wa_token' : 'nombre';
  const vals = wa ? "'X','PNID','TOK'" : "'X'";
  const c = await db.query(`INSERT INTO companies(${cols}) VALUES(${vals}) RETURNING id`);
  const hash = await hashPassword('clave');
  await db.query("INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'Juan','juan',$2)", [c.rows[0].id, hash]);
  return { companyId: c.rows[0].id };
}

const sendImage = jest.fn().mockResolvedValue({ ok: true });

function buildApp(db) {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use('/api/app', createAppRouter({ db, sendImage }));
  return app;
}

async function token(app) {
  return (await request(app).post('/api/app/login').send({ usuario: 'juan', password: 'clave' })).body.token;
}

beforeEach(() => sendImage.mockClear());

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('POST /api/app/chat/responder-imagen', () => {
  test('whatsapp ok: envía imagen (buffer) y guarda mensaje out', async () => {
    const db = await freshDb();
    const { companyId } = await seedEmployee(db, { wa: true });
    const app = buildApp(db);
    const t = await token(app);
    await request(app)
      .post('/api/app/chat/responder-imagen')
      .set('Authorization', `Bearer ${t}`)
      .send({ channel: 'whatsapp', contact: '56999111222', imageBase64: 'data:image/png;base64,' + PNG_B64, mimeType: 'image/png' })
      .expect(200);
    expect(sendImage).toHaveBeenCalled();
    expect(Buffer.isBuffer(sendImage.mock.calls[0][0].buffer)).toBe(true);
    const msgs = await chatRepo.listMensajes(db, companyId, 'whatsapp', '56999111222');
    expect(msgs.some((m) => m.direccion === 'out')).toBe(true);
  });

  test('sin imagen → 400 sin_imagen', async () => {
    const db = await freshDb();
    await seedEmployee(db, { wa: true });
    const app = buildApp(db);
    const t = await token(app);
    const res = await request(app).post('/api/app/chat/responder-imagen').set('Authorization', `Bearer ${t}`).send({ channel: 'whatsapp', contact: '56999' }).expect(400);
    expect(res.body.error).toBe('sin_imagen');
  });

  test('canal no whatsapp → 400 canal_no_soportado', async () => {
    const db = await freshDb();
    await seedEmployee(db, { wa: true });
    const app = buildApp(db);
    const t = await token(app);
    const res = await request(app).post('/api/app/chat/responder-imagen').set('Authorization', `Bearer ${t}`).send({ channel: 'instagram', contact: 'x', imageBase64: 'data:image/png;base64,' + PNG_B64 }).expect(400);
    expect(res.body.error).toBe('canal_no_soportado');
  });

  test('sin whatsapp configurado → 400 whatsapp_no_configurado', async () => {
    const db = await freshDb();
    await seedEmployee(db, { wa: false });
    const app = buildApp(db);
    const t = await token(app);
    const res = await request(app).post('/api/app/chat/responder-imagen').set('Authorization', `Bearer ${t}`).send({ channel: 'whatsapp', contact: '56999', imageBase64: 'data:image/png;base64,' + PNG_B64 }).expect(400);
    expect(res.body.error).toBe('whatsapp_no_configurado');
  });
});
