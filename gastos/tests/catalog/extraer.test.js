const { extraerProductos, normalizeProductos } = require('../../src/catalog/extraer');

test('normalizeProductos: precios enteros ≥0, descarta sin nombre, cap', () => {
  const r = normalizeProductos({ productos: [
    { nombre: '  Torta  ', precio: '18000' }, { nombre: '', precio: 5 }, { nombre: 'Café', precio: -10 },
  ] });
  expect(r).toEqual([{ nombre: 'Torta', precio: 18000 }, { nombre: 'Café', precio: 0 }]);
});

test('extraerProductos usa el http inyectado y parsea (con fences)', async () => {
  const http = { post: async () => ({ data: { choices: [{ message: { content: '```json\n{"productos":[{"nombre":"Torta","precio":18000},{"nombre":"Empanada","precio":1500}]}\n```' } }] } }) };
  const r = await extraerProductos('BASE64', 'image/jpeg', { http });
  expect(r).toEqual({ productos: [{ nombre: 'Torta', precio: 18000 }, { nombre: 'Empanada', precio: 1500 }] });
});
