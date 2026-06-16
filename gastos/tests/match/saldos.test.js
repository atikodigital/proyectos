// gastos/tests/match/saldos.test.js
const { calcularSaldos } = require('../../src/match/saldos');

test('SCA/SBA con partidas que cuadran', () => {
  // banco contable = 90000; cartola final = 88100; diferencia 1900
  // partida: nota de débito (comisión) 1900 que la empresa no tenía registrada
  const r = calcularSaldos({
    bancoContable: 90000,
    saldoFinalCartola: 88100,
    partidas: [
      { tipo: 'nota_debito', monto: 1900 },        // baja el saldo contable al registrarla
    ],
  });
  // SCA = banco contable - notas debito no registradas = 90000 - 1900 = 88100
  expect(r.sca).toBe(88100);
  expect(r.sba).toBe(88100); // sin tránsitos, SBA = cartola final
  expect(r.cuadrado).toBe(true);
});

test('depósito en tránsito sube el SBA; cheque en tránsito lo baja', () => {
  const r = calcularSaldos({
    bancoContable: 100000, saldoFinalCartola: 95000,
    partidas: [
      { tipo: 'deposito_transito', monto: 8000 },   // +SBA
      { tipo: 'cheque_no_cobrado', monto: 3000 },    // -SBA
    ],
  });
  // SBA = 95000 + 8000 - 3000 = 100000 ; SCA = 100000 (sin notas) => cuadra
  expect(r.sba).toBe(100000);
  expect(r.sca).toBe(100000);
  expect(r.cuadrado).toBe(true);
});

test('no cuadra → cuadrado false y brecha calculada', () => {
  const r = calcularSaldos({ bancoContable: 100000, saldoFinalCartola: 90000, partidas: [] });
  expect(r.cuadrado).toBe(false);
  expect(r.brecha).toBe(10000);
});
