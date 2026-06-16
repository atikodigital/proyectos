// gastos/tests/match/conciliacion-informe.test.js
const { construirInforme } = require('../../src/match/conciliacion');

const libroAux = [{ id: 'e1', tipo: 'gasto', total: 11900, fecha: '2026-06-10', proveedor: 'Sodimac', nro_operacion: '555' }];
const cartola = {
  lineas: [
    { fecha: '2026-06-10', tipo: 'cargo', monto: 11900, glosa: 'PAGO SODIMAC', n_operacion: '555' },
    { fecha: '2026-06-15', tipo: 'cargo', monto: 1900, glosa: 'COMISION MANTENCION', n_operacion: '' },
  ],
  saldoInicial: 100000, saldoFinal: 86200,
};

test('construirInforme combina determinístico + IA (inyectada) + saldos', async () => {
  const fakeComponer = async () => ({
    reconciliation_status: 'con_diferencias',
    matched_transactions: [{ linea_idx: 0, expenseId: 'e1' }],
    reconciling_items_in_transit: [],
    suggested_journal_entries: [{ descripcion: 'Comisión mantención', tipo: 'nota_debito', monto: 1900, fecha: '2026-06-15', cuentaClaveDebe: 'gastos_financieros', cuentaClaveHaber: 'banco' }],
    exceptions_for_review: [],
  });
  const inf = await construirInforme({ cartola, libroAuxiliar: libroAux, bancoContable: 88100 }, { componer: fakeComponer });
  expect(inf.suggested.length).toBe(1);
  expect(inf.suggested[0].id).toBeTruthy();           // se le asigna id estable
  expect(inf.sca).toBe(88100 - 1900);                 // banco contable - nota debito
  expect(inf.sba).toBe(86200);                        // sin tránsitos
  expect(inf.cuadrado).toBe(true);
  expect(inf.fuente).toBe('ia');
});

test('si la IA falla, cae a determinístico (fuente=deterministico, sin suggested)', async () => {
  const componerFalla = async () => { throw new Error('ia_down'); };
  const inf = await construirInforme({ cartola, libroAuxiliar: libroAux, bancoContable: 88100 }, { componer: componerFalla });
  expect(inf.fuente).toBe('deterministico');
  expect(Array.isArray(inf.suggested)).toBe(true);
  expect(inf.matched.length).toBeGreaterThanOrEqual(1); // el match exacto e1/555 igual aparece
});

test('descarta matched con expenseId que no pertenece al libro auxiliar', async () => {
  const fakeComponer = async () => ({ reconciliation_status: 'x', matched_transactions: [{ linea_idx: 0, expenseId: 'FANTASMA' }, { linea_idx: 0, expenseId: 'e1' }], reconciling_items_in_transit: [], suggested_journal_entries: [], exceptions_for_review: [] });
  const inf = await construirInforme({ cartola, libroAuxiliar: libroAux, bancoContable: 88100 }, { componer: fakeComponer });
  expect(inf.matched.every((m) => m.expenseId === 'e1')).toBe(true);
  expect(inf.matched.find((m) => m.expenseId === 'FANTASMA')).toBeFalsy();
});
