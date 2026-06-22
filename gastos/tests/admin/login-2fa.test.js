const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createAdminRouter } = require('../../src/admin/router');
const { totp } = require('../../src/auth/totp');

const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

async function makeApp() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  const app = express();
  app.use(express.json());
  app.use('/api/admin', createAdminRouter({ db }));
  return app;
}

describe('admin 2FA (TOTP) opt-in', () => {
  let saved;
  beforeAll(() => {
    saved = {
      u: process.env.GASTOS_ADMIN_USER, p: process.env.GASTOS_ADMIN_PASSWORD, t: process.env.GASTOS_ADMIN_TOTP_SECRET,
    };
    process.env.GASTOS_ADMIN_USER = 'atiko';
    process.env.GASTOS_ADMIN_PASSWORD = 'secreta';
    process.env.GASTOS_ADMIN_TOTP_SECRET = SECRET;
  });
  afterAll(() => {
    const set = (k, v) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
    set('GASTOS_ADMIN_USER', saved.u);
    set('GASTOS_ADMIN_PASSWORD', saved.p);
    set('GASTOS_ADMIN_TOTP_SECRET', saved.t);
  });

  test('con 2FA activo: user/pass correctos pero SIN código → 401 totp_invalido', async () => {
    const app = await makeApp();
    const r = await request(app).post('/api/admin/login').send({ usuario: 'atiko', password: 'secreta' });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('totp_invalido');
  });

  test('con 2FA activo: código inválido → 401', async () => {
    const app = await makeApp();
    const r = await request(app).post('/api/admin/login').send({ usuario: 'atiko', password: 'secreta', totp: '000000' });
    expect(r.status).toBe(401);
  });

  test('con 2FA activo: user/pass + código válido → 200 token', async () => {
    const app = await makeApp();
    const code = totp(SECRET);
    const r = await request(app).post('/api/admin/login').send({ usuario: 'atiko', password: 'secreta', totp: code });
    expect(r.status).toBe(200);
    expect(r.body.token).toBeTruthy();
  });

  test('clave mala sigue siendo 401 (no filtra si el 2FA es el que falla)', async () => {
    const app = await makeApp();
    const r = await request(app).post('/api/admin/login').send({ usuario: 'atiko', password: 'mala', totp: totp(SECRET) });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('credenciales');
  });
});
