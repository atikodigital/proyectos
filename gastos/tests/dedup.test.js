const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
const { createExpense } = require('../src/expenses/repo');
const { findDuplicate } = require('../src/expenses/dedup');

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

test('capa 1 gasto: mismo rut_emisor + folio → fuerte', async () => {
  const db = await makeDb();
  const cid = await company(db);
  await createExpense(db, { company_id: cid, tipo: 'gasto', rut_emisor: '76.111.111-1', folio: '1234', total: 5000 });
  const dup = await findDuplicate(db, cid, { tipo: 'gasto', rut_emisor: '76.111.111-1', folio: '1234' });
  expect(dup.nivel).toBe('fuerte');
  expect(dup.motivo).toBe('folio');
});

test('capa 1 ingreso: mismo nro_operacion → fuerte', async () => {
  const db = await makeDb();
  const cid = await company(db);
  await createExpense(db, { company_id: cid, tipo: 'ingreso', nro_operacion: 'OP-9', total: 9000 });
  const dup = await findDuplicate(db, cid, { tipo: 'ingreso', nro_operacion: 'OP-9' });
  expect(dup.nivel).toBe('fuerte');
  expect(dup.motivo).toBe('nro_operacion');
});

test('capa 2: mismo image_hash → fuerte', async () => {
  const db = await makeDb();
  const cid = await company(db);
  await createExpense(db, { company_id: cid, tipo: 'gasto', image_hash: 'deadbeef', total: 5000 });
  const dup = await findDuplicate(db, cid, { tipo: 'gasto', image_hash: 'deadbeef' });
  expect(dup.nivel).toBe('fuerte');
  expect(dup.motivo).toBe('imagen');
});

test('capa 3: mismo monto+fecha+proveedor → suave', async () => {
  const db = await makeDb();
  const cid = await company(db);
  await createExpense(db, { company_id: cid, tipo: 'gasto', total: 12000, fecha: '2026-06-01', proveedor: 'Sodimac' });
  const dup = await findDuplicate(db, cid, { tipo: 'gasto', total: 12000, fecha: '2026-06-01', proveedor: 'Sodimac' });
  expect(dup.nivel).toBe('suave');
});

test('no hay match → null', async () => {
  const db = await makeDb();
  const cid = await company(db);
  await createExpense(db, { company_id: cid, tipo: 'gasto', rut_emisor: '76.111.111-1', folio: '1', total: 5000 });
  const dup = await findDuplicate(db, cid, { tipo: 'gasto', rut_emisor: '99.999.999-9', folio: '2' });
  expect(dup).toBeNull();
});

test('un rechazado no cuenta como duplicado', async () => {
  const db = await makeDb();
  const cid = await company(db);
  const e = await createExpense(db, { company_id: cid, tipo: 'gasto', rut_emisor: '76.1-1', folio: '5', total: 5000 });
  await db.query("UPDATE expenses SET estado='rechazado' WHERE id=$1", [e.id]);
  const dup = await findDuplicate(db, cid, { tipo: 'gasto', rut_emisor: '76.1-1', folio: '5' });
  expect(dup).toBeNull();
});

test('aislado por empresa', async () => {
  const db = await makeDb();
  const c1 = await company(db);
  const c2 = await company(db);
  await createExpense(db, { company_id: c1, tipo: 'gasto', rut_emisor: '76.1-1', folio: '5', total: 5000 });
  const dup = await findDuplicate(db, c2, { tipo: 'gasto', rut_emisor: '76.1-1', folio: '5' });
  expect(dup).toBeNull();
});
