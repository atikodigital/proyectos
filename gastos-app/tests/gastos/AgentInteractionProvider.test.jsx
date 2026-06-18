import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { AgentInteractionProvider, useAgentInteraction } from '../../src/gastos/agente/AgentInteractionProvider.jsx';

jest.mock('../../src/components/EvidenceIntake.jsx', () => ({
  __esModule: true,
  default: ({ onChange }) => <button onClick={() => onChange([{ base64: 'ZZZ', mimeType: 'image/jpeg' }])}>mock-capturar</button>,
}));

function Harness() {
  const { proponer, pedirEvidencia } = useAgentInteraction();
  return (
    <div>
      <button onClick={async () => { const d = await proponer({ titulo: 'Crear', accion: 'x', campos: [{ key: 'n', label: 'Nombre', valor: 'A', tipo: 'texto' }] }); window.__res = d; }}>proponer</button>
      <button onClick={async () => { const e = await pedirEvidencia({ motivo: 'la boleta' }); window.__ev = e; }}>pedir</button>
    </div>
  );
}

test('proponer abre el modal; Confirmar resuelve con los datos', async () => {
  window.__res = undefined;
  render(<AgentInteractionProvider><Harness /></AgentInteractionProvider>);
  await act(async () => { fireEvent.click(screen.getByText('proponer')); });
  expect(screen.getByText('Crear')).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByText('Confirmar')); });
  await waitFor(() => expect(window.__res).toEqual({ n: 'A' }));
});

test('proponer + Cancelar resuelve null', async () => {
  window.__res = 'sentinel';
  render(<AgentInteractionProvider><Harness /></AgentInteractionProvider>);
  await act(async () => { fireEvent.click(screen.getByText('proponer')); });
  await act(async () => { fireEvent.click(screen.getByText('Cancelar')); });
  await waitFor(() => expect(window.__res).toBeNull());
});

test('pedirEvidencia abre el overlay; capturar resuelve la imagen', async () => {
  window.__ev = undefined;
  render(<AgentInteractionProvider><Harness /></AgentInteractionProvider>);
  await act(async () => { fireEvent.click(screen.getByText('pedir')); });
  expect(screen.getByText(/la boleta/i)).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByText('mock-capturar')); });
  await waitFor(() => expect(window.__ev).toEqual({ base64: 'ZZZ', mimeType: 'image/jpeg' }));
});

test('useAgentInteraction fuera del provider devuelve no-op (resuelve null)', async () => {
  let res = 'x';
  function Solo() { const { proponer } = useAgentInteraction(); return <button onClick={async () => { res = await proponer({ campos: [] }); }}>p</button>; }
  render(<Solo />);
  await act(async () => { fireEvent.click(screen.getByText('p')); });
  await waitFor(() => expect(res).toBeNull());
});
