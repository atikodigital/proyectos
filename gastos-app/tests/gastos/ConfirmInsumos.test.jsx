// gastos-app/tests/gastos/ConfirmInsumos.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConfirmScreen from '../../src/gastos/ConfirmScreen.jsx';
import { api } from '../../src/gastos/api';
jest.mock('../../src/gastos/api');

beforeEach(() => {
  api.getExpenseLineas = jest.fn().mockResolvedValue({ lineas: [
    { id: 'l1', descripcion: 'Harina 25kg', cantidad: 2, unidad: 'kg', total: 11900, auxiliar_id: 'a1' },
  ] });
  api.listAuxiliaresApp = jest.fn().mockResolvedValue({ auxiliares: [
    { id: 'a1', nombre: 'Harina' }, { id: 'a2', nombre: 'Levadura' },
  ] });
  api.setLineaAuxiliar = jest.fn().mockResolvedValue({ linea: { id: 'l1', auxiliar_id: 'a2' } });
  api.updateExpense = jest.fn(); api.confirmExpense = jest.fn().mockResolvedValue({});
});

test('muestra las líneas con su insumo y permite reasignar', async () => {
  render(<ConfirmScreen expense={{ id: 'e1', tipo: 'gasto', total: 11900 }} onDone={() => {}} />);
  expect(await screen.findByText(/Harina 25kg/)).toBeInTheDocument();
  const select = await screen.findByLabelText(/insumo-l1/i);
  fireEvent.change(select, { target: { value: 'a2' } });
  await waitFor(() => expect(api.setLineaAuxiliar).toHaveBeenCalledWith('l1', 'a2'));
});
