const { onboardingStatus } = require('../../src/onboarding/status');

test('sin datos → empieza en negocio', () => {
  const s = onboardingStatus({}, [], {});
  expect(s.onboarded).toBe(false);
  expect(s.completos.negocio).toBe(false);
  expect(s.completos.catalogo).toBe(false);
  expect(s.pasoActual).toBe('negocio');
});

test('con negocio pero sin productos → paso catalogo', () => {
  const s = onboardingStatus({ nombre: 'Pyme', owner_whatsapp: '569...' }, [], {});
  expect(s.completos.negocio).toBe(true);
  expect(s.completos.catalogo).toBe(false);
  expect(s.pasoActual).toBe('catalogo');
});

test('con negocio y productos → paso iva (confirmar resto)', () => {
  const s = onboardingStatus({ nombre: 'Pyme', owner_whatsapp: '569...' }, [{ id: 1 }], { pedido_iva_incluido: true });
  expect(s.completos.catalogo).toBe(true);
  expect(s.pasoActual).toBe('iva');
});

test('onboarded_at presente → pasoActual listo, onboarded true', () => {
  const s = onboardingStatus({ nombre: 'Pyme', owner_whatsapp: 'x', onboarded_at: '2026-06-17T00:00:00Z' }, [{ id: 1 }], {});
  expect(s.onboarded).toBe(true);
  expect(s.pasoActual).toBe('listo');
});
