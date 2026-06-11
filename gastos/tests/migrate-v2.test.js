const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');

function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  return new pg.Pool();
}

test('migrate crea columnas v2 en expenses', async () => {
  const db = makeDb();
  await migrate(db);
  const c = await db.query(
    "INSERT INTO companies(nombre) VALUES('X') RETURNING id"
  );
  const companyId = c.rows[0].id;
  const r = await db.query(
    `INSERT INTO expenses(company_id, tipo, nro_operacion, image_hash, estado_pago, dedup_override, wa_sender_name, wa_sender_phone)
     VALUES($1,'ingreso','OP-123','abc', 'registrada', true, 'Juan', '56999')
     RETURNING tipo, nro_operacion, image_hash, estado_pago, dedup_override, wa_sender_name, wa_sender_phone`,
    [companyId]
  );
  expect(r.rows[0].tipo).toBe('ingreso');
  expect(r.rows[0].nro_operacion).toBe('OP-123');
  expect(r.rows[0].image_hash).toBe('abc');
  expect(r.rows[0].estado_pago).toBe('registrada');
  expect(r.rows[0].dedup_override).toBe(true);
  expect(r.rows[0].wa_sender_name).toBe('Juan');
  expect(r.rows[0].wa_sender_phone).toBe('56999');
});

test('expenses.tipo default es gasto', async () => {
  const db = makeDb();
  await migrate(db);
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const r = await db.query(
    `INSERT INTO expenses(company_id) VALUES($1) RETURNING tipo, estado_pago, dedup_override`,
    [c.rows[0].id]
  );
  expect(r.rows[0].tipo).toBe('gasto');
  expect(r.rows[0].estado_pago).toBe('registrada');
  expect(r.rows[0].dedup_override).toBe(false);
});
