// gastos/tests/panel/excel-contabilidad.test.js
const x = require('../../src/panel/excel-contabilidad');

test('buildDiarioWorkbook arma una hoja con una fila por línea de asiento', async () => {
  const asientos = [
    { fecha: '2026-06-10', glosa: 'Gasto · Sodimac', tipo_asiento: 'devengo',
      lineas: [
        { codigo: '4.3.10.1', cuenta_nombre: 'Gastos Generales', debe: 10000, haber: 0 },
        { codigo: '2.1.10.1', cuenta_nombre: 'Proveedores', debe: 0, haber: 11900 },
        { codigo: '1.1.40.1', cuenta_nombre: 'IVA Crédito', debe: 1900, haber: 0 },
      ] },
  ];
  const wb = await x.buildDiarioWorkbook(asientos);
  const ws = wb.getWorksheet('Libro Diario');
  expect(ws).toBeTruthy();
  // encabezado + 3 líneas
  expect(ws.rowCount).toBe(4);
});

test('buildBalanceWorkbook incluye fila de totales', async () => {
  const balance = { cuentas: [
    { codigo: '1.1.10.2', nombre: 'Banco', debe: 0, haber: 11900, deudor: 0, acreedor: 11900 },
    { codigo: '4.3.10.1', nombre: 'Gastos Generales', debe: 10000, haber: 0, deudor: 10000, acreedor: 0 },
  ], totalDebe: 10000, totalHaber: 11900, cuadrado: false };
  const wb = await x.buildBalanceWorkbook(balance);
  const ws = wb.getWorksheet('Balance');
  expect(ws).toBeTruthy();
  expect(ws.rowCount).toBeGreaterThanOrEqual(4); // encabezado + 2 cuentas + totales
});

test('buildMayorWorkbook y buildFlujoWorkbook devuelven workbook', async () => {
  const wbM = await x.buildMayorWorkbook([{ codigo: '1.1.10.2', nombre: 'Banco', debe: 0, haber: 11900, saldo: -11900 }]);
  expect(wbM.getWorksheet('Libro Mayor')).toBeTruthy();
  const wbF = await x.buildFlujoWorkbook({ entradas: 0, salidas: 11900, neto: -11900, movimientos: [{ fecha: '2026-06-15', glosa: 'Banco', entrada: 0, salida: 11900 }] });
  expect(wbF.getWorksheet('Flujo de Caja')).toBeTruthy();
});
