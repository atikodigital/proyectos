import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatView from '../../src/gastos/ChatView';
import { api } from '../../src/gastos/api';

jest.mock('../../src/gastos/api', () => ({
  api: {
    chatConversaciones: jest.fn(),
    chatMensajes: jest.fn(),
    listProducts: jest.fn(),
    getPedidoConfig: jest.fn(),
    pedidoFromCatalog: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  api.chatConversaciones.mockResolvedValue([{ channel: 'whatsapp', contact: 'Ana', ultimo: 'hola', n: 1 }]);
  api.chatMensajes.mockResolvedValue([{ text: 'Hola, quiero 2 tortas' }]);
  api.listProducts.mockResolvedValue([]);
  api.getPedidoConfig.mockResolvedValue({ iva_incluido: true });
});

test('el selector Conversaciones|Productos está presente y "Productos" abre el catálogo', async () => {
  render(<ChatView />);
  await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /Conversaciones/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Productos$/i }));
  await waitFor(() => expect(screen.getByText(/Aún no tienes productos/i)).toBeInTheDocument());
});

test('en una conversación, responder abre WhatsApp con el texto y lo muestra en el hilo', async () => {
  const openSpy = jest.spyOn(window, 'open').mockImplementation(() => ({}));
  render(<ChatView />);
  await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Ana'));
  await waitFor(() => expect(screen.getByText('Hola, quiero 2 tortas')).toBeInTheDocument());

  fireEvent.change(screen.getByPlaceholderText('Escribe una respuesta…'), { target: { value: 'Son $20.000' } });
  fireEvent.click(screen.getByRole('button', { name: /Responder por WhatsApp/i }));

  expect(openSpy).toHaveBeenCalled();
  const url = openSpy.mock.calls[0][0];
  expect(url).toContain('wa.me');
  expect(url).toContain(encodeURIComponent('Son $20.000'));
  expect(screen.getByText('Son $20.000')).toBeInTheDocument();
  openSpy.mockRestore();
});
