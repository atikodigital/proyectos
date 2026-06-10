require('dotenv').config();
const path = require('path');
const express = require('express');
const { createWebhookRouter } = require('./whatsapp/webhook');
const { createAppRouter } = require('./app/router');
const { createPanelRouter } = require('./panel/router');
const { getPool } = require('./db/pool');

const app = express();
app.use(express.json({ limit: '15mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'atiko-gastos' });
});

app.use('/api/whatsapp/webhook', createWebhookRouter({ db: getPool() }));
app.use('/api/app', createAppRouter({ db: getPool() }));
app.use('/api/panel', createPanelRouter({ db: getPool() }));
app.use('/panel', express.static(path.join(__dirname, '..', 'public', 'panel')));

if (require.main === module) {
  const port = process.env.PORT || 3100;
  app.listen(port, () => console.log(`atiko-gastos en :${port}`));
}

module.exports = { app };
