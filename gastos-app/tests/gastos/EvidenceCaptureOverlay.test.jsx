import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('../../src/components/EvidenceIntake.jsx', () => ({
  __esModule: true,
  default: ({ onChange }) => (
    <button onClick={() => onChange([{ base64: 'ZZZ', mimeType: 'image/jpeg' }])}>mock-capturar</button>
  ),
}));

import EvidenceCaptureOverlay from '../../src/gastos/agente/EvidenceCaptureOverlay.jsx';

test('muestra el motivo y EvidenceIntake', () => {
  render(<EvidenceCaptureOverlay motivo="la boleta del proveedor" onCapturar={() => {}} onCancelar={() => {}} />);
  expect(screen.getByText(/la boleta del proveedor/i)).toBeInTheDocument();
  expect(screen.getByText('mock-capturar')).toBeInTheDocument();
});

test('al capturar la primera evidencia llama onCapturar con el item', () => {
  const onCapturar = jest.fn();
  render(<EvidenceCaptureOverlay motivo="x" onCapturar={onCapturar} onCancelar={() => {}} />);
  fireEvent.click(screen.getByText('mock-capturar'));
  expect(onCapturar).toHaveBeenCalledWith({ base64: 'ZZZ', mimeType: 'image/jpeg' });
});

test('Cancelar llama onCancelar', () => {
  const onCancelar = jest.fn();
  render(<EvidenceCaptureOverlay motivo="x" onCapturar={() => {}} onCancelar={onCancelar} />);
  fireEvent.click(screen.getByText('Cancelar'));
  expect(onCancelar).toHaveBeenCalled();
});
