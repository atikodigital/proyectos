import { hasNativeOverlayPermission } from '../../src/mobile/screenCaptureBridge';

// Fix del bug "activé 'mostrar sobre otras apps' pero el mensaje sigue": el JS
// necesita poder CONSULTAR el permiso (sin abrir ajustes) para detectar que ya
// está y ocultar el aviso. hasNativeOverlayPermission envuelve el plugin nativo.
describe('hasNativeOverlayPermission', () => {
  afterEach(() => { delete window.Capacitor; });

  test('sin plugin nativo (web) → true (no bloquea el flujo web)', async () => {
    delete window.Capacitor;
    expect(await hasNativeOverlayPermission()).toBe(true);
  });

  test('plugin devuelve granted=true → true', async () => {
    window.Capacitor = { Plugins: { MaticoScreenCapture: { hasOverlayPermission: async () => ({ granted: true }) } } };
    expect(await hasNativeOverlayPermission()).toBe(true);
  });

  test('plugin devuelve granted=false → false (se mantiene el aviso)', async () => {
    window.Capacitor = { Plugins: { MaticoScreenCapture: { hasOverlayPermission: async () => ({ granted: false }) } } };
    expect(await hasNativeOverlayPermission()).toBe(false);
  });

  test('plugin lanza error → false (no rompe)', async () => {
    window.Capacitor = { Plugins: { MaticoScreenCapture: { hasOverlayPermission: async () => { throw new Error('boom'); } } } };
    expect(await hasNativeOverlayPermission()).toBe(false);
  });
});
