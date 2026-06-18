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

describe('POST /api/app/kaly/memoria con reconciliación', () => {
  test('primer hecho (memoria vacía) → 201 accion insertar', async () => {
    const db = await freshDb(); await seed(db);
    const a = express(); a.use(express.json()); a.use('/api/app', createAppRouter({ db }));
    const t = await token(a);
    const res = await request(a).post('/api/app/kaly/memoria').set('Authorization', `Bearer ${t}`).send({ tipo: 'negocio', contenido: 'Cierra a las 18h' });
    expect(res.status).toBe(201);
    expect(res.body.accion).toBe('insertar');
  });

  test('hecho que contradice uno existente → reemplaza (juez inyectado)', async () => {
    const db = await freshDb(); const companyId = await seed(db);
    await db.query("INSERT INTO kaly_memory(company_id, tipo, contenido, origen) VALUES($1,'negocio','Cierra a las 18h','dueño')", [companyId]);
    const juzgarHecho = jest.fn().mockResolvedValue({ accion: 'reemplaza', indice: 1 });
    const a = express(); a.use(express.json()); a.use('/api/app', createAppRouter({ db, juzgarHecho }));
    const t = await token(a);
    const res = await request(a).post('/api/app/kaly/memoria').set('Authorization', `Bearer ${t}`).send({ tipo: 'negocio', contenido: 'Cierra a las 20h' });
    expect(res.status).toBe(201);
    expect(res.body.accion).toBe('reemplaza');
    const lista = await request(a).get('/api/app/kaly/memoria').set('Authorization', `Bearer ${t}`);
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0].contenido).toBe('Cierra a las 20h');
    expect(juzgarHecho).toHaveBeenCalled();
  });

  test('hecho duplicado → 200 accion duplicado, no crea fila', async () => {
    const db = await freshDb(); const companyId = await seed(db);
    await db.query("INSERT INTO kaly_memory(company_id, tipo, contenido, origen) VALUES($1,'negocio','Cierra domingos','dueño')", [companyId]);
    const juzgarHecho = jest.fn().mockResolvedValue({ accion: 'duplicado', indice: 1 });
    const a = express(); a.use(express.json()); a.use('/api/app', createAppRouter({ db, juzgarHecho }));
    const t = await token(a);
    const res = await request(a).post('/api/app/kaly/memoria').set('Authorization', `Bearer ${t}`).send({ tipo: 'negocio', contenido: 'No atiende los domingos' });
    expect(res.status).toBe(200);
    expect(res.body.accion).toBe('duplicado');
    const lista = await request(a).get('/api/app/kaly/memoria').set('Authorization', `Bearer ${t}`);
    expect(lista.body).toHaveLength(1);
  });

  test('contenido vacío → 400', async () => {
    const db = await freshDb(); await seed(db);
    const a = express(); a.use(express.json()); a.use('/api/app', createAppRouter({ db }));
    const t = await token(a);
    const res = await request(a).post('/api/app/kaly/memoria').set('Authorization', `Bearer ${t}`).send({ tipo: 'negocio', contenido: '   ' });
    expect(res.status).toBe(400);
  });
});
