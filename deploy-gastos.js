// deploy-gastos.js — Despliega el backend atiko-gastos al VPS (/root/atiko-gastos).
require('dotenv').config();
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const LOCAL = path.join(__dirname, 'gastos');
const REMOTE = '/root/atiko-gastos';
const STAMP = process.argv[2] || String(Date.now());
const EXCLUDE_DIR = new Set(['node_modules', 'tests', '.git']);

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
    for (const f of files) {
      await new Promise((res, rej) => sftp.fastPut(path.join(LOCAL, f), `${REMOTE}/${f}`, {}, e => e ? rej(e) : res()));
      console.log('  ✓', f);
    }
    const setEnv = (k, v) => `if grep -q '^${k}=' ${REMOTE}/.env 2>/dev/null; then sed -i 's|^${k}=.*|${k}=${v}|' ${REMOTE}/.env; else echo '${k}=${v}' >> ${REMOTE}/.env; fi`;
    const pass = process.env.GASTOS_DB_PASSWORD || 'CHANGE_ME';
    await sh(`touch ${REMOTE}/.env && cp ${REMOTE}/.env ${REMOTE}/.env.bak.${STAMP} || true`);
    await sh([
      setEnv('PORT', '3100'),
      setEnv('GASTOS_DB_URL', `postgres://atiko:${pass}@127.0.0.1:5434/atiko_gastos`),
      `grep -q '^JWT_SECRET=' ${REMOTE}/.env || echo "JWT_SECRET=$(openssl rand -hex 32)" >> ${REMOTE}/.env`,
      `grep -q '^WHATSAPP_VERIFY_TOKEN=' ${REMOTE}/.env || echo "WHATSAPP_VERIFY_TOKEN=atiko_gastos_2026" >> ${REMOTE}/.env`,
    ].join(' && '));
    console.log('npm install...');
    console.log((await sh(`cd ${REMOTE} && npm install --no-audit --no-fund 2>&1 | tail -3`)).out.trim());
    console.log('migrating database...');
    console.log((await sh(`cd ${REMOTE} && node scripts/migrate.js`)).out.trim());
    console.log('pm2...');
    console.log((await sh(`cd ${REMOTE} && (pm2 describe atiko-gastos >/dev/null 2>&1 && pm2 restart atiko-gastos --update-env || pm2 start src/server.js --name atiko-gastos) 2>&1 | tail -4`)).out.trim());
    await new Promise(r => setTimeout(r, 1500));
    console.log('HEALTH:', (await sh(`curl -s http://localhost:3100/health`)).out.trim());
    conn.end();
    console.log('=== deploy atiko-gastos OK ===');
  });
}).on('error', e => { console.error('SSH error:', e.message); process.exit(1); })
  .connect({ host: process.env.VPS_IP, port: 22, username: 'root', password: process.env.VPS_PASSWORD });
