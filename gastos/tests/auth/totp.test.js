const { totp, verifyTotp, randomBase32 } = require('../../src/auth/totp');

// Vector de prueba RFC 6238 (SHA1): secret ASCII "12345678901234567890" en base32,
// en t=59s el TOTP de 8 dígitos es 94287082 → 6 dígitos = "287082".
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('totp genera el código del vector RFC 6238 (t=59s → 287082)', () => {
  expect(totp(RFC_SECRET, { now: 59000, step: 30, digits: 6 })).toBe('287082');
});

test('verifyTotp acepta el código correcto y rechaza el incorrecto', () => {
  const code = totp(RFC_SECRET, { now: 59000 });
  expect(verifyTotp(RFC_SECRET, code, { now: 59000 })).toBe(true);
  expect(verifyTotp(RFC_SECRET, '000000', { now: 59000 })).toBe(false);
  expect(verifyTotp(RFC_SECRET, '', { now: 59000 })).toBe(false);
  expect(verifyTotp('', code, { now: 59000 })).toBe(false);
});

test('verifyTotp tolera un paso de desfase (window=1)', () => {
  const prev = totp(RFC_SECRET, { now: 59000 - 30000 }); // código del paso anterior
  expect(verifyTotp(RFC_SECRET, prev, { now: 59000, window: 1 })).toBe(true);
  // fuera de la ventana (2 pasos) → rechaza
  const old = totp(RFC_SECRET, { now: 59000 - 90000 });
  expect(verifyTotp(RFC_SECRET, old, { now: 59000, window: 1 })).toBe(false);
});

test('randomBase32 produce un secreto base32 válido y usable', () => {
  const s = randomBase32(20);
  expect(s).toMatch(/^[A-Z2-7]+$/);
  const code = totp(s, { now: 1000000 });
  expect(verifyTotp(s, code, { now: 1000000 })).toBe(true);
});
