const catalog = require('../../src/catalog/repo');

test('normalizeProduct: exige nombre, normaliza tipo/unidad/stock', () => {
  expect(() => catalog.normalizeProduct({ nombre: '  ' })).toThrow('nombre_requerido');

  const p = catalog.normalizeProduct({ nombre: '  Torta  ', tipo: 'raro', precio_base: '18000.4', stock: '8' });
  expect(p.nombre).toBe('Torta');
  expect(p.tipo).toBe('producto');     // 'raro' -> producto
  expect(p.unidad).toBe('unidad');     // producto -> unidad
  expect(p.precio_base).toBe(18000);   // redondeado a entero
  expect(p.stock).toBe(8);
  expect(p.activo).toBe(true);
  expect(p.variantes).toEqual([]);
  expect(p.extras).toEqual([]);
});

test('normalizeProduct: servicio fuerza stock null y unidad por defecto sesion', () => {
  const s = catalog.normalizeProduct({ nombre: 'Corte', tipo: 'servicio', stock: 5 });
  expect(s.tipo).toBe('servicio');
  expect(s.stock).toBeNull();
  expect(s.unidad).toBe('sesion');
});

test('normalizeProduct: variantes y extras reciben id y precios enteros', () => {
  const p = catalog.normalizeProduct({
    nombre: 'Torta',
    variantes: [{ nombre: 'Tamaño', opciones: [{ nombre: '10p', delta: 0 }, { nombre: '15p', delta: '8000' }] }],
    extras: [{ nombre: 'Velas', precio: '1500' }, { nombre: 'Descuento', precio: -50 }],
  });
  expect(p.variantes[0].id).toBeTruthy();
  expect(p.variantes[0].opciones[1].delta).toBe(8000);
  expect(p.variantes[0].opciones[0].id).toBeTruthy();
  expect(p.extras[0].precio).toBe(1500);
  expect(p.extras[1].precio).toBe(0);  // extras no negativos
});

const ejemplo = {
  precio_base: 18000,
  variantes: [
    { id: 'g1', nombre: 'Tamaño', opciones: [
      { id: 'o1', nombre: '10p', delta: 0 }, { id: 'o2', nombre: '15p', delta: 8000 }, { id: 'o3', nombre: '25p', delta: 22000 } ] },
    { id: 'g2', nombre: 'Sabor', opciones: [
      { id: 'o4', nombre: 'Choco', delta: 0 }, { id: 'o5', nombre: 'Red velvet', delta: 3000 } ] },
  ],
  extras: [{ id: 'e1', nombre: 'Velas', precio: 1500 }, { id: 'e2', nombre: 'Dedicatoria', precio: 2000 }],
};

test('desdePrice = base + menor delta de cada grupo', () => {
  expect(catalog.desdePrice(ejemplo)).toBe(18000);            // 18000 + 0 + 0
  expect(catalog.desdePrice({ precio_base: 5000, variantes: [], extras: [] })).toBe(5000);
});

test('priceForSelection suma opción elegida por grupo + extras elegidos', () => {
  const sel = { opciones: { g1: 'o2', g2: 'o5' }, extras: ['e2'] };
  expect(catalog.priceForSelection(ejemplo, sel)).toBe(18000 + 8000 + 3000 + 2000); // 31000
  expect(catalog.priceForSelection(ejemplo, {})).toBe(18000); // sin selección = base
});
