const request = require('supertest');
const { app } = require('../src/server');

test('CORS: responde con Access-Control-Allow-Origin', async () => {
  const res = await request(app).get('/health').set('Origin', 'https://localhost');
  expect(res.status).toBe(200);
  expect(res.headers['access-control-allow-origin']).toBeDefined();
});

test('preflight OPTIONS a /api/app/login responde 204/200 con CORS', async () => {
  const res = await request(app).options('/api/app/login')
    .set('Origin', 'https://localhost')
    .set('Access-Control-Request-Method', 'POST');
  expect([200, 204]).toContain(res.status);
  expect(res.headers['access-control-allow-origin']).toBeDefined();
});
