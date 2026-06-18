import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
jest.mock('../../src/gastos/api', () => ({ api: { kalyMemorias: jest.fn(), kalyRecordar: jest.fn(), kalyBorrarMemoria: jest.fn() } }));
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
  fireEvent.change(screen.getByPlaceholderText(/Qué quieres que KALY recuerde/i), { target: { value: 'Nuevo dato' } });
  fireEvent.click(screen.getByText(/Agregar/i));
  await waitFor(() => expect(api.kalyRecordar).toHaveBeenCalledWith(expect.objectContaining({ contenido: 'Nuevo dato' })));
});
