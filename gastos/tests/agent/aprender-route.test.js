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
}

const extraerHechos = jest.fn().mockResolvedValue([{ tipo: 'negocio', contenido: 'Atiende sábados' }]);

function buildApp(db) {
  const a = express();
  a.use(express.json());
  a.use('/api/app', createAppRouter({ db, extraerHechos }));
  return a;
}

async function getToken(a) {
  return (await request(a).post('/api/app/login').send({ usuario: 'juan', password: 'clave' })).body.token;
}

describe('POST /api/app/kaly/aprender', () => {
  test('401 sin token de empleado', async () => {
    const db = await freshDb();
    await seed(db);
    const app = buildApp(db);
    const res = await request(app).post('/api/app/kaly/aprender').send({ transcripcion: [] });
    expect(res.status).toBe(401);
  });

  test('aprende y devuelve { creados } (scoped, extractor inyectado)', async () => {
    const db = await freshDb();
    await seed(db);
    const app = buildApp(db);
    const tokenEmpleado = await getToken(app);

    const res = await request(app)
      .post('/api/app/kaly/aprender')
      .set('Authorization', `Bearer ${tokenEmpleado}`)
      .send({
        transcripcion: [
          { role: 'user', text: 'atiendo sábados' },
          { role: 'kaly', text: 'anotado' },
          { role: 'user', text: 'vendo pan' },
          { role: 'kaly', text: 'genial' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.creados).toBe(1);
    expect(extraerHechos).toHaveBeenCalled();
  });

  test('conversación no sustancial → { creados: 0 } sin llamar al extractor', async () => {
    const db = await freshDb();
    await seed(db);
    const app = buildApp(db);
    const tokenEmpleado = await getToken(app);
    extraerHechos.mockClear();

    const res = await request(app)
      .post('/api/app/kaly/aprender')
      .set('Authorization', `Bearer ${tokenEmpleado}`)
      .send({ transcripcion: [{ role: 'user', text: 'hola' }] });
    expect(res.status).toBe(200);
    expect(res.body.creados).toBe(0);
    expect(extraerHechos).not.toHaveBeenCalled();
  });
});
