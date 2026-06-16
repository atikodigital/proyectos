import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ContabilidadView from '../../src/gastos/ContabilidadView.jsx';
import { api } from '../../src/gastos/api';

jest.mock('../../src/gastos/api');
// MatchView hace fetch/Capacitor; lo simplificamos para el test de ContabilidadView.
jest.mock('../../src/gastos/MatchView.jsx', () => () => <div>MatchViewMock</div>);

beforeEach(() => {
  api.contabilidadBalance = jest.fn().mockResolvedValue({ cuentas: [{ codigo: '1.1.10.2', nombre: 'Banco', deudor: 0, acreedor: 11900 }], totalDebe: 11900, totalHaber: 11900, cuadrado: true });
  api.contabilidadDiario = jest.fn().mockResolvedValue({ asientos: [{ fecha: '2026-06-10', glosa: 'Gasto · Sodimac', lineas: [{ cuenta_nombre: 'Gastos Generales', debe: 10000, haber: 0 }] }] });
  api.contabilidadMayor = jest.fn().mockResolvedValue({ cuentas: [] });
  api.contabilidadFlujo = jest.fn().mockResolvedValue({ entradas: 0, salidas: 11900, neto: -11900, movimientos: [] });
});

test('muestra el encabezado VARAS y arranca en Conciliación (MatchView)', () => {
  render(<ContabilidadView />);
  expect(screen.getByText(/VARAS/i)).toBeInTheDocument();
  expect(screen.getByText('MatchViewMock')).toBeInTheDocument();
});

test('al tocar Balance carga y muestra el cuadre', async () => {
  render(<ContabilidadView />);
  fireEvent.click(screen.getByRole('button', { name: /balance/i }));
  await waitFor(() => expect(api.contabilidadBalance).toHaveBeenCalled());
  expect(await screen.findByText(/cuadrado/i)).toBeInTheDocument();
});

test('al tocar Diario carga los asientos', async () => {
  render(<ContabilidadView />);
  fireEvent.click(screen.getByRole('button', { name: /diario/i }));
  await waitFor(() => expect(api.contabilidadDiario).toHaveBeenCalled());
  expect(await screen.findByText(/Gastos Generales/)).toBeInTheDocument();
});
