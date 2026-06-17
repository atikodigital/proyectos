import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AsientoManual from '../../src/gastos/AsientoManual.jsx';
import { api } from '../../src/gastos/api';
jest.mock('../../src/gastos/api');

beforeEach(() => {
  api.listCuentasApp = jest.fn().mockResolvedValue({ cuentas: [
    { id: 'c1', codigo: '1.1.10.2', nombre: 'Banco' }, { id: 'c2', codigo: '4.5.10.1', nombre: 'Gastos Financieros' },
  ] });
  api.crearAsientoManual = jest.fn().mockResolvedValue({ asiento: { id: 'a1' } });
});

test('no guarda mientras no cuadra; guarda cuando Σdebe==Σhaber', async () => {
  const onSaved = jest.fn();
  render(<AsientoManual onSaved={onSaved} />);
  await screen.findAllByText(/Banco/); // cuentas cargadas en los selects
  // fila 0: debe 5000 en c1 ; fila 1: haber 5000 en c2
  fireEvent.change(screen.getByLabelText('cuenta-0'), { target: { value: 'c1' } });
  fireEvent.change(screen.getByLabelText('debe-0'), { target: { value: '5000' } });
  fireEvent.change(screen.getByLabelText('cuenta-1'), { target: { value: 'c2' } });
  fireEvent.change(screen.getByLabelText('haber-1'), { target: { value: '5000' } });
  const guardar = screen.getByRole('button', { name: /guardar/i });
  expect(guardar).not.toBeDisabled();
  fireEvent.click(guardar);
  await waitFor(() => expect(api.crearAsientoManual).toHaveBeenCalled());
  const arg = api.crearAsientoManual.mock.calls[0][0];
  expect(arg.lineas.length).toBe(2);
  expect(onSaved).toHaveBeenCalled();
});

test('botón guardar deshabilitado si descuadra', async () => {
  render(<AsientoManual onSaved={() => {}} />);
  await screen.findAllByText(/Banco/);
  fireEvent.change(screen.getByLabelText('debe-0'), { target: { value: '5000' } });
  fireEvent.change(screen.getByLabelText('haber-1'), { target: { value: '4000' } });
  expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled();
});
