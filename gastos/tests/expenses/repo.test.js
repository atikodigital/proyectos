const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { createExpense, getExpense, confirmExpense, updateExpense } = require('../../src/expenses/repo');

async function freshDb() {
  const mem = newDb();
  let counter = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => `00000000-0000-0000-0000-${String(++counter).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const db = mem.adapters.createPg();
  const client = new db.Pool();
  await migrate(client).catch(() => {});
  const c = await client.query(
    "INSERT INTO companies(nombre) VALUES('Atiko') RETURNING id"
  );
  return { client, companyId: c.rows[0].id };
}

test('crea un gasto en estado pendiente_confirmacion', async () => {
  const { client, companyId } = await freshDb();
  const exp = await createExpense(client, {
    company_id: companyId, canal: 'app', proveedor: 'Copec',
    neto: 21008, iva: 3992, total: 25000, categoria: 'Combustible y transporte',
    cuenta_sii_codigo: '4.3.150.1', cuenta_sii_nombre: 'Otros Gastos de Administración y Venta',
  });
  expect(exp.estado).toBe('pendiente_confirmacion');
  expect(Number(exp.total)).toBe(25000);
  const fetched = await getExpense(client, exp.id);
  expect(fetched.proveedor).toBe('Copec');
});

test('confirmExpense pone estado confirmado y confirmed_at', async () => {
  const { client, companyId } = await freshDb();
  const exp = await createExpense(client, { company_id: companyId, total: 1000 });
  const conf = await confirmExpense(client, exp.id);
  expect(conf.estado).toBe('confirmado');
  expect(conf.confirmed_at).toBeTruthy();
});

test('updateExpense aplica patch de campos editables', async () => {
  const { client, companyId } = await freshDb();
  const exp = await createExpense(client, { company_id: companyId, total: 1000, categoria: 'Otros gastos' });
  const upd = await updateExpense(client, exp.id, { categoria: 'Honorarios', total: 2000 });
  expect(upd.categoria).toBe('Honorarios');
  expect(Number(upd.total)).toBe(2000);
});
