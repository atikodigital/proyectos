process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { hashPassword } = require('../../src/auth/password');
const { createAppRouter } = require('../../src/app/router');
const catalog = require('../../src/catalog/repo');
const pedidos = require('../../src/pedidos/repo');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}
async function seed(db) {
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const companyId = c.rows[0].id;
  const hash = await hashPassword('clave');
  await db.query("INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'Juan','juan',$2)", [companyId, hash]);
  const torta = await catalog.createProduct(db, companyId, {
    nombre: 'Torta', precio_base: 18000,
    variantes: [{ id: 'g1', nombre: 'Tamaño', opciones: [{ id: 'o1', nombre: '10p', delta: 0 }, { id: 'o2', nombre: '15p', delta: 8000 }] }],
    extras: [{ id: 'e1', nombre: 'Velas', precio: 1500 }],
  });
  return { companyId, tortaId: torta.id };
}
function buildApp(db) {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use('/api/app', createAppRouter({ db }));
  return app;
}
async function token(app) {
  const r = await request(app).post('/api/app/login').send({ usuario: 'juan', password: 'clave' });
  return r.body.token;
}

test('from-catalog arma el pedido con precio del servidor; IVA incluido => impuesto 0', async () => {
  const db = await freshDb(); const { tortaId } = await seed(db);
  const app = buildApp(db); const t = await token(app);
  const r = await request(app).post('/api/app/pedido/from-catalog').set('Authorization', `Bearer ${t}`)
    .send({ channel: 'whatsapp', contact: { name: 'Ana', phone: '912345678' },
      lineas: [{ productId: tortaId, opciones: { g1: 'o2' }, extras: ['e1'], cantidad: 2 }],
      entrega: 'despacho', direccion: 'Calle 1' }).expect(201);
  expect(r.body.pedido.items).toHaveLength(1);
  expect(r.body.pedido.items[0].descripcion).toBe('Torta (15p) + Velas');
  expect(r.body.pedido.items[0].precio_unitario).toBe(27500);
  expect(r.body.pedido.items[0].cantidad).toBe(2);
  expect(Number(r.body.pedido.total)).toBe(55000);
  expect(Number(r.body.pedido.impuesto)).toBe(0);
  expect(r.body.text).toContain('Torta (15p) + Velas');
  expect(r.body.waUrl).toContain('wa.me');
});

test('IVA agregado cuando iva_incluido=false', async () => {
  const db = await freshDb(); const { companyId, tortaId } = await seed(db);
  await pedidos.setPedidoConfig(db, companyId, { iva_incluido: false });
  const app = buildApp(db); const t = await token(app);
  const r = await request(app).post('/api/app/pedido/from-catalog').set('Authorization', `Bearer ${t}`)
    .send({ lineas: [{ productId: tortaId, opciones: { g1: 'o1' }, cantidad: 1 }] }).expect(201);
  expect(Number(r.body.pedido.impuesto)).toBe(Math.round(18000 * 0.19));
  expect(Number(r.body.pedido.total)).toBe(18000 + Math.round(18000 * 0.19));
});

test('producto inexistente se omite; 0 líneas válidas => 400', async () => {
  const db = await freshDb(); await seed(db);
  const app = buildApp(db); const t = await token(app);
  await request(app).post('/api/app/pedido/from-catalog').set('Authorization', `Bearer ${t}`)
    .send({ lineas: [{ productId: '00000000-0000-0000-0000-000000009999', cantidad: 1 }] }).expect(400);
});

test('exige token', async () => {
  const db = await freshDb(); await seed(db);
  const app = buildApp(db);
  await request(app).post('/api/app/pedido/from-catalog').send({ lineas: [] }).expect(401);
});

test('despacho con comuna en zona suma el envío al total y lo muestra', async () => {
  const db = await freshDb(); const { companyId, tortaId } = await seed(db);
  await pedidos.setPedidoConfig(db, companyId, { delivery: {
    zonas: [{ nombre: 'RM', costo: 3000, comunas: ['Providencia'] }], gratis_desde: null,
  } });
  const app = buildApp(db); const t = await token(app);
  const r = await request(app).post('/api/app/pedido/from-catalog').set('Authorization', `Bearer ${t}`)
    .send({ lineas: [{ productId: tortaId, opciones: { g1: 'o1' }, cantidad: 1 }], entrega: 'despacho', comuna: 'Providencia', direccion: 'Calle 1' }).expect(201);
  expect(Number(r.body.pedido.envio_costo)).toBe(3000);
  expect(r.body.pedido.envio_zona).toBe('RM');
  expect(r.body.pedido.comuna).toBe('Providencia');
  expect(Number(r.body.pedido.total)).toBe(18000 + 3000);
  expect(r.body.text).toContain('Providencia');
});

test('despacho a comuna sin zona → 400 sin_despacho_comuna', async () => {
  const db = await freshDb(); const { companyId, tortaId } = await seed(db);
  await pedidos.setPedidoConfig(db, companyId, { delivery: { zonas: [{ nombre: 'RM', costo: 3000, comunas: ['Providencia'] }] } });
  const app = buildApp(db); const t = await token(app);
  await request(app).post('/api/app/pedido/from-catalog').set('Authorization', `Bearer ${t}`)
    .send({ lineas: [{ productId: tortaId, opciones: { g1: 'o1' }, cantidad: 1 }], entrega: 'despacho', comuna: 'Arica' }).expect(400);
});
