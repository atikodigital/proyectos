// Sube el APK de Atiko Gastos al VPS para servirlo como link público.
require('dotenv').config();
const { Client } = require('ssh2');
const path = require('path');

const LOCAL = path.join(__dirname, 'gastos-app', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'HashIA-release-v3.59.apk');
const REMOTE_DIR = '/root/atiko-gastos/public/panel';
const REMOTE = `${REMOTE_DIR}/HashIA.apk`;

const conn = new Client();
function sh(cmd) {
  return new Promise((res, rej) => conn.exec(cmd, (e, s) => {
    if (e) return rej(e);
    let o = '', er = '';
    s.on('data', d => o += d).stderr.on('data', d => er += d);
    s.on('close', code => res({ code, o, er }));
  }));
}

conn.on('ready', () => {
  conn.sftp(async (err, sftp) => {
    if (err) throw err;
    await sh(`mkdir -p ${REMOTE_DIR}`);
    console.log('Subiendo APK (6.6MB)...');
    sftp.fastPut(LOCAL, REMOTE, {}, async (e) => {
      if (e) { console.error('Error:', e.message); conn.end(); process.exit(1); }
      // Dejar también los links para compatibilidad.
      await sh(`cp ${REMOTE} ${REMOTE_DIR}/AtikoGastos.apk`);
      await sh(`cp ${REMOTE} ${REMOTE_DIR}/HashIA-v1.7.apk`);
      await sh(`cp ${REMOTE} ${REMOTE_DIR}/HashIA-v1.8.apk`);
      const r = await sh(`ls -lh ${REMOTE} ${REMOTE_DIR}/AtikoGastos.apk ${REMOTE_DIR}/HashIA-v1.7.apk ${REMOTE_DIR}/HashIA-v1.8.apk`);
      console.log('OK:\n' + r.o.trim());
      conn.end();
      console.log('LINK NUEVO (HashIA.apk): https://gastos.atikodigital.cl/panel/HashIA.apk');
      console.log('LINK V1.8 (NUEVO): https://gastos.atikodigital.cl/panel/HashIA-v1.8.apk');
      console.log('LINK V1.7 (ANTERIOR): https://gastos.atikodigital.cl/panel/HashIA-v1.7.apk');
      console.log('LINK VIEJO (mismo APK): https://gastos.atikodigital.cl/panel/AtikoGastos.apk');
    });
  });
}).on('error', e => { console.error('SSH error:', e.message); process.exit(1); })
  .connect({ host: process.env.VPS_IP, port: 22, username: 'root', password: process.env.VPS_PASSWORD });
