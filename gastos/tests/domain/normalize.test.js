const { normalizeRut, isValidRut, parseAmountClp, parseFecha } = require('../../src/domain/normalize');

test('normaliza RUT a formato con guion y DV mayúscula', () => {
  expect(normalizeRut('76.086.428-5')).toBe('76086428-5');
  expect(normalizeRut('760864285')).toBe('76086428-5');
  expect(normalizeRut('18.765.432-k')).toBe('18765432-K');
});

test('valida DV por módulo 11', () => {
  expect(isValidRut('76.086.428-5')).toBe(true);
  expect(isValidRut('76.086.428-9')).toBe(false);
  expect(isValidRut('basura')).toBe(false);
});

test('parsea montos CLP chilenos a entero', () => {
  expect(parseAmountClp('$25.000')).toBe(25000);
  expect(parseAmountClp('25.000')).toBe(25000);
  expect(parseAmountClp('1.011.500')).toBe(1011500);
  expect(parseAmountClp('$ 3.992 ')).toBe(3992);
  expect(parseAmountClp('')).toBe(0);
});

test('parsea fechas a ISO YYYY-MM-DD', () => {
  expect(parseFecha('12/06/2026')).toBe('2026-06-12');
  expect(parseFecha('12-06-2026')).toBe('2026-06-12');
  expect(parseFecha('2026-06-12')).toBe('2026-06-12');
  expect(parseFecha('basura')).toBeNull();
});

test('parsea fechas en texto y con año de 2 dígitos', () => {
  expect(parseFecha('4 de junio de 2026')).toBe('2026-06-04');
  expect(parseFecha('15 de Diciembre 2025')).toBe('2025-12-15');
  expect(parseFecha('04/06/26')).toBe('2026-06-04');
  expect(parseFecha('4 de mesinventado de 2026')).toBeNull();
});
