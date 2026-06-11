const ExcelJS = require('exceljs');
const { buildExpensesWorkbook } = require('../src/panel/excel');

test('excel incluye columnas v2 y mapea los datos', async () => {
  const buf = await buildExpensesWorkbook([{
    tipo: 'ingreso', fecha: '2026-06-01', created_at: '2026-06-02T10:00:00Z',
    empleado_nombre: 'Jose', proveedor: 'Cliente A', rut_emisor: '', folio: '',
    nro_operacion: 'OP-9', tipo_documento: 'transferencia', categoria: 'Ingreso',
    cuenta_sii_codigo: '', neto: 0, iva: 0, total: 50000, estado: 'confirmado',
    estado_pago: 'registrada', wa_sender_name: 'Juan', wa_sender_phone: '56999',
  }]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet('Gastos');
  const headers = ws.getRow(1).values.filter(Boolean);
  expect(headers).toEqual(expect.arrayContaining([
    'Tipo', 'Fecha emisión', 'Fecha carga', 'Empleado', 'N° operación', 'Estado pago', 'Enviado por (WA)',
  ]));
  const row2 = {};
  ws.getRow(1).eachCell((cell, col) => { row2[cell.value] = ws.getRow(2).getCell(col).value; });
  expect(row2['Tipo']).toBe('ingreso');
  expect(row2['Empleado']).toBe('Jose');
  expect(row2['Fecha carga']).toBe('2026-06-02');
  expect(row2['Enviado por (WA)']).toBe('Juan · 56999');
  expect(Number(row2['Total'])).toBe(50000);
});
