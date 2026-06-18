const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const repo = require('../../src/admin/repo');
const { createEmployee } = require('../../src/companies/repo');
const { createExpense } = require('../../src/expenses/repo');

async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  const c = await db.query("INSERT INTO companies(nombre,rut) VALUES('Pizza X','77.123.456-9') RETURNING id");
  return { db, cid: c.rows[0].id };
}

test('getFichaCliente consolida empresa, empleados, movimientos y resumen', async () => {
  const { db, cid } = await setup();
  await repo.setProductos(db, cid, { productos: ['hashia'] });
  await createEmployee(db, { company_id: cid, nombre: 'Juan', phone: '+56911', usuario: 'juan', rol: 'empleado', activo: true });
  await createExpense(db, { company_id: cid, tipo: 'gasto', proveedor: 'Molinera', total: 11900, estado: 'confirmado' });
  const f = await repo.getFichaCliente(db, cid, 2026, 6);
  expect(f.empresa.nombre).toBe('Pizza X');
  expect(f.empresa.productos).toEqual(['hashia']);
  expect(f.empleados.find((e) => e.nombre === 'Juan')).toBeTruthy();
  expect(f.empleados[0]).not.toHaveProperty('password_hash');
  expect(Array.isArray(f.movimientos)).toBe(true);
  expect(f.resumen).toHaveProperty('saldo');
  expect(f.pedidos).toBeNull(); // sin producto 'pedidos'
});

test('getFichaCliente devuelve null si la empresa no existe', async () => {
  const { db } = await setup();
  const f = await repo.getFichaCliente(db, '00000000-0000-0000-0000-000000000000', 2026, 6);
  expect(f).toBeNull();
});

test('crearCliente guarda teléfono y email de contacto y salen en la ficha', async () => {
  const { db } = await setup();
  const r = await repo.crearCliente(db, { nombreEmpresa: 'Don Vito', owner_whatsapp: '+56 9 1234 5678', owner_email: '  Contacto@DonVito.cl  ' });
  const f = await repo.getFichaCliente(db, r.empresa.id, 2026, 6);
  expect(f.empresa.owner_whatsapp).toBe('+56 9 1234 5678');
  expect(f.empresa.owner_email).toBe('Contacto@DonVito.cl');
});
