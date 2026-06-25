const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');

test('el schema crea las 4 tablas con columnas clave', async () => {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', implementation: () => '00000000-0000-0000-0000-000000000000' });
  const db = mem.adapters.createPg();
  const client = new db.Pool();
  await migrate(client);

  const t = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
  );
  const names = t.rows.map((r) => r.table_name);
  expect(names).toEqual(['admins', 'companies', 'contactos', 'employees', 'expenses', 'ia_consumo', 'kaly_memory', 'password_resets', 'subscriptions', 'users']);

  const cols = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='expenses'"
  );
  const colNames = cols.rows.map((r) => r.column_name);
  expect(colNames).toEqual(expect.arrayContaining(['folio', 'direccion_emisor', 'cuenta_sii_codigo', 'canal', 'estado']));
});
