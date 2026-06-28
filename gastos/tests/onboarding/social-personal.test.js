const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { findOrCreatePersonalSocialUser } = require('../../src/onboarding/router');
const { createCompany, createEmployee, getEmployeeByProvider } = require('../../src/companies/repo');
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

const perfilGoogle = { provider: 'google', providerId: 'gp-1', email: 'ana@gmail.com', name: 'Ana Pérez' };

test('nueva cuenta PERSONAL social: crea empresa tipo_cuenta=personal + empleado admin, pide ingreso', async () => {
  const db = await freshDb();
  const r = await findOrCreatePersonalSocialUser(db, perfilGoogle);
  expect(r.needsIncome).toBe(true);
  expect(r.company.tipo_cuenta).toBe('personal');
  expect(r.company.sueldo_mensual).toBe(0);
  expect(r.employee.rol).toBe('admin');
  expect(r.employee.google_sub).toBe('gp-1');
  expect(r.employee.company_id).toBe(r.company.id);
  // No crea un user/owner: la cuenta personal vive solo en employees.
  const us = await db.query('SELECT count(*)::int AS n FROM users');
  expect(us.rows[0].n).toBe(0);
  const em = await db.query('SELECT count(*)::int AS n FROM employees');
  expect(em.rows[0].n).toBe(1);
});

test('segundo login con el mismo Google: NO duplica', async () => {
  const db = await freshDb();
  const a = await findOrCreatePersonalSocialUser(db, perfilGoogle);
  const b = await findOrCreatePersonalSocialUser(db, perfilGoogle);
  expect(b.employee.id).toBe(a.employee.id);
  expect(b.company.id).toBe(a.company.id);
  const n = await db.query('SELECT count(*)::int AS n FROM employees');
  expect(n.rows[0].n).toBe(1);
});

test('tras guardar el ingreso (needs_setup=false), ya no lo vuelve a pedir', async () => {
  const db = await freshDb();
  const a = await findOrCreatePersonalSocialUser(db, perfilGoogle);
  await db.query('UPDATE companies SET needs_setup=false, sueldo_mensual=800000 WHERE id=$1', [a.company.id]);
  const b = await findOrCreatePersonalSocialUser(db, perfilGoogle);
  expect(b.needsIncome).toBe(false);
});

test('si ya existía cuenta personal por correo, enlaza el proveedor (no duplica)', async () => {
  const db = await freshDb();
  const company = await createCompany(db, { nombre: 'Yo', tipo_cuenta: 'personal', sueldo_mensual: 500000, dia_pago: 1 });
  const emp = await createEmployee(db, { company_id: company.id, nombre: 'Ana', usuario: 'ana@gmail.com', password_hash: await hashPassword('clave123'), rol: 'admin', activo: true });
  const r = await findOrCreatePersonalSocialUser(db, perfilGoogle);
  expect(r.employee.id).toBe(emp.id);
  const linked = await getEmployeeByProvider(db, 'google', 'gp-1');
  expect(linked.id).toBe(emp.id);
  const n = await db.query('SELECT count(*)::int AS n FROM employees');
  expect(n.rows[0].n).toBe(1);
});

test('Facebook sin email: identifica por facebook_id y no duplica', async () => {
  const db = await freshDb();
  const r = await findOrCreatePersonalSocialUser(db, { provider: 'facebook', providerId: 'fbp-1', email: null, name: 'Sin Correo' });
  expect(r.employee.facebook_id).toBe('fbp-1');
  expect(r.company.tipo_cuenta).toBe('personal');
  const b = await findOrCreatePersonalSocialUser(db, { provider: 'facebook', providerId: 'fbp-1', email: null, name: 'Sin Correo' });
  expect(b.employee.id).toBe(r.employee.id);
  const n = await db.query('SELECT count(*)::int AS n FROM employees');
  expect(n.rows[0].n).toBe(1);
});
