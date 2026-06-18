import { render, screen, fireEvent } from '@testing-library/react';
import AgentProposalModal from '../../src/gastos/agente/AgentProposalModal.jsx';

const PROP = {
  titulo: 'Crear producto',
  accion: 'agregar_producto',
  campos: [
    { key: 'nombre', label: 'Nombre', valor: 'Empanada', tipo: 'texto' },
    { key: 'precio', label: 'Precio (CLP)', valor: 1500, tipo: 'numero' },
    { key: 'tipo', label: 'Tipo', valor: 'producto', tipo: 'opciones', opciones: ['producto', 'servicio'] },
  ],
};

test('muestra título y los campos con sus valores', () => {
  render(<AgentProposalModal propuesta={PROP} onConfirmar={() => {}} onCancelar={() => {}} />);
  expect(screen.getByText('Crear producto')).toBeInTheDocument();
  expect(screen.getByLabelText('Nombre')).toHaveValue('Empanada');
  expect(screen.getByLabelText('Precio (CLP)')).toHaveValue(1500);
  expect(screen.getByLabelText('Tipo')).toHaveValue('producto');
});

test('editar un campo y Confirmar devuelve los valores editados', () => {
  const onConfirmar = jest.fn();
  render(<AgentProposalModal propuesta={PROP} onConfirmar={onConfirmar} onCancelar={() => {}} />);
  fireEvent.change(screen.getByLabelText('Precio (CLP)'), { target: { value: '1600' } });
  fireEvent.click(screen.getByText('Confirmar'));
  expect(onConfirmar).toHaveBeenCalledWith({ nombre: 'Empanada', precio: 1600, tipo: 'producto' });
});

test('Cancelar llama onCancelar', () => {
  const onCancelar = jest.fn();
  render(<AgentProposalModal propuesta={PROP} onConfirmar={() => {}} onCancelar={onCancelar} />);
  fireEvent.click(screen.getByText('Cancelar'));
  expect(onCancelar).toHaveBeenCalled();
});

test('Escape cancela', () => {
  const onCancelar = jest.fn();
  render(<AgentProposalModal propuesta={PROP} onConfirmar={() => {}} onCancelar={onCancelar} />);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(onCancelar).toHaveBeenCalled();
});

test('propuesta sin campos (solo acción) confirma con objeto vacío', () => {
  const onConfirmar = jest.fn();
  render(<AgentProposalModal propuesta={{ titulo: 'Enviar WhatsApp', accion: 'x', campos: [] }} onConfirmar={onConfirmar} onCancelar={() => {}} />);
  fireEvent.click(screen.getByText('Confirmar'));
  expect(onConfirmar).toHaveBeenCalledWith({});
});
