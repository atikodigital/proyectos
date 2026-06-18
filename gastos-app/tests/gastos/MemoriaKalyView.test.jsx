import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
jest.mock('../../src/gastos/api', () => ({ api: { kalyMemorias: jest.fn(), kalyRecordar: jest.fn(), kalyBorrarMemoria: jest.fn(), getAgentPrefs: jest.fn().mockResolvedValue({}), agentPrefs: jest.fn().mockResolvedValue({}) } }));
import { api } from '../../src/gastos/api';
import MemoriaKalyView from '../../src/gastos/MemoriaKalyView.jsx';

beforeEach(() => {
  jest.clearAllMocks();
  api.kalyMemorias.mockResolvedValue([{ id: 'm1', tipo: 'negocio', contenido: 'Cierra domingos' }]);
  api.kalyRecordar.mockResolvedValue({ id: 'm2', tipo: 'hecho', contenido: 'Nuevo dato' });
  api.kalyBorrarMemoria.mockResolvedValue({ ok: true });
});

test('lista las memorias y agrega una nueva', async () => {
  render(<MemoriaKalyView />);
  await screen.findByText(/Cierra domingos/i);
  fireEvent.change(screen.getByPlaceholderText(/Aceptamos transferencias/i), { target: { value: 'Nuevo dato' } });
  fireEvent.click(screen.getByText(/Guardar Hecho/i));
  await waitFor(() => expect(api.kalyRecordar).toHaveBeenCalledWith(expect.objectContaining({ contenido: 'Nuevo dato' })));
});
