const { PLANES, PESOS, getPlan, creditosDe, precioDe, procesadorPara, monedasSoportadas } = require('../../src/billing/planes');

test('planes tienen límite de créditos', () => {
  expect(getPlan('free').creditos).toBe(30);
  expect(getPlan('pyme').creditos).toBe(210);
  expect(getPlan('desconocido').nombre).toBe('free'); // fallback a free
});

test('creditosDe pondera por tipo y cantidad', () => {
  expect(creditosDe('imagen', 1)).toBe(PESOS.imagen);          // 1 imagen
  expect(creditosDe('voz_min', 3)).toBe(PESOS.voz_min * 3);    // 3 minutos de voz
  expect(creditosDe('texto', 1)).toBe(PESOS.texto);
  expect(creditosDe('tipo_raro', 1)).toBe(0);                  // tipo desconocido = 0
});

// --- Multi-currency: estructura precios ---

test('PLANES.basico.precios tiene CLP/USD/EUR', () => {
  expect(PLANES.basico.precios).toEqual({ CLP: 9900, USD: 12, EUR: 11 });
});

test('PLANES.pyme.precios tiene CLP/USD/EUR', () => {
  expect(PLANES.pyme.precios).toEqual({ CLP: 24900, USD: 29, EUR: 27 });
});

test('PLANES.empresa.precios tiene CLP/USD/EUR', () => {
  expect(PLANES.empresa.precios).toEqual({ CLP: 49900, USD: 59, EUR: 55 });
});

test('PLANES.free.precios tiene todo en cero', () => {
  expect(PLANES.free.precios).toEqual({ CLP: 0, USD: 0, EUR: 0 });
});

// --- precioDe ---

test('precioDe devuelve precio correcto para plan y moneda', () => {
  expect(precioDe('pyme', 'USD')).toBe(29);
  expect(precioDe('basico', 'CLP')).toBe(9900);
  expect(precioDe('empresa', 'EUR')).toBe(55);
  expect(precioDe('free', 'CLP')).toBe(0);
});

test('precioDe devuelve null para plan desconocido', () => {
  expect(precioDe('nope', 'USD')).toBeNull();
  expect(precioDe('', 'CLP')).toBeNull();
});

// --- procesadorPara ---

test('procesadorPara CLP devuelve mp', () => {
  expect(procesadorPara('CLP')).toBe('mp');
});

test('procesadorPara USD/EUR devuelve stripe', () => {
  expect(procesadorPara('USD')).toBe('stripe');
  expect(procesadorPara('EUR')).toBe('stripe');
});

// --- monedasSoportadas ---

test('monedasSoportadas devuelve [CLP, USD, EUR]', () => {
  expect(monedasSoportadas()).toEqual(['CLP', 'USD', 'EUR']);
});
