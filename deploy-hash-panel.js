/**
 * Deploy del build Vite de gastos-app a /root/atiko-gastos/public/panel/ en el VPS.
 * (Eso es lo que sirve gastos.atikodigital.cl/panel/)
 *
 * Sube recursivamente el contenido de gastos-app/dist/ creando los subdirectorios.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('ssh2');
const path = require('path');
const fs = require('fs');

const LOCAL = path.join(__dirname, 'gastos-app', 'dist');
const REMOTE = '/root/atiko-gastos/public/panel';

if (!fs.existsSync(LOCAL)) { console.error('No existe', LOCAL, '— corre npm run build primero.'); process.exit(1); }

// Recorrer dist/ recursivamente
function walk(dir, base = '') {
  const out = [];
  for (const name of fs.readdirSync(path.join(dir, base))) {
    const rel = base ? `${base}/${name}` : name;
    const full = path.join(dir, rel);
    if (fs.statSync(full).isDirectory()) out.push(...walk(dir, rel));
    else out.push(rel);
  }
  return out;
}
const files = walk(LOCAL);
const dirs = Array.from(new Set(files.map((f) => path.posix.dirname(`${REMOTE}/${f.replace(/\\/g, '/')}`))));

console.log(`Deployando ${files.length} archivos a ${REMOTE}...`);

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); process.exit(1); }
    let di = 0;
    (function nextDir() {
      if (di >= dirs.length) return uploadAll(sftp);
      sftp.mkdir(dirs[di++], () => nextDir()); // ignorar error si ya existe
    })();
  });
}).on('error', (e) => { console.error('SSH:', e.message); process.exit(1); })
  .connect({ host: process.env.VPS_IP, port: 22, username: 'root', password: process.env.VPS_PASSWORD });

function uploadAll(sftp) {
  let i = 0;
  (function next() {
    if (i >= files.length) {
      console.log(`\n=== DEPLOY OK (${files.length} archivos) ===`);
      console.log('URL: https://gastos.atikodigital.cl/panel/');
      conn.end();
      return;
    }
    const rel = files[i];
    const local = path.join(LOCAL, rel);
    const remote = `${REMOTE}/${rel.replace(/\\/g, '/')}`;
    if ((i + 1) % 5 === 0 || i === 0 || i === files.length - 1) {
      console.log(`[${i + 1}/${files.length}] ${rel}`);
    }
    sftp.fastPut(local, remote, {}, (e) => {
      if (e) { console.error(`  fail ${rel}:`, e.message); conn.end(); process.exit(1); }
      i++; next();
    });
  })();
}
