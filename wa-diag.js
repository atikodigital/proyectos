// Diagnóstico: intenta enviar un WhatsApp con las credenciales de KAI al número del dueño
// y muestra el error EXACTO de Meta (o SENT_OK si llega).
require('dotenv').config();
const { Client } = require('ssh2');

const REMOTE = '/root/atiko-gastos';
const JS = [
  'const fs=require("fs");',
  'const axios=require("axios");',
  'function val(t,k){const m=new RegExp("^"+k+"=(.*)$","m").exec(t);return m?m[1].trim().replace(/\\r$/,""):"";}',
  '(async()=>{',
  '  const agent=fs.readFileSync("/root/atiko-agent/.env","utf8");',
  '  const token=val(agent,"WHATSAPP_TOKEN");',
  '  const phone=val(agent,"WHATSAPP_PHONE_ID");',
  '  console.log("PHONE_ID",phone,"TOKEN_LEN",token.length);',
  '  try{',
  '    const r=await axios.post("https://graph.facebook.com/v20.0/"+phone+"/messages",{messaging_product:"whatsapp",to:"56993300435",type:"text",text:{body:"Prueba Hash IA: tu resumen de flujo de caja llegaria aqui."}},{headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},timeout:20000});',
  '    console.log("SENT_OK",JSON.stringify(r.data));',
  '  }catch(e){',
  '    console.log("SEND_FAIL_STATUS",e.response?e.response.status:"noresp");',
  '    console.log("ERROR_DATA",JSON.stringify(e.response?e.response.data:e.message));',
  '  }',
  '})();',
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
