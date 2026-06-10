import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginScreen from '../../src/gastos/LoginScreen.jsx';
import { api } from '../../src/gastos/api';
jest.mock('../../src/gastos/api', () => ({ api: { login: jest.fn() } }));

test('loguea y avisa', async () => {
  api.login.mockResolvedValue({ token: 'TK', employee: { id: 'e1', nombre: 'Juan' } });
  const onLoggedIn = jest.fn();
  render(<LoginScreen onLoggedIn={onLoggedIn} />);
  fireEvent.change(screen.getByLabelText(/usuario/i), { target: { value: 'juan' } });
  fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'clave' } });
  fireEvent.click(screen.getByRole('button', { name: /entrar/i }));
  await waitFor(() => expect(api.login).toHaveBeenCalledWith('juan', 'clave'));
  await waitFor(() => expect(onLoggedIn).toHaveBeenCalled());
});

test('muestra error', async () => {
  api.login.mockRejectedValue(new Error('credenciales'));
  render(<LoginScreen onLoggedIn={() => {}} />);
  fireEvent.change(screen.getByLabelText(/usuario/i), { target: { value: 'j' } });
  fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'x' } });
  fireEvent.click(screen.getByRole('button', { name: /entrar/i }));
  expect(await screen.findByText(/no pudimos|error|incorrect/i)).toBeInTheDocument();
});
