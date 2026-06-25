process.env.JWT_SECRET = 'test-secret';
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { buildAgentContext } = require('../../src/agent/context');

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

test('buildAgentContext para cuenta personal incluye tipoPersonal y resumenPersonal', async () => {
  const db = await freshDb();
  const r = await db.query("INSERT INTO companies(nombre,tipo_cuenta,sueldo_mensual,dia_pago) VALUES('Juan','personal',800000,5) RETURNING id");
  const companyId = r.rows[0].id;
  const e = await db.query("INSERT INTO employees(company_id,nombre,usuario,password_hash,activo) VALUES($1,'Juan','j','x',true) RETURNING id", [companyId]);

  const ctx = await buildAgentContext(db, { companyId, employeeId: e.rows[0].id });
  expect(ctx.tipoPersonal).toBe(true);
  expect(ctx.resumenPersonal).toBeDefined();
  expect(ctx.resumenPersonal).toHaveProperty('sueldo_mensual');
  expect(ctx.resumenPersonal).toHaveProperty('disponible');
  expect(ctx.resumenPersonal).toHaveProperty('dias_restantes_mes');
});

test('buildAgentContext para cuenta empresa NO incluye tipoPersonal', async () => {
  const db = await freshDb();
  const r = await db.query("INSERT INTO companies(nombre) VALUES('Mi Empresa') RETURNING id");
  const companyId = r.rows[0].id;
  const e = await db.query("INSERT INTO employees(company_id,nombre,usuario,password_hash,activo) VALUES($1,'X','x','h',true) RETURNING id", [companyId]);

  const ctx = await buildAgentContext(db, { companyId, employeeId: e.rows[0].id });
  expect(ctx.tipoPersonal).toBeFalsy();
  expect(ctx.resumenPersonal).toBeFalsy();
});
