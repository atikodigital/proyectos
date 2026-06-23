import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GastosApp from '../../src/gastos/GastosApp.jsx';
import { api } from '../../src/gastos/api';
import { setToken, clearToken } from '../../src/gastos/session';

jest.mock('../../src/gastos/api', () => ({ api: {
  createExpense: jest.fn(),
  listExpenses: jest.fn().mockResolvedValue([]),
  getExpenseLineas: jest.fn().mockResolvedValue({ lineas: [] }),
  listAuxiliaresApp: jest.fn().mockResolvedValue({ auxiliares: [] }),
  getCompany: jest.fn().mockResolvedValue({ onboarded_at: '2026-01-01' }),
} }));
jest.mock('../../src/components/EvidenceIntake.jsx', () => ({
  __esModule: true,
  default: ({ onChange }) => (
    <button onClick={() => onChange([{ imageBase64: 'B64', imageMimeType: 'image/jpeg' }])}>fake-capture</button>
  ),
}));
jest.mock('../../src/gastos/kaly/KalyAgent.jsx', () => ({ __esModule: true, default: () => <div>kaly-mock</div> }));
jest.mock('../../src/gastos/onboarding/OnboardingWizard.jsx', () => ({ __esModule: true, default: ({ onSkip }) => <button onClick={onSkip}>wizard-mock-skip</button> }));

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
  await waitFor(() => expect(api.createExpense).toHaveBeenCalledWith('B64', 'image/jpeg', false));
  expect(await screen.findByText(/Revisa el gasto/i)).toBeInTheDocument();
});

test('nav muestra los 4 botones: Captura, Movimientos, Transaccional, Match', () => {
  setToken('TK');
  render(<GastosApp />);
  expect(screen.getByRole('button', { name: /^Captura$/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Movimientos$/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Transaccional$/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Match$/i })).toBeInTheDocument();
});

test('click en Match muestra la conciliación de cartola', () => {
  setToken('TK');
  render(<GastosApp />);
  fireEvent.click(screen.getByRole('button', { name: /^Match$/i }));
  expect(screen.getByText(/cuadra tu banco/i)).toBeInTheDocument();
});

test('click en Transaccional muestra placeholder Próximamente', () => {
  setToken('TK');
  render(<GastosApp />);
  fireEvent.click(screen.getByRole('button', { name: /^Transaccional$/i }));
  expect(screen.getByText(/Próximamente/i)).toBeInTheDocument();
  expect(screen.getByText(/Regístralo sin imagen/i)).toBeInTheDocument();
});

test('createExpense con documento:cartola cambia a tab Match y muestra cartola bancaria', async () => {
  setToken('TK');
  api.createExpense.mockResolvedValue({ documento: 'cartola' });
  render(<GastosApp />);
  fireEvent.click(screen.getByText('fake-capture'));
  await waitFor(() => expect(screen.getByText(/cartola bancaria/i)).toBeInTheDocument());
});

test('Chat OCULTO por defecto (la empresa no tiene el módulo chat)', () => {
  setToken('TK');
  render(<GastosApp />);
  expect(screen.queryByRole('button', { name: /^Chat$/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /^Productos$/i })).toBeNull();
  expect(screen.getByRole('button', { name: /^Match$/i })).toBeInTheDocument();
});

test('Chat VISIBLE cuando la empresa tiene el módulo chat activado (desde admin)', async () => {
  setToken('TK');
  api.getCompany.mockResolvedValueOnce({ onboarded_at: '2026-01-01', productos: ['chat'] });
  render(<GastosApp />);
  expect(await screen.findByRole('button', { name: /^Chat$/i })).toBeInTheDocument();
});
