const { buildPedidoPdf } = require('../../src/pedidos/pdf');

test('buildPedidoPdf devuelve un Buffer PDF (%PDF, > 500 bytes)', async () => {
  const ped = {
    id: 'abc12345-0000-0000-0000-000000000000',
    items: [{ descripcion: 'Torta (15p) + Velas', cantidad: 2, precio_unitario: 18000 }],
    subtotal: 36000, impuesto: 0, impuesto_pct: 0, envio_costo: 2500, comuna: 'Providencia',
    total: 38500, entrega: 'despacho', direccion: 'Calle 1', contact_name: 'Ana', contact_phone: '912345678',
  };
  const buf = await buildPedidoPdf(ped, { pie: 'Atiko SpA · contacto@atiko.cl' });
  expect(Buffer.isBuffer(buf)).toBe(true);
  expect(buf.slice(0, 4).toString()).toBe('%PDF');
  expect(buf.length).toBeGreaterThan(500);
});

test('buildPedidoPdf sin pie ni items no rompe', async () => {
  const buf = await buildPedidoPdf({ id: 'x', items: [], subtotal: 0, total: 0, entrega: 'retiro' }, {});
  expect(buf.slice(0, 4).toString()).toBe('%PDF');
});
