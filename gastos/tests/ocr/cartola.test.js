const { parseCartolaLines } = require('../../src/ocr/cartola');

test('parsea movimientos con fecha, glosa, monto y n° operación', () => {
  const raw = { movimientos: [
    { fecha: '01/06/2026', glosa: 'TRANSFERENCIA A PROVEEDOR', cargo: '150.000', abono: '', n_operacion: '8842' },
  ] };
  const lines = parseCartolaLines(raw);
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({ fecha: '2026-06-01', tipo: 'cargo', monto: 150000, n_operacion: '8842' });
});

test('cargo → tipo cargo (gasto); abono → tipo abono (ingreso)', () => {
  const raw = { movimientos: [
    { fecha: '2026-06-02', glosa: 'PAGO', cargo: '50000' },
    { fecha: '2026-06-03', glosa: 'ABONO CLIENTE', abono: '80000' },
  ] };
  const lines = parseCartolaLines(raw);
  expect(lines[0].tipo).toBe('cargo');
  expect(lines[1]).toMatchObject({ tipo: 'abono', monto: 80000 });
});

test('ignora filas sin monto o sin fecha (encabezados, saldo inicial)', () => {
  const raw = { movimientos: [
    { fecha: 'SALDO INICIAL', glosa: '', cargo: '', abono: '' },
    { fecha: '2026-06-04', glosa: 'COMPRA', cargo: '12.340' },
    { glosa: 'sin fecha', cargo: '999' },
  ] };
  expect(parseCartolaLines(raw)).toHaveLength(1);
});

test('acepta el texto del modelo con ```json y ruido alrededor', () => {
  const text = 'Aquí está:\n```json\n{ "movimientos": [ { "fecha": "05/06/2026", "glosa": "X", "cargo": "1.000" } ] }\n```';
  const lines = parseCartolaLines(text);
  expect(lines[0]).toMatchObject({ fecha: '2026-06-05', monto: 1000, tipo: 'cargo' });
});

test('extrae el rut de la contraparte cuando viene', () => {
  const raw = { movimientos: [{ fecha: '2026-06-06', glosa: 'TRANSF', abono: '200000', rut: '12.345.678-5' }] };
  expect(parseCartolaLines(raw)[0].rut).toBe('12.345.678-5');
});

test('las líneas alimentan directo al motor de match', () => {
  const { matchLine } = require('../../src/match/engine');
  const lines = parseCartolaLines({ movimientos: [{ fecha: '2026-06-01', glosa: 'PAGO SODIMAC', cargo: '30000', n_operacion: '555' }] });
  const candidatos = [{ id: 'g1', tipo: 'gasto', total: 30000, fecha: '2026-06-01', nro_operacion: '555' }];
  expect(matchLine(lines[0], candidatos).auto.id).toBe('g1');
});
