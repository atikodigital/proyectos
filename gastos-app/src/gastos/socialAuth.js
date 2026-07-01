// Login social NATIVO para la APK (Android) con @capgo/capacitor-social-login.
// El plugin obtiene el token del proveedor en el teléfono; el backend lo verifica
// con el MISMO endpoint que usa la web (/api/onboarding/oauth/google|facebook).
import { Capacitor } from '@capacitor/core';

// El Web Client ID de Google sirve como serverClientId: el idToken se emite con
// audience = este id, que es el GOOGLE_CLIENT_ID que el backend ya valida.
const GOOGLE_WEB_CLIENT_ID = '790192917762-b6vt4u7ijukim3qlaastuhim20o9gof4.apps.googleusercontent.com';
const FB_APP_ID = '2190451791731005';
// Client Token de Meta (Configuración → Avanzada → Token de cliente). Es un valor
// pensado para apps cliente (no es el App Secret), seguro de incluir en la APK.
const FB_CLIENT_TOKEN = 'ca26f3755d7d456d3ef97dc697401514';

let _plugin = null;
async function ensureInit() {
  if (_plugin) return _plugin;
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  const cfg = { google: { webClientId: GOOGLE_WEB_CLIENT_ID } };
  if (FB_CLIENT_TOKEN) cfg.facebook = { appId: FB_APP_ID, clientToken: FB_CLIENT_TOKEN };
  await SocialLogin.initialize(cfg);
  _plugin = SocialLogin;
  return SocialLogin;
}

// Solo tiene sentido en el teléfono (Capacitor nativo), no en el navegador.
export function googleDisponible() { return Capacitor.isNativePlatform(); }
export function facebookDisponible() { return Capacitor.isNativePlatform() && !!FB_CLIENT_TOKEN; }

export async function googleNativeLogin() {
  const SocialLogin = await ensureInit();
  const res = await SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
  const r = (res && res.result) || {};
  if (!r.idToken) throw new Error('sin_idToken');
  return r.idToken;
}

export async function facebookNativeLogin() {
  const SocialLogin = await ensureInit();
  const res = await SocialLogin.login({ provider: 'facebook', options: { permissions: ['public_profile', 'email'] } });
  const r = (res && res.result) || {};
  const token = r.accessToken && r.accessToken.token;
  if (!token) throw new Error('sin_accessToken');
  return token;
}
