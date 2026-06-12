// Despliegue del BACKEND del agente al VPS (/root/atiko-agent).
// NO toca el widget ni sobreescribe las keys del .env del VPS.
// Hace respaldo .bak.<ts> de cada archivo antes de reemplazarlo.
require('dotenv').config();
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const LOCAL = path.join(__dirname, 'agent');
const REMOTE = '/root/atiko-agent';
const STAMP = process.argv[2] || 'deploy';

const FILES = [
  'server.js',
  'package.json',
  'services/realtime.js',
  'services/scheduler.js',
  'services/ai.js',
  'services/portal-auth.js',
  'services/crm-db.js',
  'services/crm.js',
  'services/nexo.js',
  'services/whatsapp.js',
  'services/meta-messaging.js',
  'routes/chat.js',
  'routes/portal.js',
  'routes/crm.js',
  'routes/webhook.js',
  'routes/meta-webhook.js',
  'config/prompt.js',
];

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH conectado. Respaldando y subiendo...');
  conn.sftp((err, sftp) => {
    if (err) throw err;
    backupThenUpload(sftp, 0);
  });
}).on('error', e => { console.error('SSH error:', e.message); process.exit(1); })
  .connect({ host: process.env.VPS_IP, port: 22, username: 'root', password: process.env.VPS_PASSWORD });

function sh(cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (e, s) => {
      if (e) return reject(e);
      let out = '', err = '';
      s.on('data', d => out += d).stderr.on('data', d => err += d);
      s.on('close', code => resolve({ code, out, err }));
    });
  });
}

async function backupThenUpload(sftp, i) {
  if (i >= FILES.length) return afterUpload();
  const f = FILES[i];
  const remoteFile = `${REMOTE}/${f}`;
  // backup si existe
  await sh(`[ -f "${remoteFile}" ] && cp "${remoteFile}" "${remoteFile}.bak.${STAMP}" || true`);
  sftp.fastPut(path.join(LOCAL, f), remoteFile, {}, (err) => {
    if (err) { console.error('Error subiendo', f, err.message); conn.end(); process.exit(1); }
    console.log('  ✓ subido:', f);
    backupThenUpload(sftp, i + 1);
  });
}

async function afterUpload() {
  // Ajustar env vars (sin tocar keys existentes): set-or-replace
  const setEnv = (k, v) =>
    `if grep -q '^${k}=' ${REMOTE}/.env; then sed -i 's|^${k}=.*|${k}=${v}|' ${REMOTE}/.env; else echo '${k}=${v}' >> ${REMOTE}/.env; fi`;
  const envCmds = [
    `cp ${REMOTE}/.env ${REMOTE}/.env.bak.${STAMP} || true`,
    setEnv('AGENT_TTS_MODEL', 'gpt-4o-mini-tts'),
    setEnv('AGENT_TTS_VOICE', 'ballad'),
    setEnv('REALTIME_MODEL', 'gpt-realtime'),
    setEnv('REALTIME_VOICE', 'ballad'),
    // Secreto del portal: generar SOLO si no existe (no invalidar sesiones en cada deploy)
    `grep -q '^PORTAL_JWT_SECRET=' ${REMOTE}/.env || echo "PORTAL_JWT_SECRET=$(openssl rand -hex 32)" >> ${REMOTE}/.env`,
  ].join(' && ');

  console.log('Ajustando .env (respaldo + vars de voz)...');
  let r = await sh(envCmds);
  if (r.code !== 0) console.log('  env stderr:', r.err.trim());

  console.log('npm install (ws) en', REMOTE, '...');
  r = await sh(`cd ${REMOTE} && npm install --no-audit --no-fund 2>&1 | tail -3`);
  console.log('  ', r.out.trim());

  console.log('Reiniciando pm2 (con --update-env)...');
  r = await sh(`pm2 restart atiko-agent --update-env 2>&1 | tail -4`);
  console.log('  ', r.out.trim());

  // Esperar y verificar health
  await new Promise(res => setTimeout(res, 1500));
  r = await sh(`curl -s http://localhost:3000/health`);
  console.log('HEALTH:', r.out.trim());

  conn.end();
  console.log('\\n=== Despliegue de backend completado ===');
}
