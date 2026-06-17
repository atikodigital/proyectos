import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('../../src/gastos/ProductosView.jsx', () => ({ __esModule: true, default: () => <div>productos-view-mock</div> }));
jest.mock('../../src/gastos/api', () => ({ api: {
  getCompany: jest.fn(), updateCompany: jest.fn(), listProducts: jest.fn(),
  getPedidoConfig: jest.fn(), setPedidoConfig: jest.fn(),
} }));
import { api } from '../../src/gastos/api';
import OnboardingWizard from '../../src/gastos/onboarding/OnboardingWizard.jsx';

beforeEach(() => {
  jest.clearAllMocks();
  api.getCompany.mockResolvedValue({ nombre: '', owner_whatsapp: '', giro: '', onboarded_at: null });
  api.updateCompany.mockResolvedValue({});
  api.listProducts.mockResolvedValue([]);
  api.getPedidoConfig.mockResolvedValue({ pedido_iva_incluido: true });
  api.setPedidoConfig.mockResolvedValue({});
});

test('paso 1 guarda el negocio con updateCompany', async () => {
  render(<OnboardingWizard onDone={() => {}} onSkip={() => {}} />);
  await screen.findByText(/Tu negocio/i);
  fireEvent.change(screen.getByPlaceholderText(/nombre de tu negocio/i), { target: { value: 'Mi Pyme' } });
  fireEvent.change(screen.getByPlaceholderText(/WhatsApp/i), { target: { value: '56999999999' } });
  fireEvent.click(screen.getByText(/Siguiente/i));
  await waitFor(() => expect(api.updateCompany).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Mi Pyme', owner_whatsapp: '56999999999' })));
});

test('botón Saltar dispara onSkip', async () => {
  const onSkip = jest.fn();
  render(<OnboardingWizard onDone={() => {}} onSkip={onSkip} />);
  await screen.findByText(/Tu negocio/i);
  fireEvent.click(screen.getByText(/Saltar por ahora/i));
  expect(onSkip).toHaveBeenCalled();
});
