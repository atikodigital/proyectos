const { newDb } = require('pg-mem');
const catalog = require('../../src/catalog/repo');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  return new pg.Pool();
}
const C1 = '11111111-1111-1111-1111-111111111111';
const C2 = '22222222-2222-2222-2222-222222222222';

test('createProduct guarda y getProduct lo trae (variantes/extras como objeto)', async () => {
  const db = await freshDb();
  const p = await catalog.createProduct(db, C1, {
    nombre: 'Torta', precio_base: 18000,
    variantes: [{ nombre: 'Tamaño', opciones: [{ nombre: '10p', delta: 0 }] }],
    extras: [{ nombre: 'Velas', precio: 1500 }],
  });
  expect(p.id).toBeTruthy();
  expect(p.company_id).toBe(C1);
  expect(p.precio_base).toBe(18000);
  expect(Array.isArray(p.variantes)).toBe(true);
  expect(p.variantes[0].opciones[0].nombre).toBe('10p');

  const got = await catalog.getProduct(db, C1, p.id);
  expect(got.nombre).toBe('Torta');
  // cross-tenant: otra empresa no lo ve
  expect(await catalog.getProduct(db, C2, p.id)).toBeNull();
});

test('listProducts ordena por orden,nombre y filtra pausados salvo incluirPausados', async () => {
  const db = await freshDb();
  await catalog.createProduct(db, C1, { nombre: 'B', orden: 2 });
  await catalog.createProduct(db, C1, { nombre: 'A', orden: 1 });
  const pausado = await catalog.createProduct(db, C1, { nombre: 'C', orden: 3, activo: false });
  await catalog.createProduct(db, C2, { nombre: 'Otra empresa' });

  const activos = await catalog.listProducts(db, C1);
  expect(activos.map((x) => x.nombre)).toEqual(['A', 'B']); // C pausado fuera, C2 fuera
  const todos = await catalog.listProducts(db, C1, { incluirPausados: true });
  expect(todos.map((x) => x.nombre)).toEqual(['A', 'B', 'C']);
  expect(pausado.activo).toBe(false);
});

test('updateProduct fusiona y respeta tenant; setActivo y reordenar funcionan', async () => {
  const db = await freshDb();
  const p = await catalog.createProduct(db, C1, { nombre: 'Torta', precio_base: 18000 });

  const upd = await catalog.updateProduct(db, C1, p.id, { precio_base: 20000, categoria: 'Tortas' });
  expect(upd.precio_base).toBe(20000);
  expect(upd.categoria).toBe('Tortas');
  expect(upd.nombre).toBe('Torta'); // se conserva lo no enviado

  // cross-tenant no actualiza
  expect(await catalog.updateProduct(db, C2, p.id, { precio_base: 1 })).toBeNull();

  const off = await catalog.setActivo(db, C1, p.id, false);
  expect(off.activo).toBe(false);

  const p2 = await catalog.createProduct(db, C1, { nombre: 'Café', orden: 0 });
  await catalog.reordenar(db, C1, [{ id: p.id, orden: 5 }, { id: p2.id, orden: 1 }]);
  const todos = await catalog.listProducts(db, C1, { incluirPausados: true });
  expect(todos.map((x) => x.nombre)).toEqual(['Café', 'Torta']); // Café orden 1, Torta orden 5

  const conFoto = await catalog.setProductFoto(db, C1, p.id, 'product-x.jpg');
  expect(conFoto.foto_path).toBe('product-x.jpg');
});

test('crearProductosBulk crea N productos scoped; ignora sin nombre', async () => {
  const db = await freshDb();
  const r = await catalog.crearProductosBulk(db, C1, [
    { nombre: 'Torta', precio: 18000 }, { nombre: '', precio: 5 }, { nombre: 'Café', precio: 1800 },
  ]);
  expect(r.creados).toBe(2);
  const lista = await catalog.listProducts(db, C1, { incluirPausados: true });
  expect(lista.map((p) => p.nombre).sort()).toEqual(['Café', 'Torta']);
  expect(lista.find((p) => p.nombre === 'Torta').precio_base).toBe(18000);
});
