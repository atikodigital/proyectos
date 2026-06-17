// gastos/tests/auxiliares/normalizar.test.js
const { normalizarDescripcion, matchExistente } = require('../../src/auxiliares/mapear');

test('normalizarDescripcion baja, quita tildes, números, unidades y tamaños', () => {
  expect(normalizarDescripcion('Harina de Trigo 25kg')).toBe('harina de trigo');
  expect(normalizarDescripcion('HARINA 100 KILOS')).toBe('harina');
  expect(normalizarDescripcion('Levadura seca x3')).toBe('levadura seca');
});

test('matchExistente encuentra por nombre o por sinónimo (normalizado)', () => {
  const aux = [
    { id: 'a1', nombre: 'Harina', sinonimos: ['harina de trigo', 'harina 0000'] },
    { id: 'a2', nombre: 'Levadura', sinonimos: [] },
  ];
  expect(matchExistente('Harina de trigo 25kg', aux).id).toBe('a1');
  expect(matchExistente('HARINA 100 kilos', aux).id).toBe('a1'); // por nombre normalizado
  expect(matchExistente('Levadura seca', aux).id).toBe('a2');    // contiene "levadura"
  expect(matchExistente('Mantequilla', aux)).toBeNull();
});
