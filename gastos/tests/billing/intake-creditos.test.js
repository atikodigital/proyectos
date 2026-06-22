const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createCompany } = require('../../src/companies/repo');
const { saldo, SinCreditosError } = require('../../src/billing/creditos');
const { intakeFromImage } = require('../../src/expenses/intake');

async function freshDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}
const fakeExtract = async () => ({ tipo: 'gasto', proveedor: 'Prov', total: 1000, fecha: '2026-06-01', lineas: [] });

test('intake con imagen descuenta 1 crédito', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'X' });
  await intakeFromImage({ db, companyId: co.id, imageBuffer: Buffer.from('x'), extract: fakeExtract, storeImage: () => null });
  const s = await saldo(db, co.id);
  expect(s.usado).toBe(1);
});

test('intake sin créditos lanza SinCreditosError y no llama al OCR', async () => {
  const db = await freshDb();
  const co = await createCompany(db, { nombre: 'X' });
  await db.query('UPDATE subscriptions SET creditos_usados = creditos_limite WHERE company_id=$1', [co.id]);
  let llamoOcr = false;
  const spyExtract = async (...a) => { llamoOcr = true; return fakeExtract(...a); };
  await expect(intakeFromImage({ db, companyId: co.id, imageBuffer: Buffer.from('x'), extract: spyExtract, storeImage: () => null }))
    .rejects.toThrow(SinCreditosError);
  expect(llamoOcr).toBe(false);
});
