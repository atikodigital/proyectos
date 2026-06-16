// gastos/src/panel/excel-contabilidad.js
// Workbooks Excel de los libros contables de VARAS. Reusa exceljs (ya es dependencia).
const ExcelJS = require('exceljs');

function _num(n) { return Math.round(Number(n) || 0); }

async function buildDiarioWorkbook(asientos = []) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Libro Diario');
  ws.columns = [
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Glosa', key: 'glosa', width: 30 },
    { header: 'Cuenta', key: 'cuenta', width: 28 },
    { header: 'Código', key: 'codigo', width: 12 },
    { header: 'Debe', key: 'debe', width: 14 },
    { header: 'Haber', key: 'haber', width: 14 },
  ];
  for (const a of asientos) {
    for (const l of (a.lineas || [])) {
      ws.addRow({ fecha: a.fecha, glosa: a.glosa, cuenta: l.cuenta_nombre, codigo: l.codigo, debe: _num(l.debe), haber: _num(l.haber) });
    }
  }
  return wb;
}

async function buildMayorWorkbook(cuentas = []) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Libro Mayor');
  ws.columns = [
    { header: 'Código', key: 'codigo', width: 12 },
    { header: 'Cuenta', key: 'nombre', width: 30 },
    { header: 'Debe', key: 'debe', width: 14 },
    { header: 'Haber', key: 'haber', width: 14 },
    { header: 'Saldo', key: 'saldo', width: 14 },
  ];
  for (const c of cuentas) ws.addRow({ codigo: c.codigo, nombre: c.nombre, debe: _num(c.debe), haber: _num(c.haber), saldo: _num(c.saldo) });
  return wb;
}

async function buildBalanceWorkbook(balance = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Balance');
  ws.columns = [
    { header: 'Código', key: 'codigo', width: 12 },
    { header: 'Cuenta', key: 'nombre', width: 30 },
    { header: 'Debe', key: 'debe', width: 14 },
    { header: 'Haber', key: 'haber', width: 14 },
    { header: 'Deudor', key: 'deudor', width: 14 },
    { header: 'Acreedor', key: 'acreedor', width: 14 },
  ];
  for (const c of (balance.cuentas || [])) {
    ws.addRow({ codigo: c.codigo, nombre: c.nombre, debe: _num(c.debe), haber: _num(c.haber), deudor: _num(c.deudor), acreedor: _num(c.acreedor) });
  }
  ws.addRow({ nombre: 'TOTALES', debe: _num(balance.totalDebe), haber: _num(balance.totalHaber) });
  return wb;
}

async function buildFlujoWorkbook(flujo = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Flujo de Caja');
  ws.columns = [
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Glosa', key: 'glosa', width: 32 },
    { header: 'Entrada', key: 'entrada', width: 14 },
    { header: 'Salida', key: 'salida', width: 14 },
  ];
  for (const m of (flujo.movimientos || [])) ws.addRow({ fecha: m.fecha, glosa: m.glosa, entrada: _num(m.entrada), salida: _num(m.salida) });
  ws.addRow({ glosa: 'NETO', entrada: _num(flujo.entradas), salida: _num(flujo.salidas) });
  return wb;
}

module.exports = { buildDiarioWorkbook, buildMayorWorkbook, buildBalanceWorkbook, buildFlujoWorkbook };
