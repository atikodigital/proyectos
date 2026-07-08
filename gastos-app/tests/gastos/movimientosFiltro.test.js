import { FILTRO_INICIAL, fechaDe, enPeriodo, pasaFiltros } from '../../src/gastos/movimientosFiltro';

function hoyISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

describe('movimientosFiltro', () => {
  test('FILTRO_INICIAL arranca en el mes y sin otros filtros', () => {
    expect(FILTRO_INICIAL).toMatchObject({ periodo: 'mes', tipo: 'todos', estado: 'todos', categoria: '', q: '' });
  });

  test('fechaDe usa la fecha de emisión y si no hay, la de carga', () => {
    expect(fechaDe({ fecha: '2026-07-08' })).toBe('2026-07-08');
    expect(fechaDe({ created_at: '2026-07-08T10:20:30Z' })).toBe('2026-07-08');
    expect(fechaDe({})).toBe('');
  });

  test('enPeriodo mes incluye hoy y excluye otro mes', () => {
    expect(enPeriodo({ fecha: hoyISO() }, 'mes')).toBe(true);
    expect(enPeriodo({ fecha: '2000-01-01' }, 'mes')).toBe(false);
    expect(enPeriodo({ fecha: '2000-01-01' }, 'todos')).toBe(true);
  });

  test('pasaFiltros filtra por tipo ingreso/gasto', () => {
    const ingreso = { tipo: 'ingreso', fecha: hoyISO() };
    const gasto = { tipo: 'gasto', fecha: hoyISO() };
    expect(pasaFiltros(ingreso, { ...FILTRO_INICIAL, tipo: 'ingreso' })).toBe(true);
    expect(pasaFiltros(gasto, { ...FILTRO_INICIAL, tipo: 'ingreso' })).toBe(false);
    expect(pasaFiltros(gasto, { ...FILTRO_INICIAL, tipo: 'todos' })).toBe(true);
  });

  test('pasaFiltros filtra por categoría y búsqueda', () => {
    const e = { tipo: 'gasto', fecha: hoyISO(), categoria: 'Arriendos', proveedor: 'Inmobiliaria Sur' };
    expect(pasaFiltros(e, { ...FILTRO_INICIAL, categoria: 'Arriendos' })).toBe(true);
    expect(pasaFiltros(e, { ...FILTRO_INICIAL, categoria: 'Comida' })).toBe(false);
    expect(pasaFiltros(e, { ...FILTRO_INICIAL, q: 'inmobiliaria' })).toBe(true);
    expect(pasaFiltros(e, { ...FILTRO_INICIAL, q: 'zzz' })).toBe(false);
  });
});
