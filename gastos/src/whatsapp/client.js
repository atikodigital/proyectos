const axios = require('axios');
const FormData = require('form-data');

const GRAPH = 'https://graph.facebook.com/v20.0';

// Sube un buffer de imagen al endpoint de media de WhatsApp Cloud y devuelve el media_id.
async function uploadMedia({ buffer, mimeType, token, phoneNumberId }) {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimeType || 'image/jpeg');
  form.append('file', buffer, { filename: 'evidencia', contentType: mimeType || 'image/jpeg' });
  const res = await axios.post(`${GRAPH}/${phoneNumberId}/media`, form, {
    headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() }, timeout: 30000,
    maxContentLength: Infinity, maxBodyLength: Infinity,
  });
  return res.data && res.data.id;
}

// Envía una imagen (buffer) al cliente: primero la sube como media, luego manda el mensaje.
async function sendImage({ to, buffer, mimeType, caption, token, phoneNumberId }) {
  const mediaId = await uploadMedia({ buffer, mimeType, token, phoneNumberId });
  const image = { id: mediaId };
  if (caption && String(caption).trim()) image.caption = String(caption);
  const res = await axios.post(
    `${GRAPH}/${phoneNumberId}/messages`,
    { messaging_product: 'whatsapp', to, type: 'image', image },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 20000 }
  );
  return res.data;
}

async function sendText({ to, body, token, phoneNumberId }) {
  const res = await axios.post(
    `${GRAPH}/${phoneNumberId}/messages`,
    { messaging_product: 'whatsapp', to, type: 'text', text: { body } },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 20000 }
  );
  return res.data;
}

async function downloadMedia({ mediaId, token }) {
  const meta = await axios.get(`${GRAPH}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` }, timeout: 20000,
  });
  const url = meta.data.url;
  const bin = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` }, responseType: 'arraybuffer', timeout: 30000,
  });
  return {
    buffer: Buffer.from(bin.data),
    mimeType: (bin.headers && bin.headers['content-type']) || 'image/jpeg',
  };
}

module.exports = { sendText, sendImage, uploadMedia, downloadMedia };
