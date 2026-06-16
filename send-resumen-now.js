// Dispara el endpoint real del panel (login dueño + POST /whatsapp/resumen).
require('dotenv').config();
const { Client } = require('ssh2');
const REMOTE = '/root/atiko-gastos';
const JS = [
  'const axios=require("axios");',
  '(async()=>{',
  '  const L=await axios.post("http://localhost:3100/api/panel/login",{email:"joseantonio.olguinr@gmail.com",password:"3108olguin"});',
  '  const t=L.data.token;',
  '  const R=await axios.post("http://localhost:3100/api/panel/whatsapp/resumen",{},{headers:{Authorization:"Bearer "+t}});',
  '  console.log("RESUMEN_OK",JSON.stringify(R.data));',
  '})().catch(e=>{console.log("FAIL",e.response?("status "+e.response.status+" "+JSON.stringify(e.response.data)):e.message);});',
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
  const r = await sh(`cd ${REMOTE} && node -e '${JS}'`);
  console.log(r.o.trim());
  if (r.er.trim()) console.log('stderr:', r.er.trim());
  conn.end();
}).on('error', e => { console.error('SSH error:', e.message); process.exit(1); })
  .connect({ host: process.env.VPS_IP, port: 22, username: 'root', password: process.env.VPS_PASSWORD });
