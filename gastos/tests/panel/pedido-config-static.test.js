const request = require('supertest');
const { app } = require('../../src/server');

test('Ajustes incluye el toggle de IVA del pedido', async () => {
  const res = await request(app).get('/panel/');
  expect(res.status).toBe(200);
  expect(res.text).toContain('id="ivaIncluido"');
  expect(res.text).toContain('incluyen IVA');
});
