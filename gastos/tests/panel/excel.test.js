const ExcelJS = require('exceljs');
const { buildExpensesWorkbook } = require('../../src/panel/excel');

test('arma un xlsx con header y una fila por gasto', async () => {
  const buf = await buildExpensesWorkbook([
    { fecha: '2026-06-05', empleado: 'Juan', proveedor: 'Copec', rut_emisor: '76086428-5', folio: '123',
      tipo_documento: 'boleta', categoria: 'Combustible y transporte', cuenta_sii_codigo: '4.3.150.1',
      neto: 21008, iva: 3992, total: 25000, estado: 'confirmado' },
  ]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  // build header→col map
  const colOf = {};
  ws.getRow(1).eachCell((cell, col) => { colOf[cell.value] = col; });
  expect(colOf['Tipo']).toBeDefined();
  expect(colOf['Proveedor/Pagador']).toBeDefined();
  const row2 = ws.getRow(2);
  expect(row2.getCell(colOf['Proveedor/Pagador']).value).toBe('Copec');
  expect(Number(row2.getCell(colOf['Total']).value)).toBe(25000);
});
