const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { getContacto, upsertContacto } = require('../../src/chat/contactos-repo');

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
const CO = '00000000-0000-0000-0000-0000000000aa';

test('getContacto sin registro → {}', async () => {
  const db = await freshDb();
  expect(await getContacto(db, CO, 'whatsapp', '56999')).toEqual({});
});

test('upsert crea y luego actualiza (mismo contacto)', async () => {
  const db = await freshDb();
  await upsertContacto(db, CO, 'whatsapp', '56999', { email: 'a@a.cl', ubicacion: 'Stgo', notas: 'cliente top' });
  let c = await getContacto(db, CO, 'whatsapp', '56999');
  expect(c.email).toBe('a@a.cl'); expect(c.ubicacion).toBe('Stgo'); expect(c.notas).toBe('cliente top');
  await upsertContacto(db, CO, 'whatsapp', '56999', { email: 'b@b.cl' });
  c = await getContacto(db, CO, 'whatsapp', '56999');
  expect(c.email).toBe('b@b.cl'); expect(c.ubicacion).toBe('Stgo');
});

test('scoped por empresa', async () => {
  const db = await freshDb();
  await upsertContacto(db, CO, 'whatsapp', '56999', { email: 'a@a.cl' });
  const otra = '00000000-0000-0000-0000-0000000000bb';
  expect(await getContacto(db, otra, 'whatsapp', '56999')).toEqual({});
});
