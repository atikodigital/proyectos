jest.mock('axios');
const axios = require('axios');
const { sendText, downloadMedia } = require('../../src/whatsapp/client');

test('sendText postea al endpoint de mensajes con el token', async () => {
  axios.post.mockResolvedValue({ data: { messages: [{ id: 'wamid.1' }] } });
  const r = await sendText({ to: '56988887777', body: 'hola', token: 'TKN', phoneNumberId: 'PNID' });
  expect(r.messages[0].id).toBe('wamid.1');
  const [url, payload, cfg] = axios.post.mock.calls[0];
  expect(url).toContain('/PNID/messages');
  expect(payload).toMatchObject({ to: '56988887777', type: 'text', text: { body: 'hola' } });
  expect(cfg.headers.Authorization).toBe('Bearer TKN');
});

test('downloadMedia resuelve la url y baja el buffer', async () => {
  axios.get
    .mockResolvedValueOnce({ data: { url: 'https://media.example/abc' } })
    .mockResolvedValueOnce({ data: Buffer.from('IMG'), headers: { 'content-type': 'image/jpeg' } });
  const out = await downloadMedia({ mediaId: 'MID', token: 'TKN' });
  expect(out.buffer.toString()).toBe('IMG');
  expect(out.mimeType).toBe('image/jpeg');
  expect(axios.get.mock.calls[0][0]).toContain('/MID');
  expect(axios.get.mock.calls[1][1].responseType).toBe('arraybuffer');
});
