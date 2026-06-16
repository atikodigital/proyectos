// gastos-app/tests/gastos/MatchView.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MatchView from '../../src/gastos/MatchView.jsx';
import { api } from '../../src/gastos/api';

jest.mock('../../src/gastos/api');
// EvidenceIntake hace captura nativa; lo simplificamos para test.
jest.mock('../../src/components/EvidenceIntake.jsx', () => ({ onChange }) => (
  <button onClick={() => onChange([{ imageBase64: 'x', imageMimeType: 'image/jpeg' }])}>subir-cartola</button>
));

const informe = {
  lineas: [{ fecha: '2026-06-15', glosa: 'COMISION', monto: 1900 }],
  sca: 86200, sba: 86200, cuadrado: true, brecha: 0,
  matched: [{ expenseId: 'e1', score: 100 }],
  partidas: [{ tipo: 'nota_debito', glosa: 'Comisión mantención', monto: 1900, fecha: '2026-06-15' }],
  suggested: [{ id: 'sug1', descripcion: 'Comisión mantención', tipo: 'nota_debito', monto: 1900, fecha: '2026-06-15', cuentaClaveDebe: 'gastos_financieros', cuentaClaveHaber: 'banco' }],
  exceptions: [],
  fuente: 'ia',
};

beforeEach(() => {
  api.matchCartola = jest.fn().mockResolvedValue(informe);
  api.matchConfirmarAsiento = jest.fn().mockResolvedValue({ ok: true, asientoId: 'a1' });
});

test('al subir cartola muestra SCA/SBA y badge cuadrado', async () => {
  render(<MatchView />);
  fireEvent.click(screen.getByText('subir-cartola'));
  await waitFor(() => expect(api.matchCartola).toHaveBeenCalled());
  expect(await screen.findByText(/cuadrado/i)).toBeInTheDocument();
});

test('muestra la partida y permite crear el asiento sugerido', async () => {
  render(<MatchView />);
  fireEvent.click(screen.getByText('subir-cartola'));
  expect(await screen.findByText(/Comisión mantención/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /crear asiento/i }));
  await waitFor(() => expect(api.matchConfirmarAsiento).toHaveBeenCalledWith(expect.objectContaining({ id: 'sug1' })));
  expect(await screen.findByText(/asiento creado|✓/i)).toBeInTheDocument();
});
