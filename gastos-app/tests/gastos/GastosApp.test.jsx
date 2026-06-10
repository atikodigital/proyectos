import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GastosApp from '../../src/gastos/GastosApp.jsx';
import { api } from '../../src/gastos/api';
import { setToken, clearToken } from '../../src/gastos/session';

jest.mock('../../src/gastos/api', () => ({ api: { createExpense: jest.fn(), listExpenses: jest.fn().mockResolvedValue([]) } }));
jest.mock('../../src/components/EvidenceIntake.jsx', () => ({
  __esModule: true,
  default: ({ onChange }) => (
    <button onClick={() => onChange([{ imageBase64: 'B64', imageMimeType: 'image/jpeg' }])}>fake-capture</button>
  ),
}));

beforeEach(() => clearToken());

test('sin token muestra login', () => {
  render(<GastosApp />);
  expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument();
});

test('con token: capturar crea gasto y pasa a confirmar', async () => {
  setToken('TK');
  api.createExpense.mockResolvedValue({ id: 'x1', proveedor: 'Copec', total: 25000, estado: 'pendiente_confirmacion' });
  render(<GastosApp />);
  fireEvent.click(screen.getByText('fake-capture'));
  await waitFor(() => expect(api.createExpense).toHaveBeenCalledWith('B64', 'image/jpeg'));
  expect(await screen.findByText(/Revisa el gasto/i)).toBeInTheDocument();
});
