process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { hashPassword } = require('../../src/auth/password');
const { createPanelRouter } = require('../../src/panel/router');
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

async function seedUser(db, opts = {}) {
  // getCompanyWa reads: nombre, wa_phone_number_id, wa_token, owner_whatsapp
  const cols = opts.wa
    ? 'nombre, owner_whatsapp, wa_phone_number_id, wa_token'
    : 'nombre, owner_whatsapp';
  const vals = opts.wa
    ? "'Test','56000','PNID','TOK'"
    : "'Test','56000'";
  const c = await db.query(`INSERT INTO companies(${cols}) VALUES(${vals}) RETURNING id`);
  const companyId = c.rows[0].id;
  const hash = await hashPassword('clave');
  await db.query(
    "INSERT INTO users(company_id, email, password_hash, rol) VALUES($1,'d@d.cl',$2,'owner')",
    [companyId, hash]
  );
  return { companyId };
}

async function token(a) {
  return (await request(a).post('/api/panel/login').send({ email: 'd@d.cl', password: 'clave' })).body.token;
}

const sendText = jest.fn().mockResolvedValue({ ok: true });

function app(db) {
  const a = express();
  a.use(express.json());
  a.use('/api/panel', createPanelRouter({ db, sendText }));
  return a;
}

beforeEach(() => sendText.mockClear());

describe('POST /api/panel/chat/responder', () => {
  test('whatsapp ok: envía y guarda mensaje out', async () => {
    const db = await freshDb();
    const { companyId } = await seedUser(db, { wa: true });
    const a = app(db);
    const t = await token(a);
    await request(a)
      .post('/api/panel/chat/responder')
      .set('Authorization', `Bearer ${t}`)
      .send({ channel: 'whatsapp', contact: '56999', text: 'gracias!' })
      .expect(200);
    expect(sendText).toHaveBeenCalled();
    const msgs = await chatRepo.listMensajes(db, companyId, 'whatsapp', '56999');
    expect(msgs.some((m) => m.direccion === 'out' && m.text === 'gracias!')).toBe(true);
  });

  test('canal no whatsapp → 400 canal_no_soportado', async () => {
    const db = await freshDb();
    await seedUser(db, { wa: true });
    const a = app(db);
    const t = await token(a);
    const res = await request(a)
      .post('/api/panel/chat/responder')
      .set('Authorization', `Bearer ${t}`)
      .send({ channel: 'messenger', contact: 'x', text: 'hola' })
      .expect(400);
    expect(res.body.error).toBe('canal_no_soportado');
  });

  test('sin whatsapp configurado → 400 whatsapp_no_configurado', async () => {
    const db = await freshDb();
    await seedUser(db, { wa: false });
    const a = app(db);
    const t = await token(a);
    const res = await request(a)
      .post('/api/panel/chat/responder')
      .set('Authorization', `Bearer ${t}`)
      .send({ channel: 'whatsapp', contact: '56999', text: 'hola' })
      .expect(400);
    expect(res.body.error).toBe('whatsapp_no_configurado');
  });
});
