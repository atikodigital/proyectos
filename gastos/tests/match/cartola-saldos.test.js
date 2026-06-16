// gastos/tests/match/cartola-saldos.test.js
const { parseCartolaDoc } = require('../../src/ocr/cartola');

test('parseCartolaDoc extrae lineas + saldo inicial/final', () => {
  const json = JSON.stringify({
    saldo_inicial: '100000', saldo_final: '88100',
    movimientos: [
      { fecha: '10/06/2026', glosa: 'PAGO PROVEEDOR', cargo: '11900', abono: 0, saldo: '88100', n_operacion: '555' },
    ],
  });
  const doc = parseCartolaDoc(json);
  expect(doc.saldoInicial).toBe(100000);
  expect(doc.saldoFinal).toBe(88100);
  expect(doc.lineas.length).toBe(1);
  expect(doc.lineas[0].tipo).toBe('cargo');
  expect(doc.lineas[0].monto).toBe(11900);
});

test('parseCartolaDoc tolera ausencia de saldos (null)', () => {
  const doc = parseCartolaDoc(JSON.stringify({ movimientos: [{ fecha: '10/06/2026', cargo: '1000' }] }));
  expect(doc.saldoInicial).toBeNull();
  expect(doc.saldoFinal).toBeNull();
  expect(doc.lineas.length).toBe(1);
});
