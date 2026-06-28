const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createCompany, updateCompany, getCompanyProfile } = require('../../src/companies/repo');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const db = mem.adapters.createPg();
  const client = new db.Pool();
  await migrate(client).catch(() => {});
  return client;
}

test('idioma por defecto es "es" y el perfil lo devuelve', async () => {
  const db = await freshDb();
  const c = await createCompany(db, { nombre: 'X' });
  const p = await getCompanyProfile(db, c.id);
  expect(p.idioma).toBe('es');
});

test('updateCompany guarda idioma en/pt', async () => {
  const db = await freshDb();
  const c = await createCompany(db, { nombre: 'X' });
  await updateCompany(db, c.id, { idioma: 'en' });
  expect((await getCompanyProfile(db, c.id)).idioma).toBe('en');
  await updateCompany(db, c.id, { idioma: 'pt' });
  expect((await getCompanyProfile(db, c.id)).idioma).toBe('pt');
});

test('idioma inválido cae a "es"', async () => {
  const db = await freshDb();
  const c = await createCompany(db, { nombre: 'X' });
  await updateCompany(db, c.id, { idioma: 'fr' });
  expect((await getCompanyProfile(db, c.id)).idioma).toBe('es');
});
