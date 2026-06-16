const { waLink } = require('../../src/pedidos/repo');

test('móvil chileno de 9 dígitos → antepone 56', () => {
  expect(waLink('hola', '912345678')).toBe('https://wa.me/56912345678?text=hola');
});

test('número con +, espacios y guiones se limpia', () => {
  expect(waLink('hola', '+56 9 1234 5678')).toBe('https://wa.me/56912345678?text=hola');
});

test('número que ya trae 56 se respeta', () => {
  expect(waLink('hola', '56912345678')).toBe('https://wa.me/56912345678?text=hola');
});

test('sin número usable → link con selector de contacto', () => {
  expect(waLink('hola', '')).toBe('https://wa.me/?text=hola');
  expect(waLink('hola', null)).toBe('https://wa.me/?text=hola');
});

test('el texto se codifica para URL (espacios y saltos de línea)', () => {
  const url = waLink('Cotización N° 1\nTotal: $1.000', '912345678');
  expect(url).toContain('text=Cotizaci%C3%B3n%20N%C2%B0%201%0ATotal%3A%20%241.000');
  expect(url.startsWith('https://wa.me/56912345678?text=')).toBe(true);
});
