const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const repo = require('../../src/admin/admins-repo');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}

test('crea admin, lo encuentra por email (normalizado) y no expone hash/secret en list', async () => {
  const db = await freshDb();
  const a = await repo.createAdmin(db, { email: '  Ana@Atiko.CL ', password: 'Clave1234', nombre: 'Ana' });
  expect(a.email).toBe('ana@atiko.cl');
  expect(a.password_hash).toBeUndefined();
  const found = await repo.getAdminByEmail(db, 'ANA@atiko.cl');
  expect(found && found.id).toBe(a.id);
  const list = await repo.listAdmins(db);
  expect(list.length).toBe(1);
  expect(list[0].password_hash).toBeUndefined();
  expect(list[0].totp_secret).toBeUndefined();
  expect(list[0].tiene_2fa).toBe(false);
});

test('verifyAdminPassword: correcta → admin, incorrecta → null, inactivo → null', async () => {
  const db = await freshDb();
  const a = await repo.createAdmin(db, { email: 'b@b.cl', password: 'Secreta123', nombre: 'B' });
  expect(await repo.verifyAdminPassword(db, 'b@b.cl', 'Secreta123')).toBeTruthy();
  expect(await repo.verifyAdminPassword(db, 'b@b.cl', 'mala')).toBeNull();
  await repo.setActivo(db, a.id, false);
  expect(await repo.verifyAdminPassword(db, 'b@b.cl', 'Secreta123')).toBeNull();
});

test('setTotp marca tiene_2fa y guarda el secreto (recuperable por id, no por list)', async () => {
  const db = await freshDb();
  const a = await repo.createAdmin(db, { email: 'c@c.cl', password: 'Clave1234' });
  await repo.setTotp(db, a.id, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  const full = await repo.getAdminById(db, a.id);
  expect(full.totp_secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  const list = await repo.listAdmins(db);
  expect(list[0].tiene_2fa).toBe(true);
  expect(list[0].totp_secret).toBeUndefined();
});
