const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { findOrCreateSocialUser } = require('../../src/onboarding/router');
const { createCompany } = require('../../src/companies/repo');
const { createUser, getUserByProvider } = require('../../src/users/repo');
const { hashPassword } = require('../../src/auth/password');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const db = mem.adapters.createPg();
  const client = new db.Pool();
  await migrate(client).catch(() => {});
  return client;
}

const perfilGoogle = { provider: 'google', providerId: 'g-1', email: 'ana@gmail.com', name: 'Ana Pérez' };

test('nuevo usuario social: crea empresa + usuario owner y pide nombre de negocio', async () => {
  const db = await freshDb();
  const r = await findOrCreateSocialUser(db, perfilGoogle);
  expect(r.needsBusinessName).toBe(true);
  expect(r.user.rol).toBe('owner');
  expect(r.user.auth_provider).toBe('google');
  expect(r.user.google_sub).toBe('g-1');
  expect(r.user.company_id).toBe(r.company.id);
  // La empresa nueva nace con suscripción free (createCompany lo hace).
  const sub = await db.query('SELECT plan FROM subscriptions WHERE company_id=$1', [r.company.id]);
  expect(sub.rows[0].plan).toBe('free');
});

test('segundo login con el mismo Google: NO duplica; sigue pidiendo datos si no completó', async () => {
  const db = await freshDb();
  const a = await findOrCreateSocialUser(db, perfilGoogle);
  const b = await findOrCreateSocialUser(db, perfilGoogle);
  expect(b.user.id).toBe(a.user.id);
  expect(b.company.id).toBe(a.company.id);
  expect(b.needsBusinessName).toBe(true); // aún no completó el formulario
  const count = await db.query('SELECT count(*)::int AS n FROM users');
  expect(count.rows[0].n).toBe(1);
});

test('completado el setup (needs_setup=false), no vuelve a pedir datos', async () => {
  const db = await freshDb();
  const a = await findOrCreateSocialUser(db, perfilGoogle);
  await db.query('UPDATE companies SET needs_setup=false WHERE id=$1', [a.company.id]);
  const b = await findOrCreateSocialUser(db, perfilGoogle);
  expect(b.needsBusinessName).toBe(false);
});

test('si ya existía cuenta por correo, enlaza el proveedor (no crea otra)', async () => {
  const db = await freshDb();
  const company = await createCompany(db, { nombre: 'Pyme Previa' });
  const u = await createUser(db, { company_id: company.id, email: 'ana@gmail.com', password_hash: await hashPassword('clave1234'), rol: 'owner' });
  const r = await findOrCreateSocialUser(db, perfilGoogle);
  expect(r.user.id).toBe(u.id);
  expect(r.needsBusinessName).toBe(false);
  const linked = await getUserByProvider(db, 'google', 'g-1');
  expect(linked.id).toBe(u.id);
  const count = await db.query('SELECT count(*)::int AS n FROM users');
  expect(count.rows[0].n).toBe(1);
});

test('Facebook con email: crea la cuenta y enlaza facebook_id', async () => {
  const db = await freshDb();
  const r = await findOrCreateSocialUser(db, { provider: 'facebook', providerId: 'fb-9', email: 'beto@x.cl', name: 'Beto' });
  expect(r.user.facebook_id).toBe('fb-9');
  expect(r.user.email).toBe('beto@x.cl');
  expect(r.needsBusinessName).toBe(true);
});

test('social sin email: rechaza (se exige correo)', async () => {
  const db = await freshDb();
  await expect(findOrCreateSocialUser(db, { provider: 'facebook', providerId: 'fb-1', email: null, name: 'X' }))
    .rejects.toThrow('sin_email');
});
