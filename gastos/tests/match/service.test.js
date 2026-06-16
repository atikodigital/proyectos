const { conciliarCartola } = require('../../src/match/service');

const G = (o) => ({
  id: o.id, tipo: o.tipo || 'gasto', total: o.total, fecha: o.fecha,
  proveedor: o.proveedor, rut_emisor: o.rut_emisor, nro_operacion: o.nro_operacion,
  estado_pago: o.estado_pago || 'pendiente',
});

test('línea con n° de operación exacto va a conciliadas', () => {
  const lineas = [{ fecha: '2026-06-01', monto: 50000, tipo: 'cargo', n_operacion: '777' }];
  const expenses = [G({ id: 'g1', total: 50000, fecha: '2026-06-01', nro_operacion: '777' })];
  const r = conciliarCartola(lineas, expenses);
  expect(r.conciliadas).toHaveLength(1);
  expect(r.conciliadas[0].gasto.id).toBe('g1');
});

test('una transferencia que paga varias facturas va a pagosMasivos', () => {
  const lineas = [{ fecha: '2026-06-30', monto: 1500000, tipo: 'cargo', rut: '76123456-7', glosa: 'PAGO HARINAS SA' }];
  const expenses = [
    G({ id: 'f1', total: 500000, fecha: '2026-06-01', rut_emisor: '76123456-7' }),
    G({ id: 'f2', total: 1000000, fecha: '2026-06-10', rut_emisor: '76123456-7' }),
  ];
  const r = conciliarCartola(lineas, expenses);
  expect(r.pagosMasivos).toHaveLength(1);
  expect(r.pagosMasivos[0].grupo.map((g) => g.id).sort()).toEqual(['f1', 'f2']);
});

test('línea con un candidato parcial va a sugeridas', () => {
  const lineas = [{ fecha: '2026-06-01', monto: 50000, tipo: 'cargo' }];
  const expenses = [G({ id: 'g1', total: 50000, fecha: '2026-06-02' })];
  const r = conciliarCartola(lineas, expenses);
  expect(r.sugeridas).toHaveLength(1);
  expect(r.sugeridas[0].candidatos.map((g) => g.id)).toContain('g1');
});

test('línea sin candidatos va a sinMatch', () => {
  const r = conciliarCartola([{ fecha: '2026-06-01', monto: 99999, tipo: 'cargo' }], []);
  expect(r.sinMatch).toHaveLength(1);
});

test('no reutiliza un gasto ya conciliado en otra línea', () => {
  const lineas = [
    { fecha: '2026-06-01', monto: 50000, tipo: 'cargo', n_operacion: '777' },
    { fecha: '2026-06-01', monto: 50000, tipo: 'cargo' },
  ];
  const expenses = [G({ id: 'g1', total: 50000, fecha: '2026-06-01', nro_operacion: '777' })];
  const r = conciliarCartola(lineas, expenses);
  expect(r.conciliadas).toHaveLength(1);
  expect(r.sinMatch).toHaveLength(1);
});
