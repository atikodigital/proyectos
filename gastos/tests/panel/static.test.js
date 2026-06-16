const request = require('supertest');
const { app } = require('../../src/server');

test('GET /panel/ sirve el html del panel branded', async () => {
  const res = await request(app).get('/panel/');
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/html/);
  expect(res.text).toContain('Hash IA');
  expect(res.text).toContain('id="loginView"');
  expect(res.text).toContain('id="appView"');
  expect(res.text).toContain('id="expensesTable"');
  expect(res.text).toContain('Descargar Excel');
  expect(res.text).toContain('id="employeesSection"');
  expect(res.text).toContain('id="settingsSection"');
});

test('el modal de detalle parte oculto: .modal.hidden gana a .modal { display:flex }', async () => {
  const res = await request(app).get('/panel/');
  // .modal define display:flex después de .hidden (misma especificidad), así que
  // sin esta regla el modal queda visible y vacío tapando todo el panel.
  expect(res.text).toMatch(/\.modal\.hidden\s*\{\s*display:\s*none/);
});

test('GET /panel/lib.js sirve la lib', async () => {
  const res = await request(app).get('/panel/lib.js');
  expect(res.status).toBe(200);
  expect(res.text).toContain('PanelLib');
});
