require('dotenv').config();
require('express-async-errors');
const path = require('path');
const cors = require('cors');
const express = require('express');
const { createWebhookRouter } = require('./whatsapp/webhook');
const { createAppRouter } = require('./app/router');
const { createPanelRouter } = require('./panel/router');
const { createAdminRouter } = require('./admin/router');
const { getPool } = require('./db/pool');

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'atiko-gastos' });
});

app.use('/api/whatsapp/webhook', createWebhookRouter({ db: getPool() }));
app.use('/api/app', createAppRouter({ db: getPool() }));
app.use('/api/panel', createPanelRouter({ db: getPool() }));
app.use('/api/admin', createAdminRouter({ db: getPool() }));
app.use('/panel', express.static(path.join(__dirname, '..', 'public', 'panel'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[gastos] error:', err && err.message);
  res.status(500).json({ error: 'server_error' });
});

if (require.main === module) {
  const port = process.env.PORT || 3100;
  app.listen(port, () => console.log(`atiko-gastos en :${port}`));
}

module.exports = { app };
