const { construirSenales } = require('../../src/agent/senales');

const MEM_COMPLETA = [
  { contenido: 'Atiende de lunes a sábado de 9 a 18' },
  { contenido: 'Queda en Av. Siempre Viva 742' },
  { contenido: 'Acepta efectivo y transferencia' },
];

describe('construirSenales', () => {
  test('saldo negativo → primera señal es la de saldo', () => {
    const s = construirSenales({ resumen: { saldo: -5000, pendientesPago: 0, countGastos: 2, countIngresos: 1 }, memorias: MEM_COMPLETA });
    expect(s[0]).toMatch(/saldo negativo/i);
  });

  test('gastos pendientes de pago → señal con el número', () => {
    const s = construirSenales({ resumen: { saldo: 1000, pendientesPago: 3, countGastos: 5, countIngresos: 2 }, memorias: MEM_COMPLETA });
    expect(s.join(' ')).toMatch(/3 gastos confirmados sin marcar como pagados/i);
  });

  test('1 pendiente → singular', () => {
    const s = construirSenales({ resumen: { saldo: 1000, pendientesPago: 1, countGastos: 5, countIngresos: 2 }, memorias: MEM_COMPLETA });
    expect(s.join(' ')).toMatch(/1 gasto confirmado sin marcar como pagado\b/i);
  });

  test('mes sin movimientos → señal de "aún no registras"', () => {
    const s = construirSenales({ resumen: { saldo: 0, pendientesPago: 0, countGastos: 0, countIngresos: 0 }, memorias: MEM_COMPLETA });
    expect(s.join(' ')).toMatch(/aún no registras movimientos/i);
  });

  test('huecos de memoria: detecta falta de horario/dirección/pagos', () => {
    const s = construirSenales({ resumen: { saldo: 1000, pendientesPago: 0, countGastos: 3, countIngresos: 1 }, memorias: [{ contenido: 'Vende empanadas' }] });
    const txt = s.join(' | ');
    expect(txt).toMatch(/horario/i);
    expect(txt).toMatch(/dónde queda/i);
    expect(txt).toMatch(/formas de pago/i);
  });

  test('memoria con horario presente → NO sugiere horario', () => {
    const s = construirSenales({ resumen: { saldo: 1000, pendientesPago: 0, countGastos: 3, countIngresos: 1 }, memorias: [{ contenido: 'Abre de lunes a viernes' }, { contenido: 'Queda en calle Falsa 123' }, { contenido: 'Paga con tarjeta' }] });
    expect(s.join(' ')).not.toMatch(/horario/i);
  });

  test('memoria vacía → una sola señal "sé poco" (no las 3 de huecos)', () => {
    const s = construirSenales({ resumen: { saldo: 1000, pendientesPago: 0, countGastos: 3, countIngresos: 1 }, memorias: [] });
    expect(s.join(' ')).toMatch(/sé poco de tu negocio/i);
    expect(s.join(' ')).not.toMatch(/horario de atención/i);
  });

  test('negocio sano + memoria completa → []', () => {
    const s = construirSenales({ resumen: { saldo: 5000, pendientesPago: 0, countGastos: 4, countIngresos: 3 }, memorias: MEM_COMPLETA });
    expect(s).toEqual([]);
  });

  test('contexto vacío no rompe', () => {
    expect(Array.isArray(construirSenales())).toBe(true);
    expect(Array.isArray(construirSenales({}))).toBe(true);
  });
});
