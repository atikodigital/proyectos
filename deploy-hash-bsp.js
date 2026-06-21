/**
 * Deploy de los archivos BSP nuevos al backend Hash (/root/atiko-gastos):
 *   - src/whatsapp/signature.js  (HMAC validation)
 *   - src/whatsapp/webhook.js    (modificado: activa HMAC)
 *   - src/onboarding/meta-connect.js
 *   - src/onboarding/router.js
 *   - src/legal/data-deletion.js
 *   - src/server.js              (registra nuevas rutas + rawBody)
 * Luego: pm2 restart atiko-gastos
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('ssh2');
const path = require('path');
const fs = require('fs');

const LOCAL_ROOT = path.join(__dirname, 'gastos');
const REMOTE_ROOT = '/root/atiko-gastos';

const files = [
  'src/whatsapp/signature.js',
  'src/whatsapp/webhook.js',
  'src/onboarding/meta-connect.js',
  'src/onboarding/router.js',
  'src/legal/data-deletion.js',
  'src/server.js',
];

// Validar locales
for (const rel of files) {
  const local = path.join(LOCAL_ROOT, rel);
  if (!fs.existsSync(local)) { console.error('Falta:', local); process.exit(1); }
}

// Directorios remotos a crear (mkdir -p)
const dirs = Array.from(new Set(files.map((f) => path.posix.dirname(`${REMOTE_ROOT}/${f.replace(/\\/g, '/')}`))));

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH OK.\n');
  conn.sftp((err, sftp) => {
    if (err) { console.error('SFTP:', err.message); conn.end(); process.exit(1); }
    // Crear dirs via sftp.mkdir uno por uno (ignorar errores de "ya existe")
    let di = 0;
    (function nextDir() {
      if (di >= dirs.length) return uploadAll(sftp);
      const d = dirs[di++];
      sftp.mkdir(d, () => nextDir()); // ignorar error
    })();
  });
}).on('error', (e) => { console.error('SSH:', e.message); process.exit(1); })
  .connect({ host: process.env.VPS_IP, port: 22, username: 'root', password: process.env.VPS_PASSWORD });

function uploadAll(sftp) {
  let i = 0;
  (function next() {
    if (i >= files.length) return restartPm2();
    const rel = files[i];
    const local = path.join(LOCAL_ROOT, rel);
    const remote = `${REMOTE_ROOT}/${rel.replace(/\\/g, '/')}`;
    console.log(`[${i + 1}/${files.length}] ${rel} -> ${remote}`);
    sftp.fastPut(local, remote, {}, (e) => {
      if (e) { console.error('  fail:', e.message); conn.end(); process.exit(1); }
      i++; next();
    });
  })();
}

function restartPm2() {
  console.log('\npm2 restart atiko-gastos...');
  conn.exec('pm2 restart atiko-gastos --update-env 2>&1 | tail -5', (err, stream) => {
    if (err) { console.error(err); conn.end(); process.exit(1); }
    stream.on('data', (d) => process.stdout.write(d.toString()))
      .stderr.on('data', (d) => process.stderr.write(d.toString()))
      .on('close', (code) => {
        console.log(`\n=== DEPLOY HASH BSP OK (pm2 exit ${code}) ===`);
        conn.end();
      });
  });
}
