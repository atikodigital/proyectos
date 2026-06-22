process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { hashPassword } = require('../../src/auth/password');
const { createAppRouter } = require('../../src/app/router');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}
async function seed(db) {
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const hash = await hashPassword('clave');
  await db.query("INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'J','juan',$2)", [c.rows[0].id, hash]);
  return c.rows[0].id;
}
async function token(a) { return (await request(a).post('/api/app/login').send({ usuario: 'juan', password: 'clave' })).body.token; }

// Adapted: POST /kaly/memoria now inserts directly (no reconciliar/LLM).
// All POSTs return 201 accion: 'insertar'. GET returns { empresa, personal }.
describe('POST /api/app/kaly/memoria (insert directo)', () => {
  test('primer hecho → 201 accion insertar', async () => {
    const db = await freshDb(); await seed(db);
    const a = express(); a.use(express.json()); a.use('/api/app', createAppRouter({ db }));
    const t = await token(a);
    const res = await request(a).post('/api/app/kaly/memoria').set('Authorization', `Bearer ${t}`).send({ tipo: 'negocio', contenido: 'Cierra a las 18h' });
    expect(res.status).toBe(201);
    expect(res.body.accion).toBe('insertar');
  });

  test('dos hechos empresa → ambos guardados (sin dedup)', async () => {
    const db = await freshDb(); await seed(db);
    const a = express(); a.use(express.json()); a.use('/api/app', createAppRouter({ db }));
    const t = await token(a);
    await request(a).post('/api/app/kaly/memoria').set('Authorization', `Bearer ${t}`).send({ tipo: 'negocio', contenido: 'Cierra a las 18h' });
    const res = await request(a).post('/api/app/kaly/memoria').set('Authorization', `Bearer ${t}`).send({ tipo: 'negocio', contenido: 'Cierra a las 20h' });
    expect(res.status).toBe(201);
    expect(res.body.accion).toBe('insertar');
    const lista = await request(a).get('/api/app/kaly/memoria').set('Authorization', `Bearer ${t}`);
    expect(lista.body.empresa).toHaveLength(2);
  });

  test('hecho personal → aparece en personal, no en empresa', async () => {
    const db = await freshDb(); await seed(db);
    const a = express(); a.use(express.json()); a.use('/api/app', createAppRouter({ db }));
    const t = await token(a);
    await request(a).post('/api/app/kaly/memoria').set('Authorization', `Bearer ${t}`).send({ tipo: 'negocio', contenido: 'mi nota', alcance: 'personal' });
    const lista = await request(a).get('/api/app/kaly/memoria').set('Authorization', `Bearer ${t}`);
    expect(lista.body.empresa).toHaveLength(0);
    expect(lista.body.personal).toHaveLength(1);
    expect(lista.body.personal[0].contenido).toBe('mi nota');
  });

  test('contenido vacío → 400', async () => {
    const db = await freshDb(); await seed(db);
    const a = express(); a.use(express.json()); a.use('/api/app', createAppRouter({ db }));
    const t = await token(a);
    const res = await request(a).post('/api/app/kaly/memoria').set('Authorization', `Bearer ${t}`).send({ tipo: 'negocio', contenido: '   ' });
    expect(res.status).toBe(400);
  });
});
