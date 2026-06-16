// Sube el APK COMPILADO EN EL WORKTREE (donde Claude construye) al VPS.
// Independiente de upload-apk.js (que a veces se edita y apunta a otra carpeta).
require('dotenv').config();
const { Client } = require('ssh2');

// argv[3] opcional = ruta de origen (p. ej. el APK firmado de release). Por defecto, el debug del worktree.
const LOCAL = process.argv[3] || 'C:\\Users\\josea\\Desktop\\proyectos\\paginas web\\atiko\\HASH IA\\gastos-app\\android\\app\\build\\outputs\\apk\\debug\\HashIA-debug-v1.0.apk';
const REMOTE_DIR = '/root/atiko-gastos/public/panel';
const NAME = process.argv[2] || 'HashIA.apk'; // nombre destino (ej: HashIA-v2.apk)
const REMOTE = `${REMOTE_DIR}/${NAME}`;

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
    console.log('Subiendo (worktree) ->', NAME);
    sftp.fastPut(LOCAL, REMOTE, {}, async (e) => {
      if (e) { console.error('Error fastPut:', e.message); conn.end(); process.exit(1); }
      await sh(`cp ${REMOTE} ${REMOTE_DIR}/HashIA.apk`);
      const r = await sh(`ls -lh ${REMOTE}; md5sum ${REMOTE}; echo 'strings nuevos:'; unzip -p ${REMOTE} 'assets/public/assets/*.js' 2>/dev/null | grep -oE 'Este mes|v2\\.0|Transaccional' | sort | uniq -c`);
      console.log(r.o.trim());
      if (r.er.trim()) console.log('stderr:', r.er.trim());
      conn.end();
      console.log('LINK: https://gastos.atikodigital.cl/panel/' + NAME);
    });
  });
}).on('error', e => { console.error('SSH error:', e.message); process.exit(1); })
  .connect({ host: process.env.VPS_IP, port: 22, username: 'root', password: process.env.VPS_PASSWORD });
