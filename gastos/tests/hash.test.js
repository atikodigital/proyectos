const { imageHash } = require('../src/expenses/hash');

test('misma imagen → mismo hash', () => {
  const a = imageHash(Buffer.from('foto-boleta'));
  const b = imageHash(Buffer.from('foto-boleta'));
  expect(a).toBe(b);
  expect(a).toMatch(/^[a-f0-9]{64}$/);
});

test('imágenes distintas → hashes distintos', () => {
  expect(imageHash(Buffer.from('A'))).not.toBe(imageHash(Buffer.from('B')));
});

test('buffer vacío o nulo → string vacío', () => {
  expect(imageHash(null)).toBe('');
  expect(imageHash(Buffer.alloc(0))).toBe('');
});
