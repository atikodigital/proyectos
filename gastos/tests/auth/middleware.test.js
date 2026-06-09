process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { signToken } = require('../../src/auth/jwt');
const { requireAuth, requireKind } = require('../../src/auth/middleware');

function appWith(mw) {
  const app = express();
  app.get('/p', mw, (req, res) => res.json({ auth: req.auth }));
  return app;
}

test('requireAuth rechaza sin token (401)', async () => {
  const res = await request(appWith(requireAuth)).get('/p');
  expect(res.status).toBe(401);
});

test('requireAuth acepta Bearer valido y setea req.auth', async () => {
  const token = signToken({ kind: 'employee', companyId: 'c1', employeeId: 'e1' });
  const res = await request(appWith(requireAuth)).get('/p').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.auth.companyId).toBe('c1');
});

test('requireKind bloquea kind equivocado (403)', async () => {
  const app = express();
  app.get('/p', requireAuth, requireKind('user'), (req, res) => res.json({ ok: true }));
  const token = signToken({ kind: 'employee', companyId: 'c1', employeeId: 'e1' });
  const res = await request(app).get('/p').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(403);
});
