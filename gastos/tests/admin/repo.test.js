const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const admin = require('../../src/admin/repo');
const { getEmployeeByUsuario } = require('../../src/companies/repo');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}

test('crearCliente crea empresa + login (empleado owner) con el plan', async () => {
  const db = await makeDb();
  const r = await admin.crearCliente(db, { nombreEmpresa: 'Pastelería Dulce', rut: '76.111.111-1', plan: 'pyme', usuario: 'dulce', password: 'Clave123', nombreContacto: 'Ana' });
  expect(r.empresa.nombre).toBe('Pastelería Dulce');
  expect(r.empresa.plan).toBe('pyme');
  expect(r.credenciales.usuario).toBe('dulce');
  const emp = await getEmployeeByUsuario(db, 'dulce');
  expect(emp).toBeTruthy();
  expect(emp.company_id).toBe(r.empresa.id);
});

test('setCompanyPlan cambia el plan', async () => {
  const db = await makeDb();
  const r = await admin.crearCliente(db, { nombreEmpresa: 'X', usuario: 'x', password: 'p' });
  const upd = await admin.setCompanyPlan(db, r.empresa.id, 'empresa');
  expect(upd.plan).toBe('empresa');
});

test('eliminarCliente borra la empresa y sus datos (irreversible)', async () => {
  const db = await makeDb();
  const r = await admin.crearCliente(db, { nombreEmpresa: 'Para Borrar', usuario: 'pb', password: 'Clave123' });
  const cid = r.empresa.id;
  await db.query("INSERT INTO expenses(company_id, tipo, total, fecha, estado) VALUES($1,'gasto',1000,'2026-06-05','confirmado')", [cid]);
  const out = await admin.eliminarCliente(db, cid);
  expect(out.id).toBe(cid);
  // La empresa, sus gastos y su empleado/login ya no existen.
  expect((await db.query('SELECT 1 FROM companies WHERE id=$1', [cid])).rows.length).toBe(0);
  expect((await db.query('SELECT 1 FROM expenses WHERE company_id=$1', [cid])).rows.length).toBe(0);
  expect((await db.query('SELECT 1 FROM employees WHERE company_id=$1', [cid])).rows.length).toBe(0);
  expect((await db.query('SELECT 1 FROM subscriptions WHERE company_id=$1', [cid])).rows.length).toBe(0);
});

test('eliminarCliente devuelve null si la empresa no existe', async () => {
  const db = await makeDb();
  const out = await admin.eliminarCliente(db, '00000000-0000-0000-0000-000000000999');
  expect(out).toBeNull();
});

test('movimientosDelMes cuenta solo los del mes y excluye anulados', async () => {
  const db = await makeDb();
  const r = await admin.crearCliente(db, { nombreEmpresa: 'X', usuario: 'x', password: 'p' });
  const cid = r.empresa.id;
  await db.query("INSERT INTO expenses(company_id, tipo, total, fecha, estado) VALUES($1,'gasto',1000,'2026-06-05','confirmado')", [cid]);
  await db.query("INSERT INTO expenses(company_id, tipo, total, fecha, estado) VALUES($1,'gasto',2000,'2026-06-20','confirmado')", [cid]);
  await db.query("INSERT INTO expenses(company_id, tipo, total, fecha, estado) VALUES($1,'gasto',3000,'2026-05-10','confirmado')", [cid]); // otro mes
  await db.query("INSERT INTO expenses(company_id, tipo, total, fecha, estado) VALUES($1,'gasto',9000,'2026-06-15','anulado')", [cid]); // anulado
  expect(await admin.movimientosDelMes(db, cid, 2026, 6)).toBe(2);
});

test('listClientesConStats devuelve empresas con empleados y movimientos del mes', async () => {
  const db = await makeDb();
  const r = await admin.crearCliente(db, { nombreEmpresa: 'Cli', usuario: 'cli', password: 'p', plan: 'basico' });
  await db.query("INSERT INTO expenses(company_id, tipo, total, fecha, estado) VALUES($1,'gasto',1000,'2026-06-05','confirmado')", [r.empresa.id]);
  const list = await admin.listClientesConStats(db, 2026, 6);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ nombre: 'Cli', plan: 'basico', empleados: 1, movimientos: 1 });
});
