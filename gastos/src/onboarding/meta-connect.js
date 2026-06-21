/**
 * Cliente Graph API para Embedded Signup / Facebook Login for Business.
 * El cliente final autoriza la app "Atiko Agente"; aquí canjeamos el code por token,
 * suscribimos webhooks y devolvemos credenciales para guardar en companies.wa_token.
 */
const axios = require('axios');

const GV = process.env.META_GRAPH_VERSION || 'v20.0';
const G = `https://graph.facebook.com/${GV}`;
const APP_ID = () => process.env.META_APP_ID || process.env.FB_APP_ID;
const APP_SECRET = () => process.env.META_APP_SECRET || process.env.FB_APP_SECRET;

function requireAppCreds() {
  if (!APP_ID() || !APP_SECRET()) {
    const e = new Error('Falta META_APP_ID o META_APP_SECRET en el .env');
    e.status = 500;
    throw e;
  }
}

async function exchangeCode(code) {
  requireAppCreds();
  const r = await axios.get(`${G}/oauth/access_token`, {
    params: { client_id: APP_ID(), client_secret: APP_SECRET(), code },
    timeout: 15000,
  });
  return r.data.access_token;
}

async function subscribeWaba(wabaId, token) {
  await axios.post(`${G}/${wabaId}/subscribed_apps`, {}, {
    params: { access_token: token }, timeout: 15000,
  });
}

async function registerPhone(phoneId, token, pin) {
  try {
    await axios.post(`${G}/${phoneId}/register`,
      { messaging_product: 'whatsapp', pin: pin || '000000' },
      { params: { access_token: token }, timeout: 15000 });
  } catch (e) { /* puede ya estar registrado */ }
}

async function longLivedToken(shortToken) {
  requireAppCreds();
  const r = await axios.get(`${G}/oauth/access_token`, {
    params: { grant_type: 'fb_exchange_token', client_id: APP_ID(), client_secret: APP_SECRET(), fb_exchange_token: shortToken },
    timeout: 15000,
  });
  return r.data.access_token;
}

async function listPages(userToken) {
  const r = await axios.get(`${G}/me/accounts`, {
    params: { fields: 'id,name,access_token,instagram_business_account', access_token: userToken },
    timeout: 15000,
  });
  return r.data.data || [];
}

async function subscribePage(pageId, pageToken) {
  await axios.post(`${G}/${pageId}/subscribed_apps`,
    { subscribed_fields: 'messages,messaging_postbacks' },
    { params: { access_token: pageToken }, timeout: 15000 });
}

// Información del número (display_name, verified_name, quality_rating) — útil para UI
async function getPhoneInfo(phoneId, token) {
  const r = await axios.get(`${G}/${phoneId}`, {
    params: { fields: 'display_phone_number,verified_name,quality_rating', access_token: token },
    timeout: 15000,
  });
  return r.data || {};
}

module.exports = { exchangeCode, subscribeWaba, registerPhone, longLivedToken, listPages, subscribePage, getPhoneInfo };
