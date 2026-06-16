const catalog = require('../../src/catalog/repo');

const torta = {
  nombre: 'Torta de chocolate',
  variantes: [
    { id: 'g1', nombre: 'Tamaño', opciones: [{ id: 'o1', nombre: '10p', delta: 0 }, { id: 'o2', nombre: '15 personas', delta: 8000 }] },
    { id: 'g2', nombre: 'Sabor', opciones: [{ id: 'o3', nombre: 'Chocolate', delta: 0 }, { id: 'o4', nombre: 'Red velvet', delta: 3000 }] },
  ],
  extras: [{ id: 'e1', nombre: 'Velas', precio: 1500 }, { id: 'e2', nombre: 'Dedicatoria', precio: 2000 }],
};

test('describeSelection: producto sin selección = solo nombre', () => {
  expect(catalog.describeSelection({ nombre: 'Café', variantes: [], extras: [] }, {})).toBe('Café');
});

test('describeSelection: con variantes elegidas y extras', () => {
  const sel = { opciones: { g1: 'o2', g2: 'o4' }, extras: ['e1', 'e2'] };
  expect(catalog.describeSelection(torta, sel)).toBe('Torta de chocolate (15 personas, Red velvet) + Velas, Dedicatoria');
});

test('describeSelection: solo una variante, sin extras', () => {
  expect(catalog.describeSelection(torta, { opciones: { g1: 'o2' } })).toBe('Torta de chocolate (15 personas)');
});
