import { executeTool, TOOL_DECLARATIONS } from '../src/kaly/tools.js';

test('TOOL_DECLARATIONS tiene las 4 tools', () => {
  const names = TOOL_DECLARATIONS.map(t => t.name);
  expect(names).toEqual(expect.arrayContaining(['mostrar_features', 'mostrar_planes', 'descargar_app', 'abrir_whatsapp']));
});

test('mostrar_features llama el callback con la familia', () => {
  const ui = { mostrarFeatures: jest.fn(), mostrarPlanes: jest.fn(), descargarApp: jest.fn(), abrirWhatsapp: jest.fn() };
  const r = executeTool('mostrar_features', { familia: 'ventas' }, ui);
  expect(ui.mostrarFeatures).toHaveBeenCalledWith('ventas');
  expect(r).toEqual({ ok: true });
});

test('descargar_app y abrir_whatsapp disparan sus callbacks', () => {
  const ui = { mostrarFeatures: jest.fn(), mostrarPlanes: jest.fn(), descargarApp: jest.fn(), abrirWhatsapp: jest.fn() };
  executeTool('descargar_app', {}, ui);
  executeTool('abrir_whatsapp', {}, ui);
  expect(ui.descargarApp).toHaveBeenCalled();
  expect(ui.abrirWhatsapp).toHaveBeenCalled();
});

test('tool desconocida devuelve error', () => {
  expect(executeTool('no_existe', {}, {})).toEqual({ error: 'tool_desconocida' });
});
