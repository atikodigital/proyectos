import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProductosView from '../../src/gastos/ProductosView';
import { api } from '../../src/gastos/api';

jest.mock('../../src/gastos/api', () => ({
  api: {
    listProducts: jest.fn(),
    createProduct: jest.fn(),
    catalogExtraer: jest.fn(),
    crearProductosBulk: jest.fn(),
  },
}));

jest.mock('../../src/components/EvidenceIntake.jsx', () => ({
  __esModule: true,
  default: ({ onChange }) => <button onClick={() => onChange([{ imageBase64: 'IMG', imageMimeType: 'image/jpeg' }])}>fake-capture</button>,
}));

test('lista productos y permite crear uno', async () => {
  api.listProducts.mockResolvedValue([
    { id: 'p1', nombre: 'Torta', precio_base: 18000, variantes: [], extras: [], activo: true, stock: 8 },
  ]);
  api.createProduct.mockResolvedValue({ id: 'p2', nombre: 'Café', precio_base: 1800, variantes: [], extras: [], activo: true });

  render(<ProductosView />);
  await waitFor(() => expect(screen.getByText('Torta')).toBeInTheDocument());

  fireEvent.change(screen.getByPlaceholderText('Nombre del producto'), { target: { value: 'Café' } });
  fireEvent.click(screen.getByText('Guardar'));
  await waitFor(() => expect(api.createProduct).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Café' })));
});

test('Desde foto → preview → Crear llama crearProductosBulk con los marcados', async () => {
  api.listProducts.mockResolvedValue([]);
  api.catalogExtraer.mockResolvedValue({ productos: [{ nombre: 'Torta', precio: 18000 }, { nombre: 'Café', precio: 1800 }] });
  api.crearProductosBulk.mockResolvedValue({ creados: 2 });

  render(<ProductosView />);
  fireEvent.click(screen.getByText('📷 Desde foto'));
  fireEvent.click(await screen.findByText('fake-capture'));
  await waitFor(() => expect(api.catalogExtraer).toHaveBeenCalledWith('IMG', 'image/jpeg'));
  await waitFor(() => expect(screen.getByDisplayValue('Torta')).toBeInTheDocument());

  fireEvent.click(screen.getByText(/Crear 2 productos/i));
  await waitFor(() => expect(api.crearProductosBulk).toHaveBeenCalled());
  expect(api.crearProductosBulk.mock.calls[0][0]).toEqual([{ nombre: 'Torta', precio: 18000 }, { nombre: 'Café', precio: 1800 }]);
});
