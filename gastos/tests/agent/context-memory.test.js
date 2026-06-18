const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { crearMemoria } = require('../../src/agent/memory');
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

test('buildAgentContext incluye memorias y persona', async () => {
  const db = await freshDb();
  const c = await db.query("INSERT INTO companies(nombre, kaly_persona) VALUES('Pyme', '{\"nombre\":\"Sofía\"}') RETURNING id");
  const cid = c.rows[0].id;
  const e = await db.query("INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'J','j','x') RETURNING id", [cid]);
  await crearMemoria(db, cid, { tipo: 'negocio', contenido: 'Cierra domingos' });

  const ctx = await buildAgentContext(db, { companyId: cid, employeeId: e.rows[0].id });
  expect(ctx.memorias.map((m) => m.contenido)).toContain('Cierra domingos');
  expect(ctx.persona).toEqual({ nombre: 'Sofía' });
});
