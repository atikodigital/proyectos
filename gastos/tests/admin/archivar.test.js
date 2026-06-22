const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const admin = require('../../src/admin/repo');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}

test('archivar saca la empresa de la lista por defecto y la muestra en la de archivadas', async () => {
  const db = await freshDb();
  const a = await admin.crearCliente(db, { nombreEmpresa: 'Activa SA', plan: 'pyme', usuario: 'act', password: 'Clave1234' });
  const b = await admin.crearCliente(db, { nombreEmpresa: 'Borrar SA', plan: 'free', usuario: 'bor', password: 'Clave1234' });
  const now = new Date();
  const y = now.getFullYear(); const m = now.getMonth() + 1;

  // antes: las dos aparecen
  let lista = await admin.listClientesConStats(db, y, m);
  expect(lista.map((c) => c.nombre).sort()).toEqual(['Activa SA', 'Borrar SA']);

  // archivar la B
  const r = await admin.archivarCliente(db, b.empresa.id, true);
  expect(r.archivada).toBe(true);

  // por defecto NO aparece la archivada
  lista = await admin.listClientesConStats(db, y, m);
  expect(lista.map((c) => c.nombre)).toEqual(['Activa SA']);

  // la vista de archivadas SÍ la muestra
  const arch = await admin.listClientesConStats(db, y, m, { archivadas: true });
  expect(arch.map((c) => c.nombre)).toEqual(['Borrar SA']);

  // desarchivar la vuelve a la lista normal
  await admin.archivarCliente(db, b.empresa.id, false);
  lista = await admin.listClientesConStats(db, y, m);
  expect(lista.map((c) => c.nombre).sort()).toEqual(['Activa SA', 'Borrar SA']);
});
