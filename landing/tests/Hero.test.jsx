import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';

// La escena Spline es un import ESM pesado que no resuelve bajo Jest; la
// reemplazamos por un stub para poder testear el resto del Hero.
jest.mock('../src/components/ui/splite.jsx', () => ({ SplineScene: () => null }));

import Hero from '../src/kaly/Hero.jsx';

beforeAll(() => { window.HTMLCanvasElement.prototype.getContext = () => null; });

test('Hero muestra la barra Hash IA y la caja de chat', () => {
  render(<Hero />);
  expect(screen.getByText(/Hash IA/i)).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/Escr[ií]bele a KALY/i)).toBeInTheDocument();
});

test('preguntar por las características abre el abanico (modal) sin depender de la voz', () => {
  render(<Hero />);
  // No hay modal de características al inicio.
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText(/Escr[ií]bele a KALY/i), { target: { value: 'muéstrame las características' } });
  fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
  // Se abre el modal con las tarjetas dentro.
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText(/Gastos por foto o voz/i)).toBeInTheDocument();
  expect(within(dialog).getByText(/Pedidos en el chat/i)).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: /cerrar/i })).toBeInTheDocument();
});
