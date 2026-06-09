const ExcelJS = require('exceljs');

const COLUMNS = [
  { header: 'Fecha', key: 'fecha', width: 12 },
  { header: 'Empleado', key: 'empleado', width: 18 },
  { header: 'Proveedor', key: 'proveedor', width: 22 },
  { header: 'RUT', key: 'rut_emisor', width: 14 },
  { header: 'Folio', key: 'folio', width: 12 },
  { header: 'Tipo', key: 'tipo_documento', width: 10 },
  { header: 'Categoría', key: 'categoria', width: 26 },
  { header: 'Cuenta SII', key: 'cuenta_sii_codigo', width: 12 },
  { header: 'Neto', key: 'neto', width: 12 },
  { header: 'IVA', key: 'iva', width: 12 },
  { header: 'Total', key: 'total', width: 12 },
  { header: 'Estado', key: 'estado', width: 18 },
];

async function buildExpensesWorkbook(expenses = []) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Gastos');
  ws.columns = COLUMNS;
  ws.getRow(1).font = { bold: true };
  for (const e of expenses) {
    ws.addRow({
      fecha: e.fecha || '',
      empleado: e.empleado || e.employee_id || '',
      proveedor: e.proveedor || '',
      rut_emisor: e.rut_emisor || '',
      folio: e.folio || '',
      tipo_documento: e.tipo_documento || '',
      categoria: e.categoria || '',
      cuenta_sii_codigo: e.cuenta_sii_codigo || '',
      neto: Number(e.neto) || 0,
      iva: Number(e.iva) || 0,
      total: Number(e.total) || 0,
      estado: e.estado || '',
    });
  }
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

module.exports = { buildExpensesWorkbook, COLUMNS };
