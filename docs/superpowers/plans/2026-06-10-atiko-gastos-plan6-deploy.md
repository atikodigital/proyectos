# Plan 6 — Deploy al VPS + onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for PART A (in-repo code). PART B (VPS) se ejecuta INTERACTIVAMENTE con el usuario, confirmando cada paso — NO automatizar a ciegas contra producción.

**Spec:** `docs/superpowers/specs/2026-06-09-atiko-gastos-design.md` (§8 deploy, §5 onboarding)
**Depende de:** Planes 1-5 (backend + app + panel, todo testeado).

**Goal:** Desplegar el backend `atiko-gastos` (API + panel) en el VPS Hostinger (`72.60.245.87`), con su contenedor Postgres propio, detrás de Caddy en `gastos.atikodigital.cl`, y dar de alta la 1ª empresa cliente (owner + empleados) para probar app + WhatsApp en vivo.

**⚠️ Producción:** PART B toca el VPS real (crea contenedor DB, edita Caddy, abre webhook público). Se hace junto al usuario, confirmando cada comando. PART A es 100% en el repo (seguro).

---

## PART A — En el repo (seguro, TDD/escritura + commit)

### Task A1: Hardening de los routers (CORS + errores async)

El APK carga su web empaquetada → su origen es `capacitor://localhost` / `https://localhost`, así que
`/api/app` necesita **CORS**. El panel es mismo-origen (no necesita). Además, Express 4 no atrapa
errores async de los handlers → agregar `express-async-errors` + un error handler global para no
tumbar el proceso.

**Files:**
- Modify: `gastos/package.json` (deps `cors`, `express-async-errors`)
- Modify: `gastos/src/server.js`
- Test: `gastos/tests/hardening.test.js`

- [ ] **Step 1:** Agregar a `gastos/package.json` dependencies: `"cors": "^2.8.5"`, `"express-async-errors": "^3.1.1"`. `cd gastos && npm install`.

- [ ] **Step 2: Escribir el test que falla** `gastos/tests/hardening.test.js`:
```js
const request = require('supertest');
const { app } = require('../src/server');

test('CORS: responde con Access-Control-Allow-Origin', async () => {
  const res = await request(app).get('/health').set('Origin', 'https://localhost');
  expect(res.status).toBe(200);
  expect(res.headers['access-control-allow-origin']).toBeDefined();
});

test('preflight OPTIONS a /api/app/login responde 204/200 con CORS', async () => {
  const res = await request(app).options('/api/app/login')
    .set('Origin', 'https://localhost')
    .set('Access-Control-Request-Method', 'POST');
  expect([200, 204]).toContain(res.status);
  expect(res.headers['access-control-allow-origin']).toBeDefined();
});
```

- [ ] **Step 3: Editar `gastos/src/server.js`:**
  - Como PRIMERA línea ejecutable tras los require de dotenv, agregar `require('express-async-errors');` (parchea Express para reenviar errores async al error handler).
  - Agregar `const cors = require('cors');` y, justo después de crear `app` (antes de las rutas), `app.use(cors());`.
  - Al FINAL, después de TODAS las rutas y ANTES de `if (require.main === module)`, agregar el error handler global:
```js
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[gastos] error:', err && err.message);
  res.status(500).json({ error: 'server_error' });
});
```

- [ ] **Step 4: Correr** `cd gastos && npx jest tests/hardening.test.js` → PASA.

- [ ] **Step 5: Correr TODA la suite** `cd gastos && npx jest` — todo verde (el cors no debe romper nada).

- [ ] **Step 6: Commit**
```bash
git add gastos/package.json gastos/package-lock.json gastos/src/server.js gastos/tests/hardening.test.js
git commit -m "feat(gastos): hardening (CORS para la app + manejo de errores async)"
```

### Task A2: Artefactos de deploy (scripts + config)

Scripts/archivos en el repo. NO ejecutan contra el VPS por sí solos (se corren en PART B).

**Files (crear):**
- `deploy-gastos.js` (raíz del repo) — SFTP recursivo de `gastos/` → `/root/atiko-gastos` + npm + pm2 + health
- `gastos/deploy/docker-compose.yml` — contenedor Postgres `atiko-gastos-db`
- `gastos/deploy/Caddyfile.snippet` — bloque para `gastos.atikodigital.cl`
- `gastos/scripts/migrate.js` — aplica el schema contra `GASTOS_DB_URL`
- `gastos/scripts/seed.js` — crea empresa + owner (panel) + empleados (idempotente-ish)
- `gastos/.env.example` — ya existe; AÑADIR las vars nuevas (DOCAI opcional, WHATSAPP_VERIFY_TOKEN)

- [ ] **Step 1: `deploy-gastos.js`** (raíz). Mira `deploy-agent.js` para el patrón ssh2. Sube
recursivamente `gastos/src/**`, `gastos/public/**`, `gastos/package.json` a `/root/atiko-gastos`
(excluye `node_modules`, `tests`, `.env`). Set-or-replace env: `PORT=3100`, `GASTOS_DB_URL` (default
`postgres://atiko:${GASTOS_DB_PASSWORD}@127.0.0.1:5434/atiko_gastos`), genera `JWT_SECRET` si no
existe; NO pisa `GEMINI_API_KEY`/`DOCAI_*`/`WHATSAPP_*` si ya están. Luego `npm install`,
`pm2 start src/server.js --name atiko-gastos || pm2 restart atiko-gastos --update-env`, y
`curl localhost:3100/health`.
```js
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
    const files = walk(LOCAL).filter(f => f.startsWith('src/') || f.startsWith('public/') || f === 'package.json');
    // crear dirs remotos
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
    console.log('pm2...');
    console.log((await sh(`cd ${REMOTE} && (pm2 describe atiko-gastos >/dev/null 2>&1 && pm2 restart atiko-gastos --update-env || pm2 start src/server.js --name atiko-gastos) 2>&1 | tail -4`)).out.trim());
    await new Promise(r => setTimeout(r, 1500));
    console.log('HEALTH:', (await sh(`curl -s http://localhost:3100/health`)).out.trim());
    conn.end();
    console.log('=== deploy atiko-gastos OK ===');
  });
}).on('error', e => { console.error('SSH error:', e.message); process.exit(1); })
  .connect({ host: process.env.VPS_IP, port: 22, username: 'root', password: process.env.VPS_PASSWORD });
```

- [ ] **Step 2: `gastos/deploy/docker-compose.yml`** (contenedor Postgres propio):
```yaml
services:
  atiko-gastos-db:
    image: postgres:16
    container_name: atiko-gastos-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: atiko
      POSTGRES_PASSWORD: ${GASTOS_DB_PASSWORD}
      POSTGRES_DB: atiko_gastos
    ports:
      - "127.0.0.1:5434:5432"
    volumes:
      - atiko_gastos_data:/var/lib/postgresql/data
volumes:
  atiko_gastos_data:
```

- [ ] **Step 3: `gastos/deploy/Caddyfile.snippet`** (agregar al Caddyfile del VPS):
```
gastos.atikodigital.cl {
    reverse_proxy localhost:3100
}
```
> Nota: el Caddy del VPS corre en Docker (`/root/caddy`). Tras editar el Caddyfile a veces
> `caddy reload` no aplica → `docker restart caddy`. (Visto en el CRM.)

- [ ] **Step 4: `gastos/scripts/migrate.js`** (aplica el schema contra la DB real):
```js
require('dotenv').config();
const { getPool } = require('../src/db/pool');
const { migrate } = require('../src/db/migrate');
(async () => {
  const db = getPool();
  await migrate(db);
  console.log('migrate OK');
  await db.end();
})().catch(e => { console.error('migrate FAIL:', e.message); process.exit(1); });
```

- [ ] **Step 5: `gastos/scripts/seed.js`** (crea empresa + owner + empleados). Reusa los repos.
Lee args/env. Idempotente por email/usuario (no duplica si ya existen).
```js
require('dotenv').config();
const { getPool } = require('../src/db/pool');
const { createCompany, createEmployee, getEmployeeByUsuario } = require('../src/companies/repo');
const { createUser, getUserByEmail } = require('../src/users/repo');
const { hashPassword } = require('../src/auth/password');

// Config por env: SEED_COMPANY, SEED_OWNER_EMAIL, SEED_OWNER_PASS, SEED_WA_PNID, SEED_OWNER_WA
(async () => {
  const db = getPool();
  const nombre = process.env.SEED_COMPANY || 'Empresa Demo';
  const email = process.env.SEED_OWNER_EMAIL || 'demo@atiko.cl';
  const pass = process.env.SEED_OWNER_PASS || 'cambiar123';
  let user = await getUserByEmail(db, email);
  if (user) { console.log('owner ya existe:', email); await db.end(); return; }
  const company = await createCompany(db, {
    nombre,
    wa_phone_number_id: process.env.SEED_WA_PNID || null,
    wa_token: process.env.SEED_WA_TOKEN || null,
    owner_whatsapp: process.env.SEED_OWNER_WA || null,
    resumen_frecuencia: 'mensual',
  });
  user = await createUser(db, { company_id: company.id, email, password_hash: await hashPassword(pass), rol: 'owner' });
  console.log('Empresa:', company.id, '| Owner:', email, '| pass:', pass);
  await db.end();
})().catch(e => { console.error('seed FAIL:', e.message); process.exit(1); });
```

- [ ] **Step 6: Actualizar `gastos/.env.example`** — agregar (si no están): `GASTOS_DB_PASSWORD=`,
`WHATSAPP_VERIFY_TOKEN=atiko_gastos_2026`, `WHATSAPP_TOKEN=`, `WHATSAPP_PHONE_ID=`,
`# Document AI (opcional; si falta, el OCR usa solo Gemini)` + `GOOGLE_APPLICATION_CREDENTIALS=`.

- [ ] **Step 7: Sanity (parse) de los scripts:** `node --check deploy-gastos.js`, `node --check gastos/scripts/seed.js`, `node --check gastos/scripts/migrate.js` — sin errores de sintaxis. (NO ejecutarlos.)

- [ ] **Step 8: Commit**
```bash
git add deploy-gastos.js gastos/deploy gastos/scripts gastos/.env.example
git commit -m "feat(gastos): artefactos de deploy (deploy-gastos.js, compose Postgres, Caddy, migrate, seed)"
```

---

## PART B — En el VPS (INTERACTIVO, con el usuario)

> NO automatizar. Cada paso se confirma. Requiere inputs del usuario.

**B0. Prerequisitos del usuario (recolectar ANTES):**
- [ ] DNS: crear registro **A** `gastos.atikodigital.cl` → `72.60.245.87` (lo hace el usuario en su DNS). Verificar con `nslookup gastos.atikodigital.cl`.
- [ ] Elegir `GASTOS_DB_PASSWORD` (password de la DB).
- [ ] `GEMINI_API_KEY` (la del proyecto fondeado de MAXXX) para el OCR/Gemini.
- [ ] (Opcional) Document AI: proyecto GCP + processor + service-account JSON. Si NO está, el OCR corre **solo con Gemini** (extract.js degrada solo). Se puede agregar después.
- [ ] WhatsApp del cliente: un número conectado a la Cloud API → `WHATSAPP_TOKEN` (permanente) + `phone_number_id`. (Playbook: skill `deploy-omnichannel-agent`.)

**B1. Levantar la DB:** subir `gastos/deploy/docker-compose.yml` a `/root/atiko-gastos-db/`, crear `.env` con `GASTOS_DB_PASSWORD`, `docker compose up -d`. Verificar `docker ps | grep atiko-gastos-db`.

**B2. Desplegar el backend:** desde el checkout principal (tiene `.env` con VPS_IP/PASSWORD y `GASTOS_DB_PASSWORD`): `node deploy-gastos.js`. Setear keys que faltan en `/root/atiko-gastos/.env` (GEMINI_API_KEY, AGENT_PROVIDER=gemini, WHATSAPP_TOKEN, WHATSAPP_PHONE_ID) y `pm2 restart atiko-gastos --update-env`.

**B3. Migrar el schema:** en el VPS, `cd /root/atiko-gastos && node scripts/migrate.js` → crea las 4 tablas.

**B4. Caddy:** agregar el bloque `gastos.atikodigital.cl` al Caddyfile del VPS, `caddy reload` (o `docker restart caddy`). Verificar HTTPS: `curl https://gastos.atikodigital.cl/health`.

**B5. Seed de la 1ª empresa:** en el VPS, con las env `SEED_*`, `node scripts/seed.js` → crea empresa + owner. Anotar email/pass del owner.

**B6. WhatsApp:** suscribir la app de Meta al número del cliente y poner el webhook
`https://gastos.atikodigital.cl/api/whatsapp/webhook` (verify token = `WHATSAPP_VERIFY_TOKEN`).
Registrar los teléfonos de los empleados (whitelist) — por el panel (Empleados) o seed.

**B7. Pruebas e2e en vivo:**
- [ ] Panel: abrir `https://gastos.atikodigital.cl/panel`, login con el owner, ver tabla vacía.
- [ ] App: en el APK, setear `VITE_API_BASE=https://gastos.atikodigital.cl` (rebuild) y entrar con un empleado.
- [ ] WhatsApp: mandar foto de una boleta real al número → confirmar respuesta del bot → ver el gasto en el panel.

---

## Cierre del Plan 6 / del MVP

Al terminar PART A: scripts y config en el repo, testeados/parseados, listos. PART B deja `atiko-gastos`
corriendo en `gastos.atikodigital.cl` con su DB, la 1ª empresa dada de alta, y app/panel/WhatsApp
probados en vivo. **MVP completo.**

**Post-MVP:** Document AI real, cron del resumen programado, storage de fotos (`foto_path`), rate-limit,
nombre de empleado en tabla/Excel, multi-tenant para más clientes, firmar APK release.
