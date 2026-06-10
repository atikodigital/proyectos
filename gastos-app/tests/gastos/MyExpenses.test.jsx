import { render, screen, waitFor } from '@testing-library/react';
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
