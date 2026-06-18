const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const repo = require('../../src/pedidos/repo');

async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  const c = await db.query("INSERT INTO companies(nombre) VALUES('P') RETURNING id");
  return { db, cid: c.rows[0].id };
}

test('listPedidos devuelve los pedidos de la empresa, más nuevos primero', async () => {
  const { db, cid } = await setup();
  await repo.createPedido(db, cid, { contact_name: 'Ana', items: [{ descripcion: 'Pizza', cantidad: 1, precio_unitario: 12000 }] });
  await repo.createPedido(db, cid, { contact_name: 'Beto', items: [{ descripcion: 'Pizza', cantidad: 2, precio_unitario: 12000 }] });
  const out = await repo.listPedidos(db, cid, 10);
  expect(out).toHaveLength(2);
  expect(out[0].contact_name).toBeTruthy();
});
