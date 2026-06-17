import React from 'react';
import { render, screen } from '@testing-library/react';
import Hero from '../src/kaly/Hero.jsx';

beforeAll(() => { window.HTMLCanvasElement.prototype.getContext = () => null; });

test('Hero muestra titular, chips y CTAs', () => {
  render(<Hero />);
  expect(screen.getByText(/cuentas/i)).toBeInTheDocument();
  expect(screen.getByText(/¿Qué es Hash IA\?/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /descargar/i })).toHaveAttribute('href', expect.stringContaining('HashIA.apk'));
  expect(screen.getByRole('link', { name: /whatsapp/i })).toHaveAttribute('href', expect.stringContaining('wa.me'));
});
