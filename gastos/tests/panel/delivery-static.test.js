const request = require('supertest');
const { app } = require('../../src/server');

test('Ajustes incluye el armador de Zonas de despacho + envío gratis', async () => {
  const res = await request(app).get('/panel/');
  expect(res.status).toBe(200);
  expect(res.text).toContain('Zonas de despacho');
  expect(res.text).toContain('id="deliveryGratis"');
  expect(res.text).toContain('id="zonasLista"');
});
