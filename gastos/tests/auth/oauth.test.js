const { verifyGoogleIdToken, verifyFacebookToken } = require('../../src/auth/oauth');

// http falso: devuelve lo que le digamos según la URL pedida.
function fakeHttp(map) {
  return { get: jest.fn(async (url) => {
    for (const k of Object.keys(map)) { if (url.includes(k)) return { data: map[k] }; }
    throw new Error('url no mapeada: ' + url);
  }) };
}

// ── Google ───────────────────────────────────────────────────────────────────

test('verifyGoogleIdToken: token válido → perfil', async () => {
  const http = fakeHttp({ tokeninfo: { aud: 'CID', iss: 'accounts.google.com', sub: '123', email: 'Ana@Gmail.com', email_verified: 'true', name: 'Ana' } });
  const p = await verifyGoogleIdToken('tok', { http, clientId: 'CID' });
  expect(p).toEqual({ provider: 'google', providerId: '123', email: 'ana@gmail.com', name: 'Ana' });
});

test('verifyGoogleIdToken: aud que no es nuestra → rechaza', async () => {
  const http = fakeHttp({ tokeninfo: { aud: 'OTRA', iss: 'accounts.google.com', sub: '1', email: 'a@b.cl', email_verified: 'true' } });
  await expect(verifyGoogleIdToken('tok', { http, clientId: 'CID' })).rejects.toThrow('aud_invalida');
});

test('verifyGoogleIdToken: acepta también el client_id de Android', async () => {
  const http = fakeHttp({ tokeninfo: { aud: 'ANDROID', iss: 'https://accounts.google.com', sub: '9', email: 'a@b.cl', email_verified: true, name: 'X' } });
  const p = await verifyGoogleIdToken('tok', { http, clientId: 'WEB', androidClientId: 'ANDROID' });
  expect(p.providerId).toBe('9');
});

test('verifyGoogleIdToken: email sin verificar → rechaza', async () => {
  const http = fakeHttp({ tokeninfo: { aud: 'CID', iss: 'accounts.google.com', sub: '1', email: 'a@b.cl', email_verified: 'false' } });
  await expect(verifyGoogleIdToken('tok', { http, clientId: 'CID' })).rejects.toThrow('email_no_verificado');
});

test('verifyGoogleIdToken: sin client_id configurado → rechaza', async () => {
  await expect(verifyGoogleIdToken('tok', { http: fakeHttp({}), clientId: null })).rejects.toThrow('GOOGLE_CLIENT_ID');
});

// ── Facebook ───────────────────────────────────────────────────────────────--

test('verifyFacebookToken: token válido → perfil', async () => {
  const http = fakeHttp({
    debug_token: { data: { is_valid: true, app_id: 'APP' } },
    '/me': { id: '777', name: 'Beto', email: 'BETO@x.cl' },
  });
  const p = await verifyFacebookToken('tok', { http, appId: 'APP', appSecret: 'SEC' });
  expect(p).toEqual({ provider: 'facebook', providerId: '777', email: 'beto@x.cl', name: 'Beto' });
});

test('verifyFacebookToken: token inválido → rechaza', async () => {
  const http = fakeHttp({ debug_token: { data: { is_valid: false } } });
  await expect(verifyFacebookToken('tok', { http, appId: 'APP', appSecret: 'SEC' })).rejects.toThrow('token_fb_invalido');
});

test('verifyFacebookToken: app_id que no es la nuestra → rechaza', async () => {
  const http = fakeHttp({ debug_token: { data: { is_valid: true, app_id: 'OTRA' } } });
  await expect(verifyFacebookToken('tok', { http, appId: 'APP', appSecret: 'SEC' })).rejects.toThrow('app_id_no_coincide');
});

test('verifyFacebookToken: sin email (usuario no lo dio) → email null', async () => {
  const http = fakeHttp({
    debug_token: { data: { is_valid: true, app_id: 'APP' } },
    '/me': { id: '12', name: 'Sin Mail' },
  });
  const p = await verifyFacebookToken('tok', { http, appId: 'APP', appSecret: 'SEC' });
  expect(p.email).toBeNull();
  expect(p.providerId).toBe('12');
});
