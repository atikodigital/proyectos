process.env.JWT_SECRET = 'test-secret';
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { calcularResumenPersonal } = require('../../src/personal/repo');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}

async function seedPersonal(db, sueldo = 800000, dia_pago = 5) {
  const r = await db.query(
    "INSERT INTO companies(nombre, tipo_cuenta, sueldo_mensual, dia_pago) VALUES('Juan','personal',$1,$2) RETURNING id",
    [sueldo, dia_pago]
  );
  return r.rows[0].id;
}

test('calcularResumenPersonal suma gastos del mes en curso', async () => {
  const db = await freshDb();
  const companyId = await seedPersonal(db, 800000, 5);
  const now = new Date();
  const mes = now.getMonth() + 1;
  const anio = now.getFullYear();
  const fecha = `${anio}-${String(mes).padStart(2, '0')}-10`;
  await db.query("INSERT INTO expenses(company_id, tipo, total, fecha, estado) VALUES($1,'gasto',250000,$2,'confirmado')", [companyId, fecha]);
  await db.query("INSERT INTO expenses(company_id, tipo, total, fecha, estado) VALUES($1,'gasto',100000,$2,'confirmado')", [companyId, fecha]);

  const r = await calcularResumenPersonal(db, companyId);
  expect(r.sueldo_mensual).toBe(800000);
  expect(r.dia_pago).toBe(5);
  expect(r.gastado_mes).toBe(350000);
  expect(r.disponible).toBe(450000);
  expect(r.porcentaje_gastado).toBe(44);
  expect(r.dias_restantes_mes).toBeGreaterThanOrEqual(0);
  expect(Array.isArray(r.categorias)).toBe(true);
});

test('calcularResumenPersonal ignora gastos anulados', async () => {
  const db = await freshDb();
  const companyId = await seedPersonal(db, 500000);
  const now = new Date();
  const fecha = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-10`;
  await db.query("INSERT INTO expenses(company_id, tipo, total, fecha, estado) VALUES($1,'gasto',200000,$2,'anulado')", [companyId, fecha]);

  const r = await calcularResumenPersonal(db, companyId);
  expect(r.gastado_mes).toBe(0);
  expect(r.disponible).toBe(500000);
});

test('calcularResumenPersonal devuelve null si company no existe', async () => {
  const db = await freshDb();
  const r = await calcularResumenPersonal(db, '00000000-0000-0000-0000-000000000099');
  expect(r).toBeNull();
});

test('calcularResumenPersonal categoriza y ordena por monto desc', async () => {
  const db = await freshDb();
  const companyId = await seedPersonal(db, 1000000);
  const now = new Date();
  const fecha = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-10`;
  await db.query("INSERT INTO expenses(company_id, tipo, total, fecha, estado, categoria) VALUES($1,'gasto',280000,$2,'confirmado','Arriendo')", [companyId, fecha]);
  await db.query("INSERT INTO expenses(company_id, tipo, total, fecha, estado, categoria) VALUES($1,'gasto',89000,$2,'confirmado','Comida')", [companyId, fecha]);
  await db.query("INSERT INTO expenses(company_id, tipo, total, fecha, estado, categoria) VALUES($1,'gasto',45000,$2,'confirmado','Transporte')", [companyId, fecha]);

  const r = await calcularResumenPersonal(db, companyId);
  expect(r.categorias.length).toBeGreaterThan(0);
  expect(r.categorias[0].nombre).toBe('Arriendo');
  expect(r.categorias[0].total).toBe(280000);
});

test('calcularResumenPersonal agrupa categoria null como Otros', async () => {
  const db = await freshDb();
  const companyId = await seedPersonal(db, 500000);
  const now = new Date();
  const fecha = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-10`;
  await db.query("INSERT INTO expenses(company_id, tipo, total, fecha, estado) VALUES($1,'gasto',120000,$2,'confirmado')", [companyId, fecha]);

  const r = await calcularResumenPersonal(db, companyId);
  expect(r.categorias.length).toBeGreaterThan(0);
  const otros = r.categorias.find(c => c.nombre === 'Otros');
  expect(otros).toBeDefined();
  expect(otros.total).toBe(120000);
});
