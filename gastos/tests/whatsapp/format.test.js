const { formatConfirmation, formatSummary, formatDuplicateBlock } = require('../../src/whatsapp/format');

test('formatConfirmation incluye proveedor, total formateado y categoria', () => {
  const msg = formatConfirmation({
    tipo_documento: 'boleta', proveedor: 'Copec', total: 25000, fecha: '2026-06-12',
    categoria: 'Combustible y transporte', iva: 3992,
  });
  expect(msg).toContain('Copec');
  expect(msg).toContain('$25.000');
  expect(msg).toContain('Combustible y transporte');
  expect(msg.toLowerCase()).toContain('sí');
});

test('formatSummary arma total y desglose por categoria', () => {
  const msg = formatSummary({
    periodo: 'junio 2026', total: 35000,
    porCategoria: [{ categoria: 'Combustible y transporte', total: 25000 }, { categoria: 'Otros gastos', total: 10000 }],
    count: 2,
  });
  expect(msg).toContain('junio 2026');
  expect(msg).toContain('$35.000');
  expect(msg).toContain('Combustible y transporte');
  expect(msg).toContain('$25.000');
});

test('formatDuplicateBlock avisa el duplicado con datos del existente', () => {
  const msg = formatDuplicateBlock({ proveedor: 'Sodimac', total: 11900, fecha: '2026-06-01', created_at: '2026-06-02T10:00:00Z' });
  expect(msg).toContain('Sodimac');
  expect(msg).toContain('$11.900');
  expect(msg.toLowerCase()).toContain('ya fue registrado');
});

test('formatDuplicateBlock tolera campos faltantes', () => {
  const msg = formatDuplicateBlock({});
  expect(msg).toContain('s/proveedor');
  expect(msg).toContain('$0');
  expect(msg).toContain('s/fecha');
});
