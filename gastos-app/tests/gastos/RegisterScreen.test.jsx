import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RegisterScreen from '../../src/gastos/RegisterScreen.jsx';
import { api } from '../../src/gastos/api';
import { googleNativeLogin, facebookNativeLogin } from '../../src/gastos/socialAuth';

jest.mock('../../src/gastos/api', () => ({
  api: { register: jest.fn(), loginGoogle: jest.fn(), loginFacebook: jest.fn() },
}));

// Forzamos disponibilidad social (en jsdom Capacitor.isNativePlatform() es false).
jest.mock('../../src/gastos/socialAuth', () => ({
  googleDisponible: () => true,
  facebookDisponible: () => true,
  googleNativeLogin: jest.fn(),
  facebookNativeLogin: jest.fn(),
}));

// El entorno de test (jsdom) reporta navigator.language='en-US' por defecto;
// forzamos español para que t() coincida con los textos de los tests.
beforeEach(() => { localStorage.setItem('hash_idioma', 'es'); });

// Bug reportado: la pantalla "Negocio" no tenía los botones de Google/Facebook
// (solo existían en Personal y en el login principal).
test('muestra los botones de Google y Facebook', () => {
  render(<RegisterScreen onRegistered={() => {}} onBackToLogin={() => {}} />);
  expect(screen.getByRole('button', { name: /continuar con google/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /continuar con facebook/i })).toBeInTheDocument();
});

test('Google: llama loginGoogle con tipo "negocio" y avisa onRegistered', async () => {
  googleNativeLogin.mockResolvedValue('id-token-xyz');
  api.loginGoogle.mockResolvedValue({ ok: true, token: 'TK', needsBusinessName: true });
  const onRegistered = jest.fn();
  render(<RegisterScreen onRegistered={onRegistered} onBackToLogin={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /continuar con google/i }));
  await waitFor(() => expect(api.loginGoogle).toHaveBeenCalledWith('id-token-xyz', 'negocio'));
  await waitFor(() => expect(onRegistered).toHaveBeenCalledWith({ ok: true, token: 'TK', needsBusinessName: true }));
});

test('Facebook: llama loginFacebook con tipo "negocio"', async () => {
  facebookNativeLogin.mockResolvedValue('fb-token-abc');
  api.loginFacebook.mockResolvedValue({ ok: true, token: 'TK2' });
  const onRegistered = jest.fn();
  render(<RegisterScreen onRegistered={onRegistered} onBackToLogin={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /continuar con facebook/i }));
  await waitFor(() => expect(api.loginFacebook).toHaveBeenCalledWith('fb-token-abc', 'negocio'));
  await waitFor(() => expect(onRegistered).toHaveBeenCalled());
});

test('muestra error si el login social falla', async () => {
  googleNativeLogin.mockRejectedValue(new Error('cancelado'));
  render(<RegisterScreen onRegistered={() => {}} onBackToLogin={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /continuar con google/i }));
  expect(await screen.findByText(/no pudimos entrar con google/i)).toBeInTheDocument();
});
