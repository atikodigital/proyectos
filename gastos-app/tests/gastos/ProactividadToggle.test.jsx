import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';

jest.mock('../../src/gastos/api', () => ({
  api: {
    getAgentPrefs: jest.fn().mockResolvedValue({ proactividad: true }),
    agentPrefs: jest.fn().mockResolvedValue({ proactividad: false }),
  },
}));
import { api } from '../../src/gastos/api';
import ProactividadToggle from '../../src/gastos/kaly/ProactividadToggle.jsx';

beforeEach(() => { jest.clearAllMocks(); });

test('carga el estado inicial desde getAgentPrefs', async () => {
  await act(async () => { render(<ProactividadToggle />); });
  await waitFor(() => expect(api.getAgentPrefs).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('checkbox')).toBeChecked();
});

test('al togglear llama agentPrefs con el nuevo valor', async () => {
  api.getAgentPrefs.mockResolvedValueOnce({ proactividad: true });
  await act(async () => { render(<ProactividadToggle />); });
  await waitFor(() => expect(api.getAgentPrefs).toHaveBeenCalled());
  await act(async () => { fireEvent.click(screen.getByRole('checkbox')); });
  expect(api.agentPrefs).toHaveBeenCalledWith({ proactividad: false });
});
