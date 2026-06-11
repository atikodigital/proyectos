import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import MyExpenses from '../../src/gastos/MyExpenses.jsx';
import { api } from '../../src/gastos/api';
jest.mock('../../src/gastos/api', () => ({ api: { listExpenses: jest.fn() } }));

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
