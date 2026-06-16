const { scoreMatch, matchLine, matchBulkPayment } = require('../../src/match/engine');

describe('scoreMatch (1 a 1)', () => {
  test('n° de operación idéntico da match fuerte', () => {
    const linea = { fecha: '2026-06-01', monto: 50000, tipo: 'cargo', n_operacion: '123456' };
    const gasto = { tipo: 'gasto', total: 50000, fecha: '2026-06-01', nro_operacion: '123456' };
    expect(scoreMatch(linea, gasto).score).toBeGreaterThanOrEqual(100);
  });

  test('dirección opuesta (cargo en cartola vs ingreso) no matchea', () => {
    const linea = { fecha: '2026-06-01', monto: 50000, tipo: 'cargo' };
    const ingreso = { tipo: 'ingreso', total: 50000, fecha: '2026-06-01' };
    expect(scoreMatch(linea, ingreso).score).toBe(0);
  });

  test('glosa que contiene el proveedor suma al score', () => {
    const linea = { fecha: '2026-06-02', monto: 30000, tipo: 'cargo', glosa: 'COMPRA SODIMAC LAS CONDES' };
    const gasto = { tipo: 'gasto', total: 30000, fecha: '2026-06-01', proveedor: 'Sodimac' };
    const conGlosa = scoreMatch(linea, gasto).score;
    const sinGlosa = scoreMatch({ ...linea, glosa: 'COMPRA XYZ' }, gasto).score;
    expect(conGlosa).toBeGreaterThan(sinGlosa);
  });
});

describe('matchLine (mejor candidato)', () => {
  test('auto-concilia cuando el n° de operación coincide', () => {
    const linea = { fecha: '2026-06-01', monto: 50000, tipo: 'cargo', n_operacion: '999' };
    const candidatos = [
      { id: 'a', tipo: 'gasto', total: 50000, fecha: '2026-06-01', nro_operacion: '999' },
      { id: 'b', tipo: 'gasto', total: 50000, fecha: '2026-06-01', nro_operacion: '111' },
    ];
    expect(matchLine(linea, candidatos).auto.id).toBe('a');
  });

  test('solo monto+fecha queda como sugerencia, no auto', () => {
    const linea = { fecha: '2026-06-01', monto: 50000, tipo: 'cargo' };
    const candidatos = [{ id: 'a', tipo: 'gasto', total: 50000, fecha: '2026-06-02' }];
    const r = matchLine(linea, candidatos);
    expect(r.auto).toBeNull();
    expect(r.sugerencias.map((g) => g.id)).toContain('a');
  });
});

describe('matchBulkPayment (pago masivo real)', () => {
  const linea = { fecha: '2026-06-30', monto: 1500000, tipo: 'cargo', rut: '76123456-7', glosa: 'PAGO PROVEEDOR HARINAS SA' };

  test('propone las facturas pendientes del proveedor que suman el pago', () => {
    const candidatos = [
      { id: 'f1', tipo: 'gasto', total: 500000, fecha: '2026-06-01', rut_emisor: '76123456-7', estado_pago: 'pendiente' },
      { id: 'f2', tipo: 'gasto', total: 1000000, fecha: '2026-06-10', rut_emisor: '76123456-7', estado_pago: 'pendiente' },
    ];
    const r = matchBulkPayment(linea, candidatos);
    expect(r.grupo.map((g) => g.id).sort()).toEqual(['f1', 'f2']);
    expect(r.confianza).toBe('alta');
  });

  test('NO incluye facturas de otro proveedor aunque cuadren', () => {
    const candidatos = [
      { id: 'f1', tipo: 'gasto', total: 500000, fecha: '2026-06-01', rut_emisor: '76123456-7', estado_pago: 'pendiente' },
      { id: 'x', tipo: 'gasto', total: 1000000, fecha: '2026-06-10', rut_emisor: '99999999-9', proveedor: 'Otro', estado_pago: 'pendiente' },
    ];
    expect(matchBulkPayment(linea, candidatos).grupo).toBeNull();
  });

  test('ignora facturas ya conciliadas', () => {
    const candidatos = [
      { id: 'f1', tipo: 'gasto', total: 500000, fecha: '2026-06-01', rut_emisor: '76123456-7', estado_pago: 'conciliado' },
      { id: 'f2', tipo: 'gasto', total: 1000000, fecha: '2026-06-10', rut_emisor: '76123456-7', estado_pago: 'pendiente' },
    ];
    expect(matchBulkPayment(linea, candidatos).grupo).toBeNull();
  });

  test('marca ambigüedad cuando hay más de un grupo posible', () => {
    const pago = { fecha: '2026-06-30', monto: 1000000, tipo: 'cargo', rut: '76123456-7', glosa: 'PAGO' };
    const candidatos = [
      { id: 'a', tipo: 'gasto', total: 1000000, fecha: '2026-06-01', rut_emisor: '76123456-7', estado_pago: 'pendiente' },
      { id: 'b', tipo: 'gasto', total: 500000, fecha: '2026-06-05', rut_emisor: '76123456-7', estado_pago: 'pendiente' },
      { id: 'c', tipo: 'gasto', total: 500000, fecha: '2026-06-06', rut_emisor: '76123456-7', estado_pago: 'pendiente' },
    ];
    const r = matchBulkPayment(pago, candidatos);
    expect(r.ambiguo).toBe(true);
    expect(r.confianza).toBe('media');
  });

  test('tolera diferencia por nota de crédito / retención', () => {
    const pago = { fecha: '2026-06-30', monto: 950000, tipo: 'cargo', rut: '76123456-7', glosa: 'PAGO' };
    const candidatos = [
      { id: 'f1', tipo: 'gasto', total: 500000, fecha: '2026-06-01', rut_emisor: '76123456-7', estado_pago: 'pendiente' },
      { id: 'f2', tipo: 'gasto', total: 500000, fecha: '2026-06-10', rut_emisor: '76123456-7', estado_pago: 'pendiente' },
    ];
    const r = matchBulkPayment(pago, candidatos, { toleranciaPct: 0.1 });
    expect(r.grupo.map((g) => g.id).sort()).toEqual(['f1', 'f2']);
  });
});
