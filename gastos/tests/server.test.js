const request = require('supertest');
const { app } = require('../src/server');

test('GET /health responde ok', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ status: 'ok', service: 'atiko-gastos' });
});
