/**
 * Helper para setear vars Meta/BSP en el .env de Hash (/root/atiko-gastos/.env).
 * Mismo patrón que set-meta-creds.js de Atiko pero apunta al .env de gastos.
 *
 *   node set-hash-meta-creds.js APP_ID=1984026305635037 APP_SECRET=xxx WA_ES_CONFIG_ID=yyy HASH_APP_URL=https://matiko.atikodigital.cl
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('ssh2');

const MAP = {
  APP_ID: 'META_APP_ID',
  APP_SECRET: 'META_APP_SECRET',
  WA_ES_CONFIG_ID: 'META_WA_ES_CONFIG_ID',
  GRAPH_VERSION: 'META_GRAPH_VERSION',
  HASH_APP_URL: 'HASH_APP_URL',
  HASH_PUBLIC_URL: 'HASH_PUBLIC_URL',
};

const args = {};
for (const arg of process.argv.slice(2)) {
  const [k, ...rest] = arg.split('=');
  if (k && rest.length) args[k.trim()] = rest.join('=');
}

const sets = [];
for (const [shortK, envK] of Object.entries(MAP)) if (args[shortK]) sets.push([envK, args[shortK]]);
if (!sets.length) {
  console.log('Uso: node set-hash-meta-creds.js APP_ID=... APP_SECRET=...');
  console.log('Vars: ' + Object.keys(MAP).join(', '));
  process.exit(0);
}

const envFile = '/root/atiko-gastos/.env';
const shell = sets.map(([k, v]) => {
  const esc = v.replace(/[\\/&]/g, '\\$&');
  return `if grep -q '^${k}=' ${envFile} 2>/dev/null; then ` +
         `sed -i 's|^${k}=.*|${k}=${esc}|' ${envFile}; ` +
         `else echo '${k}=${v}' >> ${envFile}; fi`;
}).join(' && ');
const cmd = `${shell} && pm2 restart atiko-gastos --update-env && pm2 logs atiko-gastos --lines 4 --nostream 2>&1 | tail -8`;
console.log('Aplicando a Hash:', sets.map(([k]) => k).join(', '));

const conn = new Client();
conn.on('ready', () => {
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); process.exit(1); }
    stream.on('data', (d) => process.stdout.write(d.toString()))
      .stderr.on('data', (d) => process.stderr.write(d.toString()))
      .on('close', () => { conn.end(); console.log('\n=== OK ==='); });
  });
}).on('error', (e) => { console.error('SSH:', e.message); process.exit(1); })
  .connect({ host: process.env.VPS_IP, port: 22, username: 'root', password: process.env.VPS_PASSWORD });
