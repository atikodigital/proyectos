const { esSustancial } = require('../../src/agent/aprender');

describe('esSustancial', () => {
  test('true con 4 o más turnos con texto', () => {
    const t = [
      { role: 'user', text: 'hola kaly' },
      { role: 'kaly', text: 'hola, ¿en qué te ayudo?' },
      { role: 'user', text: 'atiendo de 9 a 18' },
      { role: 'kaly', text: 'anotado' },
    ];
    expect(esSustancial(t)).toBe(true);
  });

  test('false con menos de 4 turnos', () => {
    expect(esSustancial([{ role: 'user', text: 'hola' }, { role: 'kaly', text: 'hola' }])).toBe(false);
  });

  test('ignora turnos vacíos o sin texto', () => {
    const t = [
      { role: 'user', text: 'hola' },
      { role: 'kaly', text: '' },
      { role: 'user', text: '   ' },
      { role: 'kaly', text: 'chao' },
    ];
    expect(esSustancial(t)).toBe(false); // solo 2 con texto real
  });

  test('false con entrada no-array', () => {
    expect(esSustancial(null)).toBe(false);
    expect(esSustancial(undefined)).toBe(false);
  });
});
