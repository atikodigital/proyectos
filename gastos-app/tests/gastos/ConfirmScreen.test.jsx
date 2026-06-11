import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConfirmScreen from '../../src/gastos/ConfirmScreen.jsx';
import { api } from '../../src/gastos/api';
jest.mock('../../src/gastos/api', () => ({ api: { confirmExpense: jest.fn(), rejectExpense: jest.fn(), updateExpense: jest.fn() } }));
const exp = { id: 'x1', tipo: 'gasto', proveedor: 'Copec', total: 25000, categoria: 'Combustible y transporte', fecha: '2026-06-12', iva: 3992, tipo_documento: 'boleta' };

test('confirma', async () => {
  api.confirmExpense.mockResolvedValue({ ...exp, estado: 'confirmado' });
  const onDone = jest.fn();
  render(<ConfirmScreen expense={exp} onDone={onDone} />);
  expect(screen.getByText(/Copec/)).toBeInTheDocument();
  expect(screen.getByText(/25\.000/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /confirmar|guardar/i }));
  await waitFor(() => expect(api.confirmExpense).toHaveBeenCalledWith('x1'));
  await waitFor(() => expect(onDone).toHaveBeenCalled());
});

test('descarta', async () => {
  api.rejectExpense.mockResolvedValue({ ...exp, estado: 'rechazado' });
  render(<ConfirmScreen expense={exp} onDone={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /descartar/i }));
  await waitFor(() => expect(api.rejectExpense).toHaveBeenCalledWith('x1'));
});

test('muestra badge GASTO y permite cambiar a ingreso', async () => {
  api.updateExpense.mockResolvedValue({ ...exp, tipo: 'ingreso' });
  render(<ConfirmScreen expense={exp} onDone={jest.fn()} />);
  expect(screen.getByText(/GASTO/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /es un ingreso/i }));
  await waitFor(() => expect(api.updateExpense).toHaveBeenCalledWith('x1', { tipo: 'ingreso' }));
  await waitFor(() => expect(screen.getByText(/INGRESO/)).toBeInTheDocument());
});
