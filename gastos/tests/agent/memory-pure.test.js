const { normalizeMemoria, formatMemoriaBlock } = require('../../src/agent/memory');

test('normalizeMemoria: tipo válido o "hecho", contenido recortado', () => {
  expect(normalizeMemoria({ tipo: 'negocio', contenido: '  Cierra domingos  ' })).toEqual({ tipo: 'negocio', contenido: 'Cierra domingos' });
  expect(normalizeMemoria({ tipo: 'xxx', contenido: 'algo' }).tipo).toBe('hecho');
  expect(normalizeMemoria({ contenido: 'x'.repeat(600) }).contenido.length).toBe(500);
});

test('normalizeMemoria: sin contenido → null', () => {
  expect(normalizeMemoria({ contenido: '   ' })).toBeNull();
  expect(normalizeMemoria({})).toBeNull();
});

test('formatMemoriaBlock: agrupa por tipo; vacío → ""', () => {
  expect(formatMemoriaBlock([])).toBe('');
  const b = formatMemoriaBlock([
    { tipo: 'negocio', contenido: 'Cierra domingos' },
    { tipo: 'negocio', contenido: 'Vende tortas' },
    { tipo: 'dueño', contenido: 'Se llama José' },
  ]);
  expect(b).toContain('Cierra domingos');
  expect(b).toContain('Vende tortas');
  expect(b).toContain('Se llama José');
});
