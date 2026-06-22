const { signToken, verifyToken } = require('../../src/auth/jwt');

describe('jwt secret hardening', () => {
  const orig = process.env.JWT_SECRET;
  const origEnv = process.env.NODE_ENV;
  afterEach(() => {
    if (orig === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = orig;
    if (origEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = origEnv;
  });

  test('firma y verifica con JWT_SECRET seteado', () => {
    process.env.JWT_SECRET = 'una-clave-fuerte';
    const t = signToken({ a: 1 });
    expect(verifyToken(t).a).toBe(1);
  });

  test('FALLA si falta JWT_SECRET en producción (no usa secreto débil en silencio)', () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';
    expect(() => signToken({ a: 1 })).toThrow(/JWT_SECRET/);
  });

  test('en dev/test sin JWT_SECRET usa fallback (no rompe el desarrollo)', () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'test';
    const t = signToken({ a: 1 });
    expect(verifyToken(t).a).toBe(1);
  });
});
