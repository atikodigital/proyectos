const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const adminRepo = require('../../src/admin/repo');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  return db;
}

test('getFichaCliente incluye creditos con plan free y limite 30 por defecto', async () => {
  const db = await freshDb();
  const r = await adminRepo.crearCliente(db, { nombreEmpresa: 'Empresa Test' });
  const ficha = await adminRepo.getFichaCliente(db, r.empresa.id, 2026, 6);
  expect(ficha).not.toBeNull();
  expect(ficha.creditos).toBeDefined();
  expect(ficha.creditos.plan).toBe('free');
  expect(ficha.creditos.limite).toBe(30);
});

test('getFichaCliente refleja plan actualizado en creditos', async () => {
  const db = await freshDb();
  const r = await adminRepo.crearCliente(db, { nombreEmpresa: 'Empresa Pyme', plan: 'pyme' });
  const ficha = await adminRepo.getFichaCliente(db, r.empresa.id, 2026, 6);
  expect(ficha.creditos.plan).toBe('pyme');
  expect(ficha.creditos.limite).toBe(250);
});
