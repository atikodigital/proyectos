import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GastosApp from '../../src/gastos/GastosApp.jsx';
import { api } from '../../src/gastos/api';
import { setToken } from '../../src/gastos/session';

jest.mock('../../src/gastos/api', () => ({ api: {
  createExpense: jest.fn(),
  confirmExpense: jest.fn(),
  rejectExpense: jest.fn(),
  updateExpense: jest.fn(),
  listExpenses: jest.fn(),
  getExpenseLineas: jest.fn().mockResolvedValue({ lineas: [] }),
  listAuxiliaresApp: jest.fn().mockResolvedValue({ auxiliares: [] }),
  getCompany: jest.fn().mockResolvedValue({ onboarded_at: '2026-01-01' }),
} }));
jest.mock('../../src/components/EvidenceIntake.jsx', () => ({ __esModule: true, default: ({ onChange }) => (
  <button onClick={() => onChange([{ imageBase64: 'B64', imageMimeType: 'image/jpeg' }])}>fake-capture</button>
) }));
jest.mock('../../src/gastos/kaly/KalyAgent.jsx', () => ({ __esModule: true, default: () => <div>kaly-mock</div> }));
jest.mock('../../src/gastos/onboarding/OnboardingWizard.jsx', () => ({ __esModule: true, default: ({ onSkip }) => <button onClick={onSkip}>wizard-mock-skip</button> }));

beforeEach(() => { setToken('TK'); api.listExpenses.mockResolvedValue([]); });

test('al capturar un duplicado fuerte ofrece registrar igual', async () => {
  const err = new Error('duplicado'); err.status = 409; err.data = { duplicado: { nivel: 'fuerte', motivo: 'folio', existente: { proveedor: 'Sodimac', total: 11900, folio: '1234' } } };
  api.createExpense.mockRejectedValueOnce(err).mockResolvedValueOnce({ id: 'x9', tipo: 'gasto', proveedor: 'Sodimac', total: 11900 });
  render(<GastosApp />);
  fireEvent.click(screen.getByText('fake-capture'));
  await waitFor(() => expect(screen.getByText(/ya.*registrad/i)).toBeInTheDocument());
  expect(screen.getByText(/Por qué/i)).toBeInTheDocument();
  expect(screen.getByText(/mismo folio/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /registrar igual/i }));
  await waitFor(() => expect(api.createExpense).toHaveBeenLastCalledWith('B64', 'image/jpeg', true));
  await waitFor(() => expect(screen.getByText(/Revisa el/i)).toBeInTheDocument());
});
