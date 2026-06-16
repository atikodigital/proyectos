// Recon de solo lectura del deploy de gastos en el VPS.
require('dotenv').config();
const { Client } = require('ssh2');

const conn = new Client();
function sh(cmd) {
  return new Promise((res, rej) => conn.exec(cmd, (e, s) => {
    if (e) return rej(e);
    let o = '', er = '';
    s.on('data', d => o += d).stderr.on('data', d => er += d);
    s.on('close', code => res({ code, o, er }));
  }));
}

const LIST = [
  'require("dotenv").config();',
  'const {getPool}=require("./src/db/pool");',
  '(async()=>{',
  '  const db=getPool();',
  '  const r=await db.query("SELECT id,nombre,wa_phone_number_id,owner_whatsapp FROM companies ORDER BY created_at");',
  '  console.log(JSON.stringify(r.rows,null,2));',
  '  await db.end();',
  '})().catch(e=>{console.error("DBERR",e.message);process.exit(1);});',
].join('');

conn.on('ready', async () => {
  let r = await sh('curl -s http://localhost:3100/health');
  console.log('HEALTH:', r.o.trim() || r.er.trim());
  r = await sh('grep -E "^WHATSAPP_(PHONE_ID|TOKEN)=" /root/atiko-agent/.env | sed -E "s/=(.{6}).*/=\\1...(len $(echo -n SET))/" ; echo "PHONE_ID=$(grep \"^WHATSAPP_PHONE_ID=\" /root/atiko-agent/.env | cut -d= -f2- | tr -d \"\\r\")"');
  console.log('AGENT WA:\n' + (r.o.trim() || r.er.trim()));
  r = await sh(`cd /root/atiko-gastos && node -e '${LIST}'`);
  console.log('GASTOS COMPANIES:\n' + (r.o.trim() || r.er.trim()));
  conn.end();
}).on('error', e => { console.error('SSH error:', e.message); process.exit(1); })
  .connect({ host: process.env.VPS_IP, port: 22, username: 'root', password: process.env.VPS_PASSWORD });
