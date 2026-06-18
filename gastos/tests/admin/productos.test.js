const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const repo = require('../../src/admin/repo');

async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);
  const c = await db.query("INSERT INTO companies(nombre) VALUES('Acme') RETURNING id");
  return { db, cid: c.rows[0].id };
}

test('setProductos filtra claves desconocidas y normaliza burbuja_apps', async () => {
  const { db, cid } = await setup();
  const r = await repo.setProductos(db, cid, {
    productos: ['hashia', 'crm', 'INVENTADO'],
    canales: ['whatsapp', 'fax'],
    burbuja_activa: 1,
    burbuja_apps: [' WhatsApp ', 'Rappi', 'whatsapp'],
  });
  expect(r.productos.sort()).toEqual(['crm', 'hashia']);
  expect(r.canales).toEqual(['whatsapp']);
  expect(r.burbuja_activa).toBe(true);
  expect(r.burbuja_apps.sort()).toEqual(['rappi', 'whatsapp']);
});

test('setProductos parcial no borra lo no enviado', async () => {
  const { db, cid } = await setup();
  await repo.setProductos(db, cid, { productos: ['hashia'] });
  const r = await repo.setProductos(db, cid, { burbuja_activa: true });
  expect(r.productos).toEqual(['hashia']);
  expect(r.burbuja_activa).toBe(true);
});
