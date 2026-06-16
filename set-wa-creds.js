// Carga WHATSAPP_TOKEN y WHATSAPP_PHONE_ID en el .env del VPS y reinicia pm2.
// Uso: node set-wa-creds.js <TOKEN> <PHONE_ID>
require('dotenv').config();
const { Client } = require('ssh2');

const TOKEN = process.argv[2];
const PHONE = process.argv[3];
const STAMP = process.argv[4] || 'wacreds';
if (!TOKEN || !PHONE) { console.error('Uso: node set-wa-creds.js <TOKEN> <PHONE_ID>'); process.exit(1); }

const REMOTE = '/root/atiko-agent';
const conn = new Client();
conn.on('ready', async () => {
  console.log('SSH conectado. Cargando credenciales WhatsApp...');
  const setEnv = (k, v) =>
    `if grep -q '^${k}=' ${REMOTE}/.env; then sed -i 's|^${k}=.*|${k}=${v}|' ${REMOTE}/.env; else echo '${k}=${v}' >> ${REMOTE}/.env; fi`;
  let r = await sh(`cp ${REMOTE}/.env ${REMOTE}/.env.bak.${STAMP} || true; ${setEnv('WHATSAPP_TOKEN', TOKEN)}; ${setEnv('WHATSAPP_PHONE_ID', PHONE)}`);
  if (r.code !== 0) console.log('  env stderr:', r.err.trim());
  r = await sh(`grep -E '^WHATSAPP_(PHONE_ID|VERIFY_TOKEN)=' ${REMOTE}/.env; echo "WHATSAPP_TOKEN len=$(grep '^WHATSAPP_TOKEN=' ${REMOTE}/.env | cut -d= -f2- | tr -d '\\r' | wc -c)"`);
  console.log(r.out.trim());
  console.log('Reiniciando pm2...');
  r = await sh(`pm2 restart atiko-agent --update-env 2>&1 | tail -2`);
  await new Promise(res => setTimeout(res, 1500));
  r = await sh(`curl -s http://localhost:3000/health`);
  console.log('HEALTH:', r.out.trim());
  conn.end();
  console.log('\n=== Credenciales WhatsApp cargadas ===');
}).on('error', e => { console.error('SSH error:', e.message); process.exit(1); })
  .connect({ host: process.env.VPS_IP, port: 22, username: 'root', password: process.env.VPS_PASSWORD });

function sh(cmd){return new Promise((res,rej)=>{conn.exec(cmd,(e,s)=>{if(e)return rej(e);let o='',er='';s.on('data',d=>o+=d).stderr.on('data',d=>er+=d);s.on('close',c=>res({code:c,out:o,err:er}));});});}
