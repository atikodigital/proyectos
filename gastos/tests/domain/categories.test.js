const { CATEGORIES, mapCategoryToSii, isValidCategory } = require('../../src/domain/categories');

test('hay 13 categorías y todas son válidas', () => {
  expect(CATEGORIES).toHaveLength(13);
  expect(isValidCategory('Honorarios')).toBe(true);
  expect(isValidCategory('No existe')).toBe(false);
});

test('mapea categoría a su cuenta SII', () => {
  expect(mapCategoryToSii('Honorarios')).toEqual({
    codigo: '4.3.90.1',
    nombre: 'Honorarios',
  });
  expect(mapCategoryToSii('Mercadería e insumos del giro')).toEqual({
    codigo: '4.2.10.1',
    nombre: 'Costos Directos del Giro',
  });
});

test('categoría desconocida cae en Otros gastos', () => {
  expect(mapCategoryToSii('cualquier cosa')).toEqual({
    codigo: '4.3.150.1',
    nombre: 'Otros Gastos de Administración y Venta',
  });
});
