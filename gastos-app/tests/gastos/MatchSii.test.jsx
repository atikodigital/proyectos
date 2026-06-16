// gastos-app/tests/gastos/MatchSii.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MatchView from '../../src/gastos/MatchView.jsx';
import { api } from '../../src/gastos/api';

jest.mock('../../src/gastos/api');
let intakeCb;
jest.mock('../../src/components/EvidenceIntake.jsx', () => ({ onChange }) => { intakeCb = onChange; return <button onClick={() => onChange([{ imageBase64: 'x', imageMimeType: 'image/jpeg' }])}>subir</button>; });

const informeSii = {
  docs: [], clase: { compras: 1, ventas: 0 },
  faltantes: [{ clase: 'compra', tipo_doc: 'factura', rut: '76.111.111-1', folio: '1234', fecha: '2026-06-05', neto: 10000, iva: 1900, total: 11900 }],
  sobrantes: [], matched: [],
  iva: { creditoContable: 0, creditoSii: 1900, debitoContable: 0, debitoSii: 0, ivaPagarContable: 0, ivaPagarSii: -1900, diferenciaCredito: 1900, diferenciaDebito: 0 },
};

beforeEach(() => {
  api.matchLibroSii = jest.fn().mockResolvedValue(informeSii);
  api.matchCrearMovimiento = jest.fn().mockResolvedValue({ ok: true, expenseId: 'e9' });
  api.matchCartola = jest.fn();
});

test('subir libro SII muestra IVA y faltantes, y permite crear el movimiento', async () => {
  render(<MatchView />);
  // cambiar a modo "Libro SII"
  fireEvent.click(screen.getByRole('button', { name: /libro sii|compras\/ventas/i }));
  fireEvent.click(screen.getByText('subir'));
  await waitFor(() => expect(api.matchLibroSii).toHaveBeenCalled());
  expect(await screen.findByText(/1234/)).toBeInTheDocument();
  expect(screen.getAllByText(/IVA/i).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: /crear gasto|crear movimiento/i }));
  await waitFor(() => expect(api.matchCrearMovimiento).toHaveBeenCalledWith(expect.objectContaining({ folio: '1234' })));
});
