import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VarasChat from '../../src/gastos/VarasChat.jsx';
import { api } from '../../src/gastos/api';

jest.mock('../../src/gastos/api');

beforeEach(() => {
  api.varasChat = jest.fn();
  api.varasAccion = jest.fn();
});

test('(a) escribe y envía: aparece la burbuja del usuario y luego el reply de VARAS', async () => {
  api.varasChat.mockResolvedValue({ reply: 'Tu saldo en banco es $100.000.' });
  render(<VarasChat />);
  const input = screen.getByPlaceholderText(/preg/i);
  fireEvent.change(input, { target: { value: '¿cuánto tengo en el banco?' } });
  fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
  expect(screen.getByText('¿cuánto tengo en el banco?')).toBeInTheDocument();
  await waitFor(() => expect(api.varasChat).toHaveBeenCalled());
  expect(await screen.findByText('Tu saldo en banco es $100.000.')).toBeInTheDocument();
  // el historial enviado mapea las burbujas de usuario a role 'user'
  const enviado = api.varasChat.mock.calls[0][0];
  expect(enviado[enviado.length - 1]).toEqual({ role: 'user', text: '¿cuánto tengo en el banco?' });
});

test('(b) accionPropuesta: aparece Confirmar; al hacer click llama varasAccion con el tipo correcto y muestra confirmación', async () => {
  api.varasChat.mockResolvedValue({
    reply: 'Voy a marcar pagado.',
    accionPropuesta: { tipo: 'marcar_pagado', args: { descripcion: 'Proveedor X' }, descripcion: 'Marcar pagada la cuenta de Proveedor X' },
  });
  api.varasAccion.mockResolvedValue({ ok: true });
  render(<VarasChat />);
  fireEvent.change(screen.getByPlaceholderText(/preg/i), { target: { value: 'paga al proveedor X' } });
  fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
  expect(await screen.findByText('Marcar pagada la cuenta de Proveedor X')).toBeInTheDocument();
  const confirmar = await screen.findByRole('button', { name: /confirmar/i });
  fireEvent.click(confirmar);
  await waitFor(() => expect(api.varasAccion).toHaveBeenCalledWith('marcar_pagado', { descripcion: 'Proveedor X' }));
  expect(await screen.findByText(/hecho/i)).toBeInTheDocument();
});
