process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { hashPassword } = require('../../src/auth/password');
const { createPanelRouter } = require('../../src/panel/router');
const chatRepo = require('../../src/chat/repo');

async function freshDb() { const mem = newDb(); let n = 0; mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` }); mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() }); const db = mem.adapters.createPg(); const client = new db.Pool(); await migrate(client).catch(() => {}); return client; }
async function seedUser(db) { const c = await db.query("INSERT INTO companies(nombre, owner_whatsapp) VALUES('Test','56000') RETURNING id"); const companyId = c.rows[0].id; const hash = await hashPassword('clave'); await db.query("INSERT INTO users(company_id, email, password_hash, rol) VALUES($1,'d@d.cl',$2,'owner')", [companyId, hash]); return { companyId }; }
async function token(a) { return (await request(a).post('/api/panel/login').send({ email: 'd@d.cl', password: 'clave' })).body.token; }
function app(db) { const a = express(); a.use(express.json()); a.use('/api/panel', createPanelRouter({ db })); return a; }

describe('chat listas en panel', () => {
  test('401 sin token', async () => {
    const db = await freshDb(); await seedUser(db);
    await request(app(db)).get('/api/panel/chat/conversaciones').expect(401);
  });
  test('GET /chat/conversaciones (scoped)', async () => {
    const db = await freshDb(); const { companyId } = await seedUser(db); const a = app(db); const t = await token(a);
    await chatRepo.addMensaje(db, companyId, { channel: 'whatsapp', contact: '56999', text: 'hola' });
    const res = await request(a).get('/api/panel/chat/conversaciones').set('Authorization', `Bearer ${t}`).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].contact).toBe('56999');
  });
  test('GET /chat/conversacion', async () => {
    const db = await freshDb(); const { companyId } = await seedUser(db); const a = app(db); const t = await token(a);
    await chatRepo.addMensaje(db, companyId, { channel: 'whatsapp', contact: '56999', text: 'hola' });
    const res = await request(a).get('/api/panel/chat/conversacion?channel=whatsapp&contact=56999').set('Authorization', `Bearer ${t}`).expect(200);
    expect(res.body.length).toBe(1);
  });
});
