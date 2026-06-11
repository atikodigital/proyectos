const PanelLib = require('../../public/panel/lib');

test('cashflowFromRows separa gastos e ingresos y calcula saldo', () => {
  const c = PanelLib.cashflowFromRows([
    { tipo: 'ingreso', total: 50000 },
    { tipo: 'gasto', total: 11900 },
    { tipo: 'gasto', total: 3000 },
  ]);
  expect(c.ingresos).toBe(50000);
  expect(c.gastos).toBe(14900);
  expect(c.saldo).toBe(35100);
});

test('expensesTableHtml muestra columna Tipo, nombre de empleado y botón pagar', () => {
  const html = PanelLib.expensesTableHtml([
    { id: 'a1', tipo: 'gasto', fecha: '2026-06-01', empleado_nombre: 'Juan', proveedor: 'Sodimac', total: 11900, estado: 'confirmado', estado_pago: 'registrada' },
  ]);
  expect(html).toContain('Tipo');
  expect(html).toContain('Juan');
  expect(html).toContain('data-pay="a1"');
  expect(html).toContain('Marcar pagada');
});

test('expensesTableHtml: gasto pagado no muestra botón; ingreso muestra raya', () => {
  const pagado = PanelLib.expensesTableHtml([{ id: 'a', tipo: 'gasto', estado_pago: 'pagada', total: 1000 }]);
  expect(pagado).toContain('Pagada');
  expect(pagado).not.toContain('data-pay');
  const ingreso = PanelLib.expensesTableHtml([{ id: 'b', tipo: 'ingreso', total: 5000 }]);
  expect(ingreso).not.toContain('data-pay');
});

test('expensesTableHtml: las filas son clickeables (exp-row + data-id)', () => {
  const html = PanelLib.expensesTableHtml([{ id: 'a1', tipo: 'gasto', total: 1000 }]);
  expect(html).toContain('class="exp-row" data-id="a1"');
});

test('detalleHtml muestra todos los campos (voucher, teléfono, fechas)', () => {
  const html = PanelLib.detalleHtml({
    id: 'i1', tipo: 'ingreso', proveedor: 'Cliente A', total: 80000, nro_operacion: 'OP-7788',
    fecha: '2026-06-06', created_at: '2026-06-07T10:00:00Z', wa_sender_name: 'Juan',
    wa_sender_phone: '56999111222', empleado_nombre: 'Jose', estado: 'confirmado', estado_pago: 'registrada',
  });
  expect(html).toContain('OP-7788');
  expect(html).toContain('56999111222');
  expect(html).toContain('2026-06-07');
  expect(html).toContain('Pagador / origen');
  expect(html).toContain('Cliente A');
});
