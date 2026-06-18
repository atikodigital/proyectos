import { buildSystemPrompt } from '../../src/gastos/kaly/prompt';

test('inyecta el bloque de memorias cuando hay', () => {
  const p = buildSystemPrompt({ memorias: [{ tipo: 'negocio', contenido: 'Cierra domingos' }] });
  expect(p).toContain('Lo que sé de este negocio');
  expect(p).toContain('Cierra domingos');
});

test('sin memorias no rompe ni mete el bloque', () => {
  const p = buildSystemPrompt({});
  expect(p).not.toContain('Lo que sé de este negocio');
});

test('aplica el nombre de persona override', () => {
  const p = buildSystemPrompt({ persona: { nombre: 'Sofía' } });
  expect(p).toContain('Sofía');
});
