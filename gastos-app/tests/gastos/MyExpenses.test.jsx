import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import MyExpenses from '../../src/gastos/MyExpenses.jsx';
import { api } from '../../src/gastos/api';
jest.mock('../../src/gastos/api', () => ({ api: { listExpenses: jest.fn(), updateExpense: jest.fn(), annulExpense: jest.fn() } }));

beforeEach(() => { jest.clearAllMocks(); });

test('lista', async () => {
  api.listExpenses.mockResolvedValue([
    { id: 'x1', proveedor: 'Copec', total: 25000, estado: 'confirmado', categoria: 'Combustible y transporte' },
    { id: 'x2', proveedor: 'Lider', total: 10000, estado: 'pendiente_confirmacion', categoria: 'Otros gastos' },
  ]);
  render(<MyExpenses />);
  await waitFor(() => expect(screen.getByText(/Copec/)).toBeInTheDocument());
  expect(screen.getByText(/Lider/)).toBeInTheDocument();
});

test('al tocar un movimiento muestra todo el detalle (voucher, teléfono, fechas)', async () => {
  api.listExpenses.mockResolvedValue([
    { id: 'i1', tipo: 'ingreso', proveedor: 'Cliente A', total: 80000, estado: 'confirmado',
      nro_operacion: 'OP-7788', fecha: '2026-06-06', created_at: '2026-06-07T10:00:00Z',
      wa_sender_name: 'Juan', wa_sender_phone: '56999111222', canal: 'whatsapp', estado_pago: 'registrada' },
  ]);
  render(<MyExpenses />);
  await waitFor(() => expect(screen.getByText(/Cliente A/)).toBeInTheDocument());
  fireEvent.click(screen.getByText(/Cliente A/));
  await waitFor(() => expect(screen.getByText(/OP-7788/)).toBeInTheDocument());
  expect(screen.getByText(/56999111222/)).toBeInTheDocument();
  expect(screen.getByText(/2026-06-07/)).toBeInTheDocument();
  expect(screen.getByText(/Volver/)).toBeInTheDocument();
});

test('editar un movimiento llama a updateExpense', async () => {
  api.listExpenses.mockResolvedValue([{ id: 'g1', tipo: 'gasto', proveedor: 'Sodimac', total: 11900, estado: 'confirmado', categoria: 'Otros gastos' }]);
  api.updateExpense.mockResolvedValue({ id: 'g1', proveedor: 'Lider', total: 5000 });
  render(<MyExpenses />);
  await waitFor(() => expect(screen.getByText(/Sodimac/)).toBeInTheDocument());
  fireEvent.click(screen.getByText(/Sodimac/));
  await waitFor(() => expect(screen.getByText(/Editar/)).toBeInTheDocument());
  fireEvent.click(screen.getByText(/Editar/));
  const prov = await screen.findByDisplayValue('Sodimac');
  fireEvent.change(prov, { target: { value: 'Lider' } });
  fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
  await waitFor(() => expect(api.updateExpense).toHaveBeenCalledWith('g1', expect.objectContaining({ proveedor: 'Lider' })));
});

test('anular un movimiento pide confirmación y llama a annulExpense', async () => {
  api.listExpenses.mockResolvedValue([{ id: 'g2', tipo: 'gasto', proveedor: 'Sodimac', total: 11900, estado: 'confirmado' }]);
  api.annulExpense.mockResolvedValue({ id: 'g2', estado: 'anulado' });
  render(<MyExpenses />);
  await waitFor(() => expect(screen.getByText(/Sodimac/)).toBeInTheDocument());
  fireEvent.click(screen.getByText(/Sodimac/));
  await waitFor(() => expect(screen.getByText(/Anular/)).toBeInTheDocument());
  fireEvent.click(screen.getByText(/🗑️ Anular/));
  fireEvent.click(screen.getByRole('button', { name: /sí, anular/i }));
  await waitFor(() => expect(api.annulExpense).toHaveBeenCalledWith('g2'));
});
