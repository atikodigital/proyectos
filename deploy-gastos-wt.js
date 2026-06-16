// Despliega el backend atiko-gastos DESDE EL WORKTREE (código v2) al VPS.
// NO modifica el .env de producción: solo sube archivos, npm install y reinicia pm2.
require('dotenv').config();
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const LOCAL = 'C:\\Users\\josea\\Desktop\\proyectos\\paginas web\\atiko\\HASH IA\\gastos';
const REMOTE = '/root/atiko-gastos';
const EXCLUDE_DIR = new Set(['node_modules', 'tests', '.git', 'deploy']);

function walk(dir, base = '') {
  const out = [];
  for (const name of fs.readdirSync(path.join(dir, base))) {
    const rel = base ? `${base}/${name}` : name;
    if (EXCLUDE_DIR.has(name)) continue;
    const full = path.join(dir, rel);
    if (fs.statSync(full).isDirectory()) out.push(...walk(dir, rel));
    else if (name !== '.env') out.push(rel);
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
    const files = walk(LOCAL).filter(f => f.startsWith('src/') || f.startsWith('public/') || f.startsWith('scripts/') || f === 'package.json');
    const dirs = new Set();
    for (const f of files) { const d = path.posix.dirname(f); if (d !== '.') dirs.add(d); }
    await sh(`mkdir -p ${REMOTE} ${[...dirs].map(d => `${REMOTE}/${d}`).join(' ')}`);
    let n = 0;
    for (const f of files) {
      await new Promise((res, rej) => sftp.fastPut(path.join(LOCAL, f), `${REMOTE}/${f}`, {}, e => e ? rej(e) : res()));
      n++;
    }
    console.log(`Subidos ${n} archivos.`);
    console.log('npm install...');
    console.log((await sh(`cd ${REMOTE} && npm install --no-audit --no-fund 2>&1 | tail -2`)).out.trim());
    console.log('pm2 restart...');
    console.log((await sh(`cd ${REMOTE} && pm2 restart atiko-gastos --update-env 2>&1 | tail -3`)).out.trim());
    await new Promise(r => setTimeout(r, 1500));
    console.log('HEALTH:', (await sh(`curl -s http://localhost:3100/health`)).out.trim());
    conn.end();
    console.log('=== deploy worktree OK ===');
  });
}).on('error', e => { console.error('SSH error:', e.message); process.exit(1); })
  .connect({ host: process.env.VPS_IP, port: 22, username: 'root', password: process.env.VPS_PASSWORD });
