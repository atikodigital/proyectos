const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createAdminRouter } = require('../../src/admin/router');
const { totp } = require('../../src/auth/totp');

async function makeApp() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  const app = express();
  app.use(express.json());
  app.use('/api/admin', createAdminRouter({ db }));
  return app;
}

const post = (app, path, body, tok) => {
  const r = request(app).post(path);
  if (tok) r.set('Authorization', `Bearer ${tok}`);
  return r.send(body || {});
};
const get = (app, path, tok) => request(app).get(path).set('Authorization', `Bearer ${tok}`);

describe('admins individuales (email + 2FA opcional)', () => {
  let saved;
  beforeAll(() => {
    saved = { u: process.env.GASTOS_ADMIN_USER, p: process.env.GASTOS_ADMIN_PASSWORD, t: process.env.GASTOS_ADMIN_TOTP_SECRET };
    process.env.GASTOS_ADMIN_USER = 'atiko';
    process.env.GASTOS_ADMIN_PASSWORD = 'rootclave';
    delete process.env.GASTOS_ADMIN_TOTP_SECRET;
  });
  afterAll(() => {
    const s = (k, v) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
    s('GASTOS_ADMIN_USER', saved.u); s('GASTOS_ADMIN_PASSWORD', saved.p); s('GASTOS_ADMIN_TOTP_SECRET', saved.t);
  });

  async function rootToken(app) {
    return (await post(app, '/api/admin/login', { usuario: 'atiko', password: 'rootclave' })).body.token;
  }

  test('el root crea un admin, aparece en la lista, y ese admin puede loguear', async () => {
    const app = await makeApp();
    const root = await rootToken(app);
    const c = await post(app, '/api/admin/admins', { email: 'Maria@Atiko.cl', password: 'Clave1234', nombre: 'María' }, root).expect(201);
    expect(c.body.email).toBe('maria@atiko.cl');
    const list = (await get(app, '/api/admin/admins', root).expect(200)).body.admins;
    expect(list.some((a) => a.email === 'maria@atiko.cl' && a.tiene_2fa === false)).toBe(true);
    const login = await post(app, '/api/admin/login', { email: 'maria@atiko.cl', password: 'Clave1234' }).expect(200);
    expect(login.body.token).toBeTruthy();
    expect(login.body.admin.id).toBeTruthy();
  });

  test('crear admin sin token → 401; password corta → 400; duplicado → 409', async () => {
    const app = await makeApp();
    const root = await rootToken(app);
    await post(app, '/api/admin/admins', { email: 'x@x.cl', password: 'Clave1234' }).expect(401); // sin token
    await post(app, '/api/admin/admins', { email: 'y@y.cl', password: 'corta' }, root).expect(400);
    await post(app, '/api/admin/admins', { email: 'z@z.cl', password: 'Clave1234' }, root).expect(201);
    await post(app, '/api/admin/admins', { email: 'z@z.cl', password: 'Otra12345' }, root).expect(409);
  });

  test('un admin activa su 2FA y a partir de ahí el login pide código', async () => {
    const app = await makeApp();
    const root = await rootToken(app);
    await post(app, '/api/admin/admins', { email: 'ana@a.cl', password: 'Clave1234' }, root).expect(201);
    const tok = (await post(app, '/api/admin/login', { email: 'ana@a.cl', password: 'Clave1234' })).body.token;
    const setup = await post(app, '/api/admin/2fa/setup', {}, tok).expect(200);
    const secret = setup.body.secret;
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    await post(app, '/api/admin/2fa/activar', { secret, code: '000000' }, tok).expect(400); // código malo
    await post(app, '/api/admin/2fa/activar', { secret, code: totp(secret) }, tok).expect(200);
    // ahora el login sin código falla y con código pasa
    await post(app, '/api/admin/login', { email: 'ana@a.cl', password: 'Clave1234' }).expect(401);
    await post(app, '/api/admin/login', { email: 'ana@a.cl', password: 'Clave1234', totp: totp(secret) }).expect(200);
  });

  test('admin desactivado no puede loguear', async () => {
    const app = await makeApp();
    const root = await rootToken(app);
    const c = await post(app, '/api/admin/admins', { email: 'off@o.cl', password: 'Clave1234' }, root).expect(201);
    await request(app).patch(`/api/admin/admins/${c.body.id}/activo`).set('Authorization', `Bearer ${root}`).send({ activo: false }).expect(200);
    await post(app, '/api/admin/login', { email: 'off@o.cl', password: 'Clave1234' }).expect(401);
  });

  test('el root sigue logueando con env y NO puede usar 2FA self-service (usa env)', async () => {
    const app = await makeApp();
    const root = await rootToken(app);
    expect(root).toBeTruthy();
    await post(app, '/api/admin/2fa/setup', {}, root).expect(400);
  });
});
