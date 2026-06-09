require('dotenv').config();
const express = require('express');
const { createWebhookRouter } = require('./whatsapp/webhook');
const { getPool } = require('./db/pool');

const app = express();
app.use(express.json({ limit: '15mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'atiko-gastos' });
});

app.use('/api/whatsapp/webhook', createWebhookRouter({ db: getPool() }));

if (require.main === module) {
  const port = process.env.PORT || 3100;
  app.listen(port, () => console.log(`atiko-gastos en :${port}`));
}

module.exports = { app };
