// Verificación server-side de los tokens de login social (Google / Facebook).
// El navegador/app obtiene el token del proveedor y NOS lo manda; acá confirmamos
// con el proveedor que es legítimo y sacamos el perfil (id estable, email, nombre).
// Nunca confiamos en datos que mande el cliente sin verificar contra el proveedor.
const axios = require('axios');

const GOOGLE_ISS = ['accounts.google.com', 'https://accounts.google.com'];

// Verifica un ID token de Google. Acepta el client_id web y el de Android (APK).
async function verifyGoogleIdToken(idToken, {
  http = axios,
  clientId = process.env.GOOGLE_CLIENT_ID,
  androidClientId = process.env.GOOGLE_ANDROID_CLIENT_ID,
} = {}) {
  if (!idToken) throw new Error('falta_id_token');
  const allowed = [clientId, androidClientId].filter(Boolean);
  if (!allowed.length) throw new Error('GOOGLE_CLIENT_ID no configurado');
  let data;
  try {
    const r = await http.get('https://oauth2.googleapis.com/tokeninfo', { params: { id_token: idToken }, timeout: 10000 });
    data = r.data || {};
  } catch (e) {
    throw new Error('token_google_invalido');
  }
  if (!allowed.includes(data.aud)) throw new Error('aud_invalida');
  if (!GOOGLE_ISS.includes(data.iss)) throw new Error('iss_invalida');
  const verified = data.email_verified === true || data.email_verified === 'true';
  if (!data.email || !verified) throw new Error('email_no_verificado');
  return {
    provider: 'google',
    providerId: String(data.sub),
    email: String(data.email).trim().toLowerCase(),
    name: data.name || '',
  };
}

// Verifica un access token de Facebook contra la propia app (debug_token) y trae el perfil.
async function verifyFacebookToken(accessToken, {
  http = axios,
  appId = process.env.FB_APP_ID || process.env.META_APP_ID,
  appSecret = process.env.FB_APP_SECRET || process.env.META_APP_SECRET,
} = {}) {
  if (!accessToken) throw new Error('falta_access_token');
  if (!appId || !appSecret) throw new Error('FB_APP_ID/SECRET no configurado');
  const appToken = `${appId}|${appSecret}`;
  let dbg;
  try {
    const r = await http.get('https://graph.facebook.com/debug_token', { params: { input_token: accessToken, access_token: appToken }, timeout: 10000 });
    dbg = (r.data && r.data.data) || {};
  } catch (e) {
    throw new Error('token_fb_invalido');
  }
  if (!dbg.is_valid) throw new Error('token_fb_invalido');
  if (String(dbg.app_id) !== String(appId)) throw new Error('app_id_no_coincide');
  let me;
  try {
    const r = await http.get('https://graph.facebook.com/me', { params: { fields: 'id,name,email', access_token: accessToken }, timeout: 10000 });
    me = r.data || {};
  } catch (e) {
    throw new Error('perfil_fb_no_disponible');
  }
  return {
    provider: 'facebook',
    providerId: String(me.id),
    email: me.email ? String(me.email).trim().toLowerCase() : null,
    name: me.name || '',
  };
}

module.exports = { verifyGoogleIdToken, verifyFacebookToken };
