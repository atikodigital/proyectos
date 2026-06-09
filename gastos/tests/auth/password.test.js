const { hashPassword, verifyPassword } = require('../../src/auth/password');

test('hashea y verifica password', async () => {
  const hash = await hashPassword('secreto123');
  expect(hash).not.toBe('secreto123');
  expect(await verifyPassword('secreto123', hash)).toBe(true);
  expect(await verifyPassword('malo', hash)).toBe(false);
});
