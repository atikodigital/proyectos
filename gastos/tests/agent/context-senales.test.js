const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { buildAgentContext } = require('../../src/agent/context');
const { setAgentPrefs } = require('../../src/companies/repo');

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
async function seed(db) {
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const e = await db.query("INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'J','juan','h') RETURNING id", [c.rows[0].id]);
  return { companyId: c.rows[0].id, employeeId: e.rows[0].id };
}

describe('buildAgentContext + señales', () => {
  test('incluye senales (array) y proactividad=true por defecto', async () => {
    const db = await freshDb();
    const { companyId, employeeId } = await seed(db);
    const ctx = await buildAgentContext(db, { companyId, employeeId });
    expect(Array.isArray(ctx.senales)).toBe(true);
    expect(ctx.proactividad).toBe(true);
    expect(ctx.senales.length).toBeGreaterThan(0); // empresa nueva sin memoria → algo que decir
  });

  test('proactividad=false → senales vacías y flag false', async () => {
    const db = await freshDb();
    const { companyId, employeeId } = await seed(db);
    await setAgentPrefs(db, employeeId, companyId, { proactividad: false });
    const ctx = await buildAgentContext(db, { companyId, employeeId });
    expect(ctx.senales).toEqual([]);
    expect(ctx.proactividad).toBe(false);
  });
});
