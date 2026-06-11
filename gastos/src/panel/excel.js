const ExcelJS = require('exceljs');

const COLUMNS = [
  { header: 'Tipo', key: 'tipo', width: 10 },
  { header: 'Fecha emisión', key: 'fecha', width: 13 },
  { header: 'Fecha carga', key: 'fecha_carga', width: 13 },
  { header: 'Empleado', key: 'empleado', width: 18 },
  { header: 'Proveedor/Pagador', key: 'proveedor', width: 24 },
  { header: 'RUT', key: 'rut_emisor', width: 14 },
  { header: 'Folio', key: 'folio', width: 12 },
  { header: 'N° operación', key: 'nro_operacion', width: 14 },
  { header: 'Doc', key: 'tipo_documento', width: 12 },
  { header: 'Categoría', key: 'categoria', width: 26 },
  { header: 'Cuenta SII', key: 'cuenta_sii_codigo', width: 12 },
  { header: 'Neto', key: 'neto', width: 12 },
  { header: 'IVA', key: 'iva', width: 12 },
  { header: 'Total', key: 'total', width: 12 },
  { header: 'Estado', key: 'estado', width: 16 },
  { header: 'Estado pago', key: 'estado_pago', width: 14 },
  { header: 'Enviado por (WA)', key: 'wa_sender', width: 22 },
];

function fechaCarga(v) {
  if (!v) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return s.slice(0, 10);
}

async function buildExpensesWorkbook(expenses = []) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Gastos');
  ws.columns = COLUMNS;
  ws.getRow(1).font = { bold: true };
  for (const e of expenses) {
    ws.addRow({
      tipo: e.tipo || 'gasto',
      fecha: e.fecha || '',
      fecha_carga: fechaCarga(e.created_at),
      empleado: e.empleado_nombre || e.empleado || e.employee_id || '',
      proveedor: e.proveedor || '',
      rut_emisor: e.rut_emisor || '',
      folio: e.folio || '',
      nro_operacion: e.nro_operacion || '',
      tipo_documento: e.tipo_documento || '',
      categoria: e.categoria || '',
      cuenta_sii_codigo: e.cuenta_sii_codigo || '',
      neto: Number(e.neto) || 0,
      iva: Number(e.iva) || 0,
      total: Number(e.total) || 0,
      estado: e.estado || '',
      estado_pago: e.estado_pago || '',
      wa_sender: [e.wa_sender_name, e.wa_sender_phone].filter(Boolean).join(' · '),
    });
  }
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

module.exports = { buildExpensesWorkbook, COLUMNS };
