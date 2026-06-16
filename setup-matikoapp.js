// R2: convierte la empresa de gastos en "matikoapp" y le conecta el número de WhatsApp
// de Atiko (KAI), leyendo el token del .env de atiko-agent EN EL VPS (no pasa por local).
require('dotenv').config();
const { Client } = require('ssh2');

const COMPANY_ID = '3a578c07-9ca1-48a7-8035-3a8ac838d6ae';
const OWNER_WA = '56993300435';
const REMOTE = '/root/atiko-gastos';

const JS = [
  'require("dotenv").config();',
  'const fs=require("fs");',
  'const {getPool}=require("./src/db/pool");',
  'function val(t,k){const m=new RegExp("^"+k+"=(.*)$","m").exec(t);return m?m[1].trim().replace(/\\r$/,""):"";}',
  '(async()=>{',
  '  const agent=fs.readFileSync("/root/atiko-agent/.env","utf8");',
  '  const token=val(agent,"WHATSAPP_TOKEN");',
  '  const phone=val(agent,"WHATSAPP_PHONE_ID");',
  '  if(!token||!phone){console.error("FALTAN_CREDS_AGENTE");process.exit(1);}',
  '  const db=getPool();',
  '  const r=await db.query("UPDATE companies SET nombre=$1, owner_whatsapp=$2, wa_phone_number_id=$3, wa_token=$4 WHERE id=$5 RETURNING id,nombre,owner_whatsapp,wa_phone_number_id",["matikoapp",process.env.OWNER_WA,phone,token,process.env.COMPANY_ID]);',
  '  if(!r.rows[0]){console.error("NO_COMPANY");process.exit(1);}',
  '  console.log("COMPANY:",JSON.stringify(r.rows[0]));',
  '  const v=await db.query("SELECT tipo, estado_pago, wa_sender_name FROM expenses LIMIT 1");',
  '  console.log("V2_COLUMNS_OK");',
  '  await db.end();',
  '})().catch(e=>{console.error("ERR",e.message);process.exit(1);});',
].join('');

const conn = new Client();
function sh(cmd) {
  return new Promise((res, rej) => conn.exec(cmd, (e, s) => {
    if (e) return rej(e);
    let o = '', er = '';
    s.on('data', d => o += d).stderr.on('data', d => er += d);
    s.on('close', code => res({ code, o, er }));
  }));
}
conn.on('ready', async () => {
  const env = `COMPANY_ID='${COMPANY_ID}' OWNER_WA='${OWNER_WA}'`;
  const r = await sh(`cd ${REMOTE} && ${env} node -e '${JS}'`);
  console.log(r.o.trim());
  if (r.er.trim()) console.log('stderr:', r.er.trim());
  conn.end();
}).on('error', e => { console.error('SSH error:', e.message); process.exit(1); })
  .connect({ host: process.env.VPS_IP, port: 22, username: 'root', password: process.env.VPS_PASSWORD });
