const repo = require('../../src/pedidos/repo');

const delivery = {
  zonas: [
    { id: 'z1', nombre: 'RM cercana', costo: 2500, comunas: ['Providencia', 'Ñuñoa'] },
    { id: 'z2', nombre: 'RM lejana', costo: 4500, comunas: ['Maipú', 'Puente Alto'] },
  ],
  gratis_desde: 30000,
};

test('costoEnvio: comuna en zona → costo de la zona', () => {
  expect(repo.costoEnvio(delivery, 'Providencia', 10000)).toMatchObject({ ok: true, costo: 2500, gratis: false });
  expect(repo.costoEnvio(delivery, 'Maipú', 10000)).toMatchObject({ ok: true, costo: 4500 });
});

test('costoEnvio: comuna insensible a acento', () => {
  expect(repo.costoEnvio(delivery, 'nunoa', 10000)).toMatchObject({ ok: true, costo: 2500 });
});

test('costoEnvio: subtotal >= gratis_desde → 0 / gratis', () => {
  expect(repo.costoEnvio(delivery, 'Providencia', 30000)).toMatchObject({ ok: true, costo: 0, gratis: true });
});

test('costoEnvio: comuna sin zona → ok:false', () => {
  expect(repo.costoEnvio(delivery, 'Arica', 10000)).toMatchObject({ ok: false });
});
