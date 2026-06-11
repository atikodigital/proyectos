const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
const { intakeFromImage } = require('../src/expenses/intake');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
async function company(db) {
  const r = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  return r.rows[0].id;
}
const fakeExtract = (over = {}) => async () => ({
  tipo: 'gasto', tipo_documento: 'factura', rut_emisor: '76.1-1', folio: '1234',
  nro_operacion: '', direccion_emisor: '', proveedor: 'Sodimac', fecha: '2026-06-01',
  neto: 10000, iva: 1900, total: 11900, moneda: 'CLP', categoria: 'Otros gastos',
  cuenta_sii_codigo: '5', cuenta_sii_nombre: 'Gastos generales', glosa: '', confianza: 80,
  raw_ocr: {}, ...over,
});

test('intake crea movimiento con tipo, hash y sender', async () => {
  const db = await makeDb();
  const cid = await company(db);
  const { expense, duplicado } = await intakeFromImage({
    db, companyId: cid, imageBuffer: Buffer.from('foto1'),
    canal: 'whatsapp', waSenderName: 'Juan', waSenderPhone: '56999',
    extract: fakeExtract(),
  });
  expect(duplicado).toBeNull();
  expect(expense.tipo).toBe('gasto');
  expect(expense.image_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(expense.wa_sender_name).toBe('Juan');
  expect(expense.wa_sender_phone).toBe('56999');
});

test('duplicado fuerte sin override → no inserta, devuelve existente', async () => {
  const db = await makeDb();
  const cid = await company(db);
  await intakeFromImage({ db, companyId: cid, imageBuffer: Buffer.from('a'), extract: fakeExtract() });
  const { expense, duplicado } = await intakeFromImage({
    db, companyId: cid, imageBuffer: Buffer.from('b'), extract: fakeExtract(),
  });
  expect(expense).toBeNull();
  expect(duplicado.nivel).toBe('fuerte');
  const count = await db.query('SELECT count(*)::int AS n FROM expenses');
  expect(count.rows[0].n).toBe(1);
});

test('duplicado fuerte con override → inserta segunda fila con dedup_override', async () => {
  const db = await makeDb();
  const cid = await company(db);
  await intakeFromImage({ db, companyId: cid, imageBuffer: Buffer.from('a'), extract: fakeExtract() });
  const { expense } = await intakeFromImage({
    db, companyId: cid, imageBuffer: Buffer.from('b'), override: true, extract: fakeExtract(),
  });
  expect(expense).not.toBeNull();
  expect(expense.dedup_override).toBe(true);
  const count = await db.query('SELECT count(*)::int AS n FROM expenses');
  expect(count.rows[0].n).toBe(2);
});

test('duplicado suave → inserta igual y avisa', async () => {
  const db = await makeDb();
  const cid = await company(db);
  await intakeFromImage({ db, companyId: cid, imageBuffer: Buffer.from('a'), extract: fakeExtract({ folio: '', rut_emisor: '' }) });
  const { expense, duplicado } = await intakeFromImage({
    db, companyId: cid, imageBuffer: Buffer.from('b'), extract: fakeExtract({ folio: '', rut_emisor: '' }),
  });
  expect(expense).not.toBeNull();
  expect(duplicado.nivel).toBe('suave');
});
