import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PedidoBuilder from '../../src/gastos/pedido/PedidoBuilder';
import { api } from '../../src/gastos/api';

jest.mock('../../src/gastos/api', () => ({
  api: { listProducts: jest.fn(), getPedidoConfig: jest.fn(), pedidoFromCatalog: jest.fn(), comunas: jest.fn(), pedidoPdfAbrir: jest.fn() },
}));

const torta = {
  id: 'p1', nombre: 'Torta', tipo: 'producto', precio_base: 18000, activo: true,
  variantes: [{ id: 'g1', nombre: 'Tamaño', opciones: [{ id: 'o1', nombre: '10p', delta: 0 }, { id: 'o2', nombre: '15p', delta: 8000 }] }],
  extras: [{ id: 'e1', nombre: 'Velas', precio: 1500 }],
};

test('elige producto, agrega al carrito y genera el pedido', async () => {
  api.listProducts.mockResolvedValue([torta]);
  api.getPedidoConfig.mockResolvedValue({ pie: null, iva_incluido: true });
  api.pedidoFromCatalog.mockResolvedValue({ text: 'PEDIDO', waUrl: 'https://wa.me/?text=PEDIDO' });
  api.comunas.mockResolvedValue([]);

  render(<PedidoBuilder channel="whatsapp" contact="Ana" onClose={() => {}} />);
  await waitFor(() => expect(screen.getByText('Torta')).toBeInTheDocument());

  fireEvent.click(screen.getByText('Torta'));
  fireEvent.click(await screen.findByText('15p'));
  fireEvent.click(screen.getByText('Agregar al carrito'));

  fireEvent.click(await screen.findByText('Generar pedido'));
  await waitFor(() => expect(api.pedidoFromCatalog).toHaveBeenCalled());
  const arg = api.pedidoFromCatalog.mock.calls[0][0];
  expect(arg.lineas[0]).toMatchObject({ productId: 'p1', opciones: { g1: 'o2' } });
});

test('despacho + comuna en zona suma el envío al total', async () => {
  api.listProducts.mockResolvedValue([torta]);
  api.getPedidoConfig.mockResolvedValue({ iva_incluido: true, delivery: { zonas: [{ id: 'z1', nombre: 'RM', costo: 2500, comunas: ['Providencia'] }], gratis_desde: null } });
  api.comunas.mockResolvedValue([{ region: 'Metropolitana de Santiago', comunas: ['Providencia', 'Ñuñoa'] }]);

  render(<PedidoBuilder channel="whatsapp" contact="Ana" onClose={() => {}} />);
  await waitFor(() => expect(screen.getByText('Torta')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Torta'));
  fireEvent.click(screen.getByText('Agregar al carrito'));
  await waitFor(() => expect(screen.getByText('Generar pedido')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Despacho'));
  await waitFor(() => expect(screen.getByLabelText('Comuna de despacho')).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('Comuna de despacho'), { target: { value: 'Providencia' } });
  await waitFor(() => expect(screen.getByText(/Env[íi]o/i)).toBeInTheDocument());
  expect(screen.getByText(/\$20\.500/)).toBeInTheDocument();
});

test('tras generar, el botón 📄 PDF llama api.pedidoPdfAbrir con el id', async () => {
  api.listProducts.mockResolvedValue([torta]);
  api.getPedidoConfig.mockResolvedValue({ iva_incluido: true });
  api.comunas.mockResolvedValue([]);
  api.pedidoFromCatalog.mockResolvedValue({ pedido: { id: 'p9' }, text: 'PEDIDO', waUrl: 'https://wa.me/?text=PEDIDO' });

  render(<PedidoBuilder channel="whatsapp" contact="Ana" onClose={() => {}} />);
  await waitFor(() => expect(screen.getByText('Torta')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Torta'));
  fireEvent.click(screen.getByText('Agregar al carrito'));
  fireEvent.click(await screen.findByText('Generar pedido'));
  await waitFor(() => expect(screen.getByText('Pedido listo')).toBeInTheDocument());

  fireEvent.click(screen.getByText('📄 PDF'));
  expect(api.pedidoPdfAbrir).toHaveBeenCalledWith('p9');
});
