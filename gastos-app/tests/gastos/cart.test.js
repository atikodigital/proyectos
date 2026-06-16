import { linePrice, lineLabel, cartTotal } from '../../src/gastos/pedido/cart';

const torta = {
  nombre: 'Torta', precio_base: 18000,
  variantes: [{ id: 'g1', nombre: 'Tamaño', opciones: [{ id: 'o1', nombre: '10p', delta: 0 }, { id: 'o2', nombre: '15p', delta: 8000 }] }],
  extras: [{ id: 'e1', nombre: 'Velas', precio: 1500 }],
};

test('linePrice = base + delta opción + extras', () => {
  expect(linePrice(torta, { opciones: { g1: 'o2' }, extras: ['e1'] })).toBe(27500);
  expect(linePrice(torta, {})).toBe(18000);
});

test('lineLabel describe la selección', () => {
  expect(lineLabel(torta, { opciones: { g1: 'o2' }, extras: ['e1'] })).toBe('Torta (15p) + Velas');
});

test('cartTotal suma líneas; agrega IVA si iva_incluido=false', () => {
  const lineas = [{ product: torta, sel: { opciones: { g1: 'o2' }, extras: ['e1'] }, cantidad: 2 }];
  expect(cartTotal(lineas, { iva_incluido: true })).toBe(55000);
  expect(cartTotal(lineas, { iva_incluido: false })).toBe(55000 + Math.round(55000 * 0.19));
});

import { costoEnvioLocal } from '../../src/gastos/pedido/cart';

const delivery = { zonas: [{ id: 'z1', nombre: 'RM', costo: 2500, comunas: ['Providencia'] }], gratis_desde: 30000 };

test('costoEnvioLocal: comuna en zona, gratis sobre X, comuna sin zona', () => {
  expect(costoEnvioLocal(delivery, 'Providencia', 10000)).toMatchObject({ ok: true, costo: 2500, gratis: false });
  expect(costoEnvioLocal(delivery, 'Providencia', 30000)).toMatchObject({ ok: true, costo: 0, gratis: true });
  expect(costoEnvioLocal(delivery, 'Arica', 10000)).toMatchObject({ ok: false });
});
