const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
const { createExpense } = require('../src/expenses/repo');
const { createEmployee } = require('../src/companies/repo');
const { listExpenses, periodoRange } = require('../src/expenses/query');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}

test('periodoRange convierte YYYY-MM a rango de mes', () => {
  expect(periodoRange('2026-06')).toEqual({ from: '2026-06-01', to: '2026-06-30' });
  expect(periodoRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  expect(periodoRange('')).toBeNull();
  expect(periodoRange('basura')).toBeNull();
});

test('filtra por tipo y por período, y trae empleado_nombre', async () => {
  const db = await makeDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const cid = c.rows[0].id;
  const emp = await createEmployee(db, { company_id: cid, nombre: 'Juan', activo: true });
  await createExpense(db, { company_id: cid, employee_id: emp.id, tipo: 'gasto', proveedor: 'Sodimac', fecha: '2026-06-10', total: 11900 });
  await createExpense(db, { company_id: cid, employee_id: emp.id, tipo: 'ingreso', proveedor: 'Cliente A', fecha: '2026-06-12', total: 50000 });
  await createExpense(db, { company_id: cid, employee_id: emp.id, tipo: 'gasto', proveedor: 'Mayo SA', fecha: '2026-05-01', total: 3000 });

  const ingresos = await listExpenses(db, cid, { tipo: 'ingreso' });
  expect(ingresos).toHaveLength(1);
  expect(ingresos[0].proveedor).toBe('Cliente A');
  expect(ingresos[0].empleado_nombre).toBe('Juan');

  const junio = await listExpenses(db, cid, { periodo: '2026-06' });
  expect(junio).toHaveLength(2);
  const proveedores = junio.map((r) => r.proveedor).sort();
  expect(proveedores).toEqual(['Cliente A', 'Sodimac']);

  const todos = await listExpenses(db, cid, {});
  expect(todos).toHaveLength(3);
});
