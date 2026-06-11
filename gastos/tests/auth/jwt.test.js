process.env.JWT_SECRET = 'test-secret';
const { signToken, verifyToken } = require('../../src/auth/jwt');

test('firma y verifica un token', () => {
  const t = signToken({ kind: 'employee', companyId: 'c1', employeeId: 'e1' });
  const p = verifyToken(t);
  expect(p.kind).toBe('employee');
  expect(p.companyId).toBe('c1');
  expect(p.employeeId).toBe('e1');
});

test('token invalido lanza', () => {
  expect(() => verifyToken('no-es-un-token')).toThrow();
});
