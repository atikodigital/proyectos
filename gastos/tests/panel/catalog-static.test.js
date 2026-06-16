const request = require('supertest');
const { app } = require('../../src/server');
const lib = require('../../public/panel/lib.js');

test('productosListHtml arma filas con nombre, desde-precio y estado, escapando XSS', () => {
  const html = lib.productosListHtml([
    { id: 'p1', nombre: '<b>Torta</b>', precio_base: 18000, variantes: [], extras: [], activo: true, stock: 8 },
    { id: 'p2', nombre: 'Corte', tipo: 'servicio', unidad: 'sesion', precio_base: 8000, variantes: [], extras: [], activo: false },
  ], lib.fmtClp);
  expect(html).toContain('&lt;b&gt;Torta&lt;/b&gt;');
  expect(html).toContain('$18.000');
  expect(html).toContain('data-prod="p1"');
  expect(html).toContain('servicio');
});

test('GET /panel/ incluye la pestaña y sección Productos', async () => {
  const res = await request(app).get('/panel/');
  expect(res.status).toBe(200);
  expect(res.text).toContain('data-tab="productos"');
  expect(res.text).toContain('id="productosSection"');
});
