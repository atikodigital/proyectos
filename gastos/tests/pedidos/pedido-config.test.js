const { newDb } = require('pg-mem');
const repo = require('../../src/pedidos/repo');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await db.query("CREATE TABLE companies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nombre text)");
  return db;
}

test('getPedidoConfig default: iva_incluido true, pie null; setPedidoConfig lo cambia', async () => {
  const db = await freshDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const id = c.rows[0].id;

  const def = await repo.getPedidoConfig(db, id);
  expect(def.pie).toBeNull();
  expect(def.iva_incluido).toBe(true);

  await repo.setPedidoConfig(db, id, { pie: 'Atiko SpA', iva_incluido: false });
  const upd = await repo.getPedidoConfig(db, id);
  expect(upd.pie).toBe('Atiko SpA');
  expect(upd.iva_incluido).toBe(false);

  await repo.setPedidoConfig(db, id, { iva_incluido: true });
  const upd2 = await repo.getPedidoConfig(db, id);
  expect(upd2.pie).toBe('Atiko SpA');
  expect(upd2.iva_incluido).toBe(true);
});

test('getPedidoConfig incluye delivery (default vacío); setPedidoConfig guarda zonas + gratis_desde', async () => {
  const db = await freshDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const id = c.rows[0].id;

  const def = await repo.getPedidoConfig(db, id);
  expect(def.delivery).toEqual({ zonas: [], gratis_desde: null });

  await repo.setPedidoConfig(db, id, { delivery: {
    zonas: [{ nombre: 'RM cercana', costo: 2500, comunas: ['Providencia', 'Ñuñoa'] }],
    gratis_desde: 30000,
  } });
  const upd = await repo.getPedidoConfig(db, id);
  expect(upd.delivery.gratis_desde).toBe(30000);
  expect(upd.delivery.zonas).toHaveLength(1);
  expect(upd.delivery.zonas[0]).toMatchObject({ nombre: 'RM cercana', costo: 2500 });
  expect(upd.delivery.zonas[0].comunas).toEqual(['Providencia', 'Ñuñoa']);
  expect(upd.delivery.zonas[0].id).toBeTruthy();
});
