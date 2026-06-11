const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const {
  createCompany, createEmployee,
  getCompanyByPhoneNumberId, getEmployeeByPhone,
} = require('../../src/companies/repo');

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

test('resuelve empresa por phone_number_id', async () => {
  const db = await freshDb();
  const c = await createCompany(db, { nombre: 'Pyme X', wa_phone_number_id: '538774095982196', wa_token: 'TKN', owner_whatsapp: '56999999999' });
  const found = await getCompanyByPhoneNumberId(db, '538774095982196');
  expect(found.id).toBe(c.id);
  expect(found.wa_token).toBe('TKN');
  expect(await getCompanyByPhoneNumberId(db, 'no-existe')).toBeNull();
});

test('resuelve empleado autorizado por telefono dentro de la empresa', async () => {
  const db = await freshDb();
  const c = await createCompany(db, { nombre: 'Pyme X' });
  const e = await createEmployee(db, { company_id: c.id, nombre: 'Juan', phone: '56988887777' });
  const found = await getEmployeeByPhone(db, c.id, '56988887777');
  expect(found.id).toBe(e.id);
  expect(await getEmployeeByPhone(db, c.id, '56900000000')).toBeNull();
});

test('no resuelve empleado inactivo', async () => {
  const db = await freshDb();
  const c = await createCompany(db, { nombre: 'Pyme X' });
  await createEmployee(db, { company_id: c.id, nombre: 'Ana', phone: '56911112222', activo: false });
  expect(await getEmployeeByPhone(db, c.id, '56911112222')).toBeNull();
});
