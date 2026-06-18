const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../../public/admin/index.html'), 'utf8');

test('el admin tiene UI de productos, canales, burbuja y ficha', () => {
  expect(html).toContain('data-prod="hashia"');
  expect(html).toContain('data-prod="pedidos"');
  expect(html).toContain('data-canal="whatsapp"');
  expect(html).toContain('id="burbuja_activa"');
  expect(html).toContain('id="fichaModal"');
  expect(html).toContain('/productos');
});

test('editar productos de un cliente existente está cableado (no es código muerto)', () => {
  // existe el botón Guardar de la ficha y su handler llama a guardarProductos
  expect(html).toContain('id="ficha_guardar"');
  expect(html).toMatch(/\$\('ficha_guardar'\)\.onclick\s*=\s*\(\)\s*=>\s*guardarProductos\(/);
  expect(html).toContain('async function guardarProductos(');
  // guardarProductos hace el PATCH a /productos con los 4 campos
  expect(html).toMatch(/guardarProductos[\s\S]*?\/clientes\/'\s*\+\s*id\s*\+\s*'\/productos'[\s\S]*?method:\s*'PATCH'/);
  expect(html).toMatch(/guardarProductos[\s\S]*?burbuja_activa/);
});
