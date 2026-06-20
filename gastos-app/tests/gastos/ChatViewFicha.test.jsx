import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatView from '../../src/gastos/ChatView';
import { api } from '../../src/gastos/api';

jest.mock('../../src/gastos/api', () => ({
  api: {
    chatConversaciones: jest.fn(),
    chatMensajes: jest.fn(),
    chatContacto: jest.fn(),
    chatContactoGuardar: jest.fn(),
    listProducts: jest.fn(),
    getPedidoConfig: jest.fn(),
    pedidoFromCatalog: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  api.chatConversaciones.mockResolvedValue([{ channel: 'whatsapp', contact: 'Ana', ultimo: 'hola', n: 1 }]);
  api.chatMensajes.mockResolvedValue([{ text: 'Hola, quiero 2 tortas' }]);
  api.chatContacto.mockResolvedValue({ telefono: '56999111222', nMensajes: 3, primerContacto: '2026-06-01T10:00:00Z', ultimoContacto: '2026-06-10T10:00:00Z', email: '', ubicacion: '', notas: '' });
  api.chatContactoGuardar.mockResolvedValue({ ok: true });
  api.listProducts.mockResolvedValue([]);
  api.getPedidoConfig.mockResolvedValue({ iva_incluido: true });
});

test('la ficha se despliega desde la barra, carga datos y guarda; muestra acciones Pedido/Captura', async () => {
  render(<ChatView />);
  await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
  // abrir la conversación
  fireEvent.click(screen.getByText('Ana'));
  await waitFor(() => expect(screen.getByText('Hola, quiero 2 tortas')).toBeInTheDocument());

  // la ficha no está visible aún
  expect(screen.queryByText('Teléfono')).not.toBeInTheDocument();

  // tocar el nombre en la barra superior despliega la ficha
  fireEvent.click(screen.getByText('Ana'));
  await waitFor(() => expect(screen.getByText('Teléfono')).toBeInTheDocument());
  expect(screen.getByText('56999111222')).toBeInTheDocument();
  expect(api.chatContacto).toHaveBeenCalledWith('whatsapp', 'Ana');

  // editar email y guardar
  fireEvent.change(screen.getByPlaceholderText('correo@cliente.cl'), { target: { value: 'ana@cli.cl' } });
  fireEvent.click(screen.getByRole('button', { name: /Guardar datos/i }));
  await waitFor(() => expect(api.chatContactoGuardar).toHaveBeenCalled());
  expect(api.chatContactoGuardar.mock.calls[0][0]).toMatchObject({ channel: 'whatsapp', contact: 'Ana', email: 'ana@cli.cl' });

  // acciones presentes (hay un "Crear pedido" en la ficha y otro en la barra inferior)
  expect(screen.getAllByRole('button', { name: /Crear pedido/i }).length).toBeGreaterThanOrEqual(1);
  expect(screen.getByRole('button', { name: /Captura/i })).toBeInTheDocument();
});
