const axios = require('axios');

const GRAPH = 'https://graph.facebook.com/v20.0';

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

module.exports = { sendText, downloadMedia };
