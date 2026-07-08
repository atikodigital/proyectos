import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PersonalDashboard from '../../src/gastos/PersonalDashboard.jsx';
import { api } from '../../src/gastos/api';

jest.mock('../../src/gastos/api', () => ({ api: {
  listExpenses: jest.fn(),
  personalResumen: jest.fn(),
} }));

// Mismo formato que el componente → robusto ante el locale de Node.
const clp = (n) => '$' + Math.round(n).toLocaleString('es-CL');

function hoyISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

beforeEach(() => jest.clearAllMocks());

test('muestra ingresos, gastos y balance del mes (sin contar meses viejos)', async () => {
  const hoy = hoyISO();
  api.listExpenses.mockResolvedValue([
    { id: 1, tipo: 'ingreso', total: 800000, fecha: hoy },
    { id: 2, tipo: 'gasto', total: 200000, fecha: hoy, categoria: 'Arriendos', proveedor: 'Inmob' },
    { id: 3, tipo: 'gasto', total: 50000, fecha: hoy, categoria: 'Comida', proveedor: 'Super' },
    { id: 4, tipo: 'gasto', total: 999999, fecha: '2000-01-01', proveedor: 'Viejo' }, // otro mes → no cuenta
  ]);
  // Valores del resumen distintos a los del mes para no confundir aserciones.
  api.personalResumen.mockResolvedValue({ sueldo_mensual: 1000000, disponible: 123456, gastado_mes: 42, porcentaje_gastado: 31, dias_restantes_mes: 10 });

  render(<PersonalDashboard />);

  expect(await screen.findByText(clp(800000))).toBeInTheDocument(); // Ingresos del mes
  expect(screen.getByText(clp(250000))).toBeInTheDocument();        // Gastos del mes (200k + 50k)
  // Balance (800k - 250k) aparece en la tarjeta Balance y en el total del filtro.
  expect(screen.getAllByText(clp(550000)).length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText(clp(123456))).toBeInTheDocument();        // Disponible (presupuesto)
});

test('el filtro por tipo=ingreso deja solo los ingresos en la lista', async () => {
  const hoy = hoyISO();
  api.listExpenses.mockResolvedValue([
    { id: 1, tipo: 'ingreso', total: 800000, fecha: hoy },
    { id: 2, tipo: 'gasto', total: 200000, fecha: hoy, categoria: 'Arriendos', proveedor: 'Inmob' },
  ]);
  api.personalResumen.mockRejectedValue(new Error('no personal'));

  render(<PersonalDashboard />);
  expect(await screen.findByText('Inmob')).toBeInTheDocument();

  // Abre el panel de filtros y cambia el tipo a "ingreso".
  fireEvent.click(screen.getByText(/⚙/));
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'ingreso' } });

  await waitFor(() => expect(screen.queryByText('Inmob')).toBeNull());
});
