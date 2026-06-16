// Hace que el login de la app (empleado) use el mismo correo+clave del panel.
require('dotenv').config();
const { Client } = require('ssh2');

const EMP_ID = 'b9e75703-852f-45ef-82f5-9e7fab840b9e';
const NEW_USUARIO = 'joseantonio.olguinr@gmail.com';
const NEW_PASS = process.argv[2] || 'Z9TnHq9nLxEz';
const REMOTE = '/root/atiko-gastos';

const JS = [
  'require("dotenv").config();',
  'const {getPool}=require("./src/db/pool");',
  'const {hashPassword}=require("./src/auth/password");',
  '(async()=>{',
  '  const db=getPool();',
  '  const ph=await hashPassword(process.env.NEW_PASS);',
  '  const r=await db.query("UPDATE employees SET usuario=$1, password_hash=$2, activo=true WHERE id=$3 RETURNING id,nombre,usuario",[process.env.NEW_USUARIO,ph,process.env.EMP_ID]);',
  '  if(!r.rows[0]){console.error("NO_EMP");process.exit(1);}',
  '  console.log("OK",JSON.stringify(r.rows[0]));',
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
  const env = `EMP_ID='${EMP_ID}' NEW_USUARIO='${NEW_USUARIO}' NEW_PASS='${NEW_PASS}'`;
  const r = await sh(`cd ${REMOTE} && ${env} node -e '${JS}'`);
  console.log(r.o.trim());
  if (r.er.trim()) console.log('stderr:', r.er.trim());
  conn.end();
}).on('error', e => { console.error('SSH error:', e.message); process.exit(1); })
  .connect({ host: process.env.VPS_IP, port: 22, username: 'root', password: process.env.VPS_PASSWORD });
