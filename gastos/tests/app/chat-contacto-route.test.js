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

async function seedEmployee(db) {
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const hash = await hashPassword('clave');
  await db.query("INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'Juan','juan',$2)", [c.rows[0].id, hash]);
  return { companyId: c.rows[0].id };
}

function buildApp(db) {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use('/api/app', createAppRouter({ db }));
  return app;
}

async function token(app) {
  return (await request(app).post('/api/app/login').send({ usuario: 'juan', password: 'clave' })).body.token;
}

describe('GET/PATCH /api/app/chat/contacto', () => {
  test('GET deriva la ficha desde los mensajes y mergea datos editables', async () => {
    const db = await freshDb();
    const { companyId } = await seedEmployee(db);
    await chatRepo.addMensaje(db, companyId, { channel: 'whatsapp', contact: '56999111222', text: 'hola', direccion: 'in', source: 'app' });
    await chatRepo.addMensaje(db, companyId, { channel: 'whatsapp', contact: '56999111222', text: 'quiero 2', direccion: 'in', source: 'app' });
    const app = buildApp(db);
    const t = await token(app);
    const res = await request(app)
      .get('/api/app/chat/contacto?channel=whatsapp&contact=56999111222')
      .set('Authorization', `Bearer ${t}`)
      .expect(200);
    expect(res.body.nMensajes).toBe(2);
    expect(res.body.telefono).toBe('56999111222');
    expect(res.body).toHaveProperty('email');
    expect(res.body).toHaveProperty('ubicacion');
    expect(res.body).toHaveProperty('notas');
  });

  test('PATCH guarda email/ubicacion/notas y GET los devuelve', async () => {
    const db = await freshDb();
    const { companyId } = await seedEmployee(db);
    await chatRepo.addMensaje(db, companyId, { channel: 'whatsapp', contact: '56999', text: 'hi', direccion: 'in', source: 'app' });
    const app = buildApp(db);
    const t = await token(app);
    await request(app)
      .patch('/api/app/chat/contacto')
      .set('Authorization', `Bearer ${t}`)
      .send({ channel: 'whatsapp', contact: '56999', email: 'c@c.cl', ubicacion: 'Maipú', notas: 'cliente top' })
      .expect(200);
    const res = await request(app)
      .get('/api/app/chat/contacto?channel=whatsapp&contact=56999')
      .set('Authorization', `Bearer ${t}`)
      .expect(200);
    expect(res.body.email).toBe('c@c.cl');
    expect(res.body.ubicacion).toBe('Maipú');
    expect(res.body.notas).toBe('cliente top');
  });

  test('sin token => 401', async () => {
    const db = await freshDb();
    await seedEmployee(db);
    const app = buildApp(db);
    await request(app).get('/api/app/chat/contacto?channel=whatsapp&contact=56999').expect(401);
  });
});
