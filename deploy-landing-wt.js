// Sube landing/dist/ al VPS para servir hash.atikodigital.cl
require('dotenv').config();
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const LOCAL = path.join(__dirname, 'landing', 'dist');
const REMOTE = '/var/www/hash';

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

const conn = new Client();
function sh(cmd) {
  return new Promise((resolve, reject) => conn.exec(cmd, (e, s) => {
    if (e) return reject(e);
    let out = '', err = '';
    s.on('data', d => out += d).stderr.on('data', d => err += d);
    s.on('close', code => resolve({ code, out, err }));
  }));
}

conn.on('ready', () => {
  conn.sftp(async (err, sftp) => {
    if (err) throw err;
    if (!fs.existsSync(LOCAL)) { console.error('Falta landing/dist — corre npm run build'); process.exit(1); }
    const files = walk(LOCAL);
    const dirs = new Set();
    for (const f of files) { const d = path.posix.dirname(f); if (d !== '.') dirs.add(d); }
    await sh(`mkdir -p ${REMOTE} ${[...dirs].map(d => `${REMOTE}/${d}`).join(' ')}`);
    let n = 0;
    for (const f of files) {
      await new Promise((res, rej) => sftp.fastPut(path.join(LOCAL, f), `${REMOTE}/${f}`, {}, e => e ? rej(e) : res()));
      n++;
    }
    console.log(`Subidos ${n} archivos a ${REMOTE}.`);
    conn.end();
    console.log('=== deploy landing OK ===');
  });
}).on('error', e => { console.error('SSH error:', e.message); process.exit(1); })
  .connect({ host: process.env.VPS_IP, port: 22, username: 'root', password: process.env.VPS_PASSWORD });
