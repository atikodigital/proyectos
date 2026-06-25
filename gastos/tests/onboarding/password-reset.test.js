process.env.JWT_SECRET = 'test-secret';
const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createOnboardingRouter } = require('../../src/onboarding/router');
const { hashPassword, verifyPassword } = require('../../src/auth/password');

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

function app(db) {
  const a = express();
  a.use(express.json());
  a.use('/api/onboarding', createOnboardingRouter({ db }));
  return a;
}

async function seedUser(db) {
  const hash = await hashPassword('ClaveOriginal1');
  const c = await db.query("INSERT INTO companies(nombre, owner_whatsapp) VALUES('TestCo','+56900000001') RETURNING id");
  const cid = c.rows[0].id;
  const u = await db.query(
    "INSERT INTO users(company_id, email, password_hash, auth_provider, rol) VALUES($1,'user@test.cl',$2,'email','owner') RETURNING id",
    [cid, hash]
  );
  return { companyId: cid, userId: u.rows[0].id };
}

test('forgot-password siempre responde ok (no revela si existe)', async () => {
  const db = await freshDb(); const a = app(db);
  const res = await request(a).post('/api/onboarding/forgot-password').send({ identificador: 'noexiste@x.cl' });
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
});

test('forgot-password por email crea token en DB', async () => {
  const db = await freshDb(); const a = app(db);
  const { userId } = await seedUser(db);
  await request(a).post('/api/onboarding/forgot-password').send({ identificador: 'user@test.cl' });
  const r = await db.query('SELECT * FROM password_resets WHERE user_id=$1', [userId]);
  expect(r.rows.length).toBe(1);
  expect(r.rows[0].used_at).toBeNull();
});

test('reset-password cambia la clave con token válido', async () => {
  const db = await freshDb(); const a = app(db);
  const { userId } = await seedUser(db);
  // Insertar token manualmente
  const rawToken = 'abc123validtoken';
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiry = new Date(Date.now() + 3600000);
  await db.query('INSERT INTO password_resets(user_id, token_hash, expires_at) VALUES($1,$2,$3)', [userId, tokenHash, expiry]);

  const res = await request(a).post('/api/onboarding/reset-password').send({ token: rawToken, nueva_password: 'NuevaClave99' });
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);

  // Verificar que la clave cambió
  const u = await db.query('SELECT password_hash FROM users WHERE id=$1', [userId]);
  expect(await verifyPassword('NuevaClave99', u.rows[0].password_hash)).toBe(true);

  // Verificar que el token queda marcado como usado
  const rt = await db.query('SELECT used_at FROM password_resets WHERE token_hash=$1', [tokenHash]);
  expect(rt.rows[0].used_at).not.toBeNull();
});

test('reset-password rechaza token expirado', async () => {
  const db = await freshDb(); const a = app(db);
  const { userId } = await seedUser(db);
  const rawToken = 'expiredtoken';
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiry = new Date(Date.now() - 1000); // ya expiró
  await db.query('INSERT INTO password_resets(user_id, token_hash, expires_at) VALUES($1,$2,$3)', [userId, tokenHash, expiry]);

  const res = await request(a).post('/api/onboarding/reset-password').send({ token: rawToken, nueva_password: 'NuevaClave99' });
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('token_expirado');
});

test('reset-password rechaza token ya usado', async () => {
  const db = await freshDb(); const a = app(db);
  const { userId } = await seedUser(db);
  const rawToken = 'usedtoken';
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiry = new Date(Date.now() + 3600000);
  await db.query("INSERT INTO password_resets(user_id, token_hash, expires_at, used_at) VALUES($1,$2,$3,now())", [userId, tokenHash, expiry]);

  const res = await request(a).post('/api/onboarding/reset-password').send({ token: rawToken, nueva_password: 'NuevaClave99' });
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('token_ya_usado');
});

test('reset-password rechaza token inexistente', async () => {
  const db = await freshDb(); const a = app(db);
  const res = await request(a).post('/api/onboarding/reset-password').send({ token: 'noexiste', nueva_password: 'NuevaClave99' });
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('token_invalido');
});
