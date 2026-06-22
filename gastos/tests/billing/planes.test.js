const { PLANES, PESOS, getPlan, creditosDe } = require('../../src/billing/planes');

test('planes tienen límite de créditos', () => {
  expect(getPlan('free').creditos).toBe(30);
  expect(getPlan('pyme').creditos).toBe(250);
  expect(getPlan('desconocido').nombre).toBe('free'); // fallback a free
});

test('creditosDe pondera por tipo y cantidad', () => {
  expect(creditosDe('imagen', 1)).toBe(PESOS.imagen);          // 1 imagen
  expect(creditosDe('voz_min', 3)).toBe(PESOS.voz_min * 3);    // 3 minutos de voz
  expect(creditosDe('texto', 1)).toBe(PESOS.texto);
  expect(creditosDe('tipo_raro', 1)).toBe(0);                  // tipo desconocido = 0
});
