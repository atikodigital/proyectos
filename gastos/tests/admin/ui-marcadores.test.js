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
