# Landing Hash IA con KALY en vivo (JARVIS HUD) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **UBICACIÓN:** Todo se trabaja dentro de `C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\` (repo independiente, branch `master`). La landing nueva vive en `HASH IA\landing\`. Antes de commitear: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git rev-parse --show-toplevel && git branch --show-current` → toplevel termina en `HASH IA`, branch `master`. `git add <archivos específicos>`. El usuario tiene config git local en este repo (José). Windows/PowerShell; Bash tool disponible.

**Goal:** Sitio público `hash.atikodigital.cl` cuyo hero es KALY, un agente de voz Gemini Live estilo J.A.R.V.I.S. que vende Hash IA, seguido de secciones de marketing y CTAs (descargar app + WhatsApp).

**Architecture:** App Vite+React+Tailwind estática en `HASH IA\landing`. KALY reusa el patrón `openLiveSession` (WS BidiGenerateContent v1alpha) con un token efímero servido por un endpoint público del agente (rate-limit + CORS). Orbe HUD en canvas. Secciones construidas con el MCP de 21st.dev. Deploy del `dist/` al VPS (Caddy).

**Tech Stack:** Vite, React 18, TailwindCSS, Jest + React Testing Library, Gemini Live (WebSocket), Caddy, SFTP (ssh2).

Spec: `HASH IA\docs\superpowers\specs\2026-06-17-landing-hash-kaly-design.md`.

## Estructura de archivos (landing/)
```
landing/
  package.json, vite.config.js, index.html, postcss.config.js, tailwind.config.js
  babel.config.cjs, jest.config.cjs
  src/
    main.jsx, App.jsx, index.css
    kaly/ token.js, prompt.js, tools.js, live.js, Orb.jsx, Hero.jsx
    sections/ DosFamilias.jsx, ComoFunciona.jsx, Features.jsx, Planes.jsx, CtaFinal.jsx, Footer.jsx
  tests/ token.test.js, tools.test.js, Hero.test.jsx
```

---

## FASE 1 — Scaffold + deploy

### Task 1: Scaffold Vite+React+Tailwind+Jest en `landing/`

**Files (crear todos):** `landing/package.json`, `landing/vite.config.js`, `landing/index.html`, `landing/postcss.config.js`, `landing/tailwind.config.js`, `landing/babel.config.cjs`, `landing/jest.config.cjs`, `landing/src/main.jsx`, `landing/src/App.jsx`, `landing/src/index.css`.

- [ ] **Step 1: Crear los archivos del scaffold**

`landing/package.json`:
```json
{
  "name": "hashia-landing",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host",
    "build": "vite build",
    "preview": "vite preview",
    "test": "jest"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@babel/preset-env": "^7.24.0",
    "@babel/preset-react": "^7.24.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^14.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.18",
    "babel-jest": "^29.7.0",
    "jest": "^29.7.0",
    "jest-environment-jsdom": "^29.7.0",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "vite": "^5.1.0"
  }
}
```

`landing/vite.config.js`:
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { port: 5173 } });
```

`landing/index.html`:
```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Hash IA — La IA que le lleva las cuentas y las ventas a tu pyme</title>
    <meta name="description" content="Hash IA: registra gastos por foto o voz, concilia con el SII y el banco, arma pedidos y catálogo. Tu asistente contable y de ventas con inteligencia artificial." />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

`landing/postcss.config.js`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`landing/tailwind.config.js`:
```js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        hud: { bg: '#00060a', panel: '#010d14', cyan: '#19C3FF', cyandim: '#0a6e8c', gold: '#C9A24B', text: '#8ffcff' },
      },
      fontFamily: { mono: ['"Share Tech Mono"', 'ui-monospace', 'monospace'] },
    },
  },
  plugins: [],
};
```

`landing/babel.config.cjs`:
```js
module.exports = { presets: [['@babel/preset-env', { targets: { node: 'current' } }], ['@babel/preset-react', { runtime: 'automatic' }]] };
```

`landing/jest.config.cjs`:
```js
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['@testing-library/jest-dom'],
  transform: { '^.+\\.(js|jsx)$': 'babel-jest' },
  moduleNameMapper: { '\\.(css)$': '<rootDir>/tests/styleMock.cjs' },
  testMatch: ['<rootDir>/tests/**/*.test.{js,jsx}'],
};
```

`landing/tests/styleMock.cjs`:
```js
module.exports = {};
```

`landing/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
html, body, #root { margin: 0; background: #00060a; color: #cfeaf3; }
```

`landing/src/main.jsx`:
```jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
```

`landing/src/App.jsx` (placeholder mínimo, se completa en Task 11):
```jsx
import React from 'react';
export default function App() {
  return <div className="min-h-screen bg-hud-bg text-hud-text flex items-center justify-center font-mono">HASH IA — landing (scaffold)</div>;
}
```

- [ ] **Step 2: Instalar y verificar build**

Run:
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\landing" && npm install 2>&1 | tail -3 && npm run build 2>&1 | tail -5
```
Expected: `npm install` OK y `vite build` termina con `✓ built`. (jsdom/babel/jest instalados para fases siguientes.)

- [ ] **Step 3: GUARDA y commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git rev-parse --show-toplevel && git branch --show-current && git add landing/package.json landing/package-lock.json landing/vite.config.js landing/index.html landing/postcss.config.js landing/tailwind.config.js landing/babel.config.cjs landing/jest.config.cjs landing/tests/styleMock.cjs landing/src/main.jsx landing/src/App.jsx landing/src/index.css && git commit -m "feat(landing): scaffold Vite+React+Tailwind+Jest"
```
(No commitear `landing/node_modules` ni `landing/dist`. Si no existe `landing/.gitignore`, créalo con `node_modules` y `dist` y agrégalo al commit.)

---

### Task 2: Script de deploy + bloque Caddy

**Files:** `HASH IA\deploy-landing-wt.js` (crear), `HASH IA\docs\landing-caddy.md` (crear, doc).

- [ ] **Step 1: Crear `deploy-landing-wt.js`** (calca el patrón de `upload-apk-wt.js`: usa `ssh2` + `dotenv` con `VPS_IP`/`VPS_PASSWORD` del `.env`; sube recursivamente `landing/dist/` a `/var/www/hash`):
```js
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
```

- [ ] **Step 2: Crear `docs/landing-caddy.md`** (instrucciones para el usuario; el Caddyfile vive en el VPS, no en el repo):
```markdown
# Servir hash.atikodigital.cl (Caddy)

Agregar al Caddyfile del VPS (`/etc/caddy/Caddyfile`):

    hash.atikodigital.cl {
        root * /var/www/hash
        encode gzip
        try_files {path} /index.html
        file_server
    }

Luego: `sudo systemctl reload caddy`.

DNS: crear un registro A `hash` → IP del VPS.

El token de KALY lo sirve el agente en `https://<agente>/api/public/kaly-token`
(ver docs/landing-token-endpoint.md). Si el agente está en otro dominio, su
CORS debe permitir `https://hash.atikodigital.cl`.
```

- [ ] **Step 3: Commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git add deploy-landing-wt.js docs/landing-caddy.md && git commit -m "chore(landing): script de deploy + doc Caddy hash.atikodigital.cl"
```

---

## FASE 2 — Endpoint público del token (agente untracked)

### Task 3: Documentar el endpoint `GET /api/public/kaly-token`

> El backend del agente (`atiko-agent`) es untracked y vive en el VPS. NO se commitea su código aquí; se entrega como **snippet** en un doc para que el usuario lo active. El front (Task 6) consume este endpoint.

**Files:** `HASH IA\docs\landing-token-endpoint.md` (crear).

- [ ] **Step 1: Crear el doc con el snippet** (Express; reusa `createEphemeralToken` de `gastos/src/agent/token.js`):
```markdown
# Endpoint público del token de KALY (atiko-agent)

Pegar en el server del agente (Express). Reusa createEphemeralToken (auth_tokens v1alpha).

```js
const { createEphemeralToken } = require('./token'); // o la ruta real en el agente
const _hits = new Map(); // IP -> [timestamps]
function rateLimited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000, max = 20;
  const arr = (_hits.get(ip) || []).filter(t => now - t < win);
  arr.push(now); _hits.set(ip, arr);
  return arr.length > max;
}
app.get('/api/public/kaly-token', async (req, res) => {
  const origin = req.headers.origin || '';
  const allowed = ['https://hash.atikodigital.cl', 'http://localhost:5173'];
  if (allowed.includes(origin)) res.set('Access-Control-Allow-Origin', origin);
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (rateLimited(ip)) return res.status(429).json({ error: 'rate_limited' });
  try {
    const tok = await createEphemeralToken({ apiKey: process.env.GEMINI_API_KEY });
    return res.json(tok); // { token, expireAt, model }
  } catch (e) { console.error('[kaly-token]', e.message); return res.status(502).json({ error: 'token_falla' }); }
});
```

Verificación en prod (tras activarlo): `curl -s https://<agente>/api/public/kaly-token` debe devolver `{ "token": "...", "model": "..." }`.
```

- [ ] **Step 2: Commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git add docs/landing-token-endpoint.md && git commit -m "docs(landing): snippet endpoint público /api/public/kaly-token"
```

---

## FASE 3 — KALY web (módulos)

### Task 4: `kaly/token.js` (pedir token efímero) + test

**Files:** Create `landing/src/kaly/token.js`, Test `landing/tests/token.test.js`.

- [ ] **Step 1: Test que falla** — `landing/tests/token.test.js`:
```js
import { fetchKalyToken, KALY_TOKEN_URL } from '../src/kaly/token.js';

test('fetchKalyToken devuelve token/model en éxito', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ token: 'tok-1', model: 'm', expireAt: 'x' }) }));
  const r = await fetchKalyToken({ fetchImpl });
  expect(fetchImpl).toHaveBeenCalledWith(KALY_TOKEN_URL, expect.objectContaining({ method: 'GET' }));
  expect(r).toEqual({ token: 'tok-1', model: 'm', expireAt: 'x' });
});

test('fetchKalyToken lanza rate_limited en 429', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: 'rate_limited' }) }));
  await expect(fetchKalyToken({ fetchImpl })).rejects.toThrow('rate_limited');
});

test('fetchKalyToken lanza token_falla en 502', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: false, status: 502, json: async () => ({ error: 'token_falla' }) }));
  await expect(fetchKalyToken({ fetchImpl })).rejects.toThrow('token_falla');
});
```

- [ ] **Step 2: Verificar FAIL** — `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\landing" && npx jest tests/token.test.js` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar** — `landing/src/kaly/token.js`:
```js
// Pide el token efímero de KALY al agente (endpoint público con rate-limit).
export const KALY_TOKEN_URL =
  (import.meta && import.meta.env && import.meta.env.VITE_KALY_TOKEN_URL) ||
  'https://gastos.atikodigital.cl/api/public/kaly-token';

export async function fetchKalyToken({ fetchImpl } = {}) {
  const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!f) throw new Error('sin_fetch');
  const res = await f(KALY_TOKEN_URL, { method: 'GET' });
  if (!res.ok) {
    let err = 'token_falla';
    try { const b = await res.json(); err = b.error || err; } catch { /* noop */ }
    if (res.status === 429) err = 'rate_limited';
    throw new Error(err);
  }
  const b = await res.json();
  return { token: b.token, model: b.model, expireAt: b.expireAt };
}
```
NOTA: el endpoint real lo confirmará el usuario; si el agente no está en `gastos.atikodigital.cl`, se setea `VITE_KALY_TOKEN_URL` en `landing/.env`.

- [ ] **Step 4: Verificar PASS** — `npx jest tests/token.test.js` → PASS (3).

- [ ] **Step 5: Commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git add landing/src/kaly/token.js landing/tests/token.test.js && git commit -m "feat(landing): kaly/token.js (token efímero + manejo 429/502)"
```

---

### Task 5: `kaly/tools.js` (tools de KALY web) + test

**Files:** Create `landing/src/kaly/tools.js`, Test `landing/tests/tools.test.js`.

- [ ] **Step 1: Test que falla** — `landing/tests/tools.test.js`:
```js
import { executeTool, TOOL_DECLARATIONS } from '../src/kaly/tools.js';

test('TOOL_DECLARATIONS tiene las 4 tools', () => {
  const names = TOOL_DECLARATIONS.map(t => t.name);
  expect(names).toEqual(expect.arrayContaining(['mostrar_features', 'mostrar_planes', 'descargar_app', 'abrir_whatsapp']));
});

test('mostrar_features llama el callback con la familia', () => {
  const ui = { mostrarFeatures: jest.fn(), mostrarPlanes: jest.fn(), descargarApp: jest.fn(), abrirWhatsapp: jest.fn() };
  const r = executeTool('mostrar_features', { familia: 'ventas' }, ui);
  expect(ui.mostrarFeatures).toHaveBeenCalledWith('ventas');
  expect(r).toEqual({ ok: true });
});

test('descargar_app y abrir_whatsapp disparan sus callbacks', () => {
  const ui = { mostrarFeatures: jest.fn(), mostrarPlanes: jest.fn(), descargarApp: jest.fn(), abrirWhatsapp: jest.fn() };
  executeTool('descargar_app', {}, ui);
  executeTool('abrir_whatsapp', {}, ui);
  expect(ui.descargarApp).toHaveBeenCalled();
  expect(ui.abrirWhatsapp).toHaveBeenCalled();
});

test('tool desconocida devuelve error', () => {
  expect(executeTool('no_existe', {}, {})).toEqual({ error: 'tool_desconocida' });
});
```

- [ ] **Step 2: Verificar FAIL** — `npx jest tests/tools.test.js` → FAIL.

- [ ] **Step 3: Implementar** — `landing/src/kaly/tools.js`:
```js
// Tools de KALY en la landing (function calling de Gemini Live). La UI pasa callbacks.
export const TOOL_DECLARATIONS = [
  { name: 'mostrar_features', description: 'Muestra las tarjetas de características de Hash IA en pantalla. familia opcional: finanzas o ventas.', parameters: { type: 'OBJECT', properties: { familia: { type: 'STRING', enum: ['finanzas', 'ventas', 'todas'] } } } },
  { name: 'mostrar_planes', description: 'Lleva al visitante a la sección de planes y precios.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'descargar_app', description: 'Inicia la descarga de la aplicación Hash IA.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'abrir_whatsapp', description: 'Abre WhatsApp para hablar con un asesor de Atiko.', parameters: { type: 'OBJECT', properties: {} } },
];

export function executeTool(name, args = {}, ui = {}) {
  if (name === 'mostrar_features') { ui.mostrarFeatures && ui.mostrarFeatures(args.familia || 'todas'); return { ok: true }; }
  if (name === 'mostrar_planes') { ui.mostrarPlanes && ui.mostrarPlanes(); return { ok: true }; }
  if (name === 'descargar_app') { ui.descargarApp && ui.descargarApp(); return { ok: true }; }
  if (name === 'abrir_whatsapp') { ui.abrirWhatsapp && ui.abrirWhatsapp(); return { ok: true }; }
  return { error: 'tool_desconocida' };
}
```

- [ ] **Step 4: Verificar PASS** — `npx jest tests/tools.test.js` → PASS (4).

- [ ] **Step 5: Commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git add landing/src/kaly/tools.js landing/tests/tools.test.js && git commit -m "feat(landing): kaly/tools.js (mostrar_features/planes/descargar/whatsapp)"
```

---

### Task 6: `kaly/prompt.js` (prompt de ventas) + `kaly/live.js` (port)

**Files:** Create `landing/src/kaly/prompt.js`, Create `landing/src/kaly/live.js`.

- [ ] **Step 1: Crear `landing/src/kaly/prompt.js`**:
```js
// Prompt de sistema de KALY vendedora para la landing.
export const KALY_VOICE = 'Aoede'; // voz prebuilt cálida; ajustar si se prefiere otra
export function buildSalesPrompt() {
  return `# Identidad
Eres KALY, la inteligencia artificial de Hash IA. Hablas en español de Chile, cálida, cercana y profesional (trato de "usted"). Eres EXPERTA EN VENTAS: tu objetivo es enamorar al visitante de Hash IA y llevarlo a descargar la app o a escribir por WhatsApp.

# Estilo
- Respuestas CORTAS: 1 a 3 frases. Nada de discursos largos.
- Suena humana y entusiasta, con modismos chilenos suaves (sin exagerar).
- Si no sabes algo puntual, ofrece que un asesor lo contacte por WhatsApp.

# Qué es Hash IA
Hash IA es la IA que le lleva LAS CUENTAS y LAS VENTAS a las pymes chilenas. Dos familias:
- Finanzas: registra gastos e ingresos por foto o por voz, calcula IVA, concilia con el SII y la cartola del banco (Match), y te muestra reportes y flujo de caja.
- Ventas: arma tu catálogo (por voz o foto), crea pedidos en el chat, cobra delivery por comuna y genera el PDF del pedido para enviar por WhatsApp.
Se cobra por "shots": 1 shot = 1 imagen interpretada por la IA. Planes: Free 30, Básico 100, Pyme 250 (el más elegido) y Empresa 800.

# Apertura (al iniciar la conversación)
Preséntate en una frase ("Hola, soy KALY, la inteligencia artificial de Hash IA"), di en una frase qué hace Hash IA, y pregunta en qué le puedes ayudar u ofrécele contarle las características.

# Herramientas
- Cuando te pidan ver características o features, llama a mostrar_features (familia finanzas/ventas/todas).
- Cuando pregunten precios/planes, llama a mostrar_planes y resúmelos.
- Cuando quieran probarlo, llama a descargar_app.
- Cuando quieran hablar con una persona, llama a abrir_whatsapp.
Siempre confirma con una frase lo que hiciste.`;
}
```

- [ ] **Step 2: Crear `landing/src/kaly/live.js`** — PORT de `gastos-app/src/gastos/kaly/live.js`. READ ese archivo y cópialo a `landing/src/kaly/live.js` con estos cambios MÍNIMOS:
  - Es JS de navegador puro (sin imports de la app). No importa `api`.
  - Exporta `openLiveSession(opts)` idéntico (mismo WS `wss://generativelanguage.googleapis.com/ws/.../BidiGenerateContent`, `setup` con `responseModalities:['AUDIO']`, `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`, `languageCode:'es-US'`, `inputAudioTranscription`, `outputAudioTranscription`, `tools`), y los helpers `startMic`/`createPlayer`.
  - El `voiceName` se pasa por `opts.voice` (default `'Aoede'`).
  - El token se pasa por `opts.token` (ya viene del endpoint público; NO se llama a ninguna API key).
  Mantén `sendText`, `sendToolResponse`, `close`, `setMuted` y los callbacks (`onState`, `onAudioLevel`, `onUserTranscript`, `onAgentTranscript`, `onToolCall`, `onClose`).

- [ ] **Step 3: Verificar que compila** — `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\landing" && npm run build` → OK (aún sin usarse; solo que no rompa el build al importarse en Task 8).

- [ ] **Step 4: Commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git add landing/src/kaly/prompt.js landing/src/kaly/live.js && git commit -m "feat(landing): kaly prompt de ventas + live.js (port openLiveSession)"
```

---

## FASE 4 — Orbe HUD + Hero

### Task 7: `kaly/Orb.jsx` (orbe HUD JARVIS en canvas)

**Files:** Create `landing/src/kaly/Orb.jsx`.

- [ ] **Step 1: Implementar el orbe** — `landing/src/kaly/Orb.jsx` (canvas; celeste `#19C3FF` sobre `#00060a`; anillos giratorios, halo que pulsa con `level`, escáner, crosshair, corchetes, tick marks, waveform, estado). Props: `state` ('idle'|'listening'|'speaking'|'thinking'|'muted'), `level` (0..1 nivel de audio):
```jsx
import React, { useEffect, useRef } from 'react';

const CY = '#19C3FF', CY_DIM = '#0a6e8c', BG = '#00060a', GOLD = '#C9A24B';
const LABEL = { idle: 'EN ESPERA', listening: 'ESCUCHANDO', speaking: 'HABLANDO', thinking: 'PENSANDO', muted: 'EN SILENCIO' };

export default function Orb({ state = 'idle', level = 0 }) {
  const ref = useRef(null);
  const st = useRef({ rings: [0, 120, 240], scan: 0, scan2: 180, halo: 55, tick: 0, level: 0 });

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    let raf;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => { const s = cv.clientWidth; cv.width = s * dpr; cv.height = s * dpr; };
    resize(); window.addEventListener('resize', resize);

    const draw = () => {
      const s = st.current; s.tick++;
      const speaking = state === 'speaking', muted = state === 'muted';
      s.level += ((level || 0) - s.level) * 0.25;
      const targetHalo = muted ? 18 : speaking ? 120 + s.level * 90 : 55 + s.level * 40;
      s.halo += (targetHalo - s.halo) * 0.18;
      const sp = speaking ? [1.3, -0.9, 2.0] : [0.55, -0.35, 0.9];
      s.rings = s.rings.map((r, i) => (r + sp[i]) % 360);
      s.scan = (s.scan + (speaking ? 3 : 1.3)) % 360;
      s.scan2 = (s.scan2 - (speaking ? 2 : 0.75) + 360) % 360;

      const W = cv.width, H = cv.height; ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2, fw = Math.min(W, H);
      const col = muted ? '#ff3366' : CY;

      ctx.strokeStyle = 'rgba(25,195,255,0.06)';
      for (let x = 0; x < W; x += 48 * dpr) for (let y = 0; y < H; y += 48 * dpr) { ctx.fillStyle = 'rgba(25,195,255,0.05)'; ctx.fillRect(x, y, 1, 1); }

      const rFace = fw * 0.30;
      for (let i = 0; i < 10; i++) {
        const r = rFace * (1.8 - i * 0.08), a = Math.max(0, s.halo * 0.0035 * (1 - i / 10));
        ctx.beginPath(); ctx.strokeStyle = `rgba(25,195,255,${a})`; ctx.lineWidth = 1.5 * dpr; ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      }
      const rings = [[0.48, 3, 115, 78], [0.40, 2, 78, 55], [0.32, 1, 56, 40]];
      rings.forEach(([rf, w, arc, gap], idx) => {
        const rr = fw * rf, base = s.rings[idx]; ctx.strokeStyle = col; ctx.globalAlpha = Math.min(1, s.halo / 120 * (1 - idx * 0.18)); ctx.lineWidth = w * dpr;
        let ang = base; while (ang < base + 360) { ctx.beginPath(); ctx.arc(cx, cy, rr, ang * Math.PI / 180, (ang + arc) * Math.PI / 180); ctx.stroke(); ang += arc + gap; }
      });
      ctx.globalAlpha = 1;
      const sr = fw * 0.50, ex = speaking ? 75 : 44;
      ctx.strokeStyle = col; ctx.lineWidth = 2.5 * dpr; ctx.beginPath(); ctx.arc(cx, cy, sr, s.scan * Math.PI / 180, (s.scan + ex) * Math.PI / 180); ctx.stroke();
      ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5 * dpr; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(cx, cy, sr, s.scan2 * Math.PI / 180, (s.scan2 + ex) * Math.PI / 180); ctx.stroke(); ctx.globalAlpha = 1;

      const tOut = fw * 0.497, tIn = fw * 0.474; ctx.strokeStyle = 'rgba(25,195,255,0.55)'; ctx.lineWidth = 1 * dpr;
      for (let d = 0; d < 360; d += 10) { const rad = d * Math.PI / 180, inn = d % 30 === 0 ? tIn : tIn + 6 * dpr; ctx.beginPath(); ctx.moveTo(cx + tOut * Math.cos(rad), cy - tOut * Math.sin(rad)); ctx.lineTo(cx + inn * Math.cos(rad), cy - inn * Math.sin(rad)); ctx.stroke(); }

      const chR = fw * 0.51, gapH = fw * 0.16; ctx.strokeStyle = `rgba(25,195,255,${s.halo / 110})`; ctx.lineWidth = 1 * dpr;
      [[-chR, 0, -gapH, 0], [gapH, 0, chR, 0], [0, -chR, 0, -gapH], [0, gapH, 0, chR]].forEach(([x1, y1, x2, y2]) => { ctx.beginPath(); ctx.moveTo(cx + x1, cy + y1); ctx.lineTo(cx + x2, cy + y2); ctx.stroke(); });

      const bl = 24 * dpr, hw = fw / 2; ctx.strokeStyle = 'rgba(25,195,255,0.8)'; ctx.lineWidth = 2 * dpr;
      [[-hw, -hw, 1, 1], [hw, -hw, -1, 1], [-hw, hw, 1, -1], [hw, hw, -1, -1]].forEach(([bx, by, dx, dy]) => { ctx.beginPath(); ctx.moveTo(cx + bx, cy + by); ctx.lineTo(cx + bx + dx * bl, cy + by); ctx.moveTo(cx + bx, cy + by); ctx.lineTo(cx + bx, cy + by + dy * bl); ctx.stroke(); });

      const orbR = fw * 0.20; const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, orbR);
      grd.addColorStop(0, muted ? 'rgba(255,51,102,0.55)' : `rgba(25,195,255,${0.35 + s.level * 0.4})`);
      grd.addColorStop(1, 'rgba(0,20,30,0)'); ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(cx, cy, orbR, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = col; ctx.font = `${13 * dpr}px "Share Tech Mono", monospace`; ctx.textAlign = 'center';
      ctx.fillText('KALY', cx, cy + 5 * dpr);
      ctx.fillStyle = col; ctx.font = `${11 * dpr}px "Share Tech Mono", monospace`;
      ctx.fillText('● ' + (LABEL[state] || 'EN ESPERA'), cx, cy + fw * 0.40);
      ctx.fillStyle = 'rgba(25,195,255,0.5)'; ctx.font = `${9 * dpr}px "Share Tech Mono", monospace`;
      ctx.fillText('IA · GEMINI LIVE · ES-CL', cx, cy + fw * 0.40 + 18 * dpr);

      const N = 32, bw = fw * 0.012, wy = cy + fw * 0.46, wx0 = cx - (N * bw) / 2;
      for (let i = 0; i < N; i++) {
        let h; if (muted) h = 2; else if (speaking) h = 3 + Math.random() * (8 + s.level * 26); else h = 3 + 2 * Math.sin(s.tick * 0.09 + i * 0.6);
        ctx.fillStyle = h > 12 ? CY : CY_DIM; ctx.fillRect(wx0 + i * bw, wy - h * dpr, (bw - 1) * dpr, h * dpr);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [state, level]);

  return <canvas ref={ref} aria-label="KALY" style={{ width: '100%', maxWidth: 460, aspectRatio: '1 / 1', display: 'block', margin: '0 auto' }} />;
}
```

- [ ] **Step 2: Verificar build** — `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\landing" && npm run build` → OK.

- [ ] **Step 3: Commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git add landing/src/kaly/Orb.jsx && git commit -m "feat(landing): orbe HUD JARVIS en canvas (celeste, reactivo a la voz)"
```

---

### Task 8: `kaly/Hero.jsx` (orquesta KALY) + smoke test

**Files:** Create `landing/src/kaly/Hero.jsx`, Test `landing/tests/Hero.test.jsx`.

- [ ] **Step 1: Test que falla** — `landing/tests/Hero.test.jsx` (canvas mockeado vía jsdom; el test verifica titular, chips y CTAs, no la voz):
```jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import Hero from '../src/kaly/Hero.jsx';

beforeAll(() => { window.HTMLCanvasElement.prototype.getContext = () => null; });

test('Hero muestra titular, chips y CTAs', () => {
  render(<Hero />);
  expect(screen.getByText(/cuentas y las ventas/i)).toBeInTheDocument();
  expect(screen.getByText(/¿Qué es Hash IA\?/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /descargar/i })).toHaveAttribute('href', expect.stringContaining('HashIA.apk'));
  expect(screen.getByRole('link', { name: /whatsapp/i })).toHaveAttribute('href', expect.stringContaining('wa.me'));
});
```

- [ ] **Step 2: Verificar FAIL** — `npx jest tests/Hero.test.jsx` → FAIL.

- [ ] **Step 3: Implementar** — `landing/src/kaly/Hero.jsx`. Orquesta: botón iniciar (pide token con `fetchKalyToken`, abre `openLiveSession` con `buildSalesPrompt()`+`TOOL_DECLARATIONS`+voz `KALY_VOICE`, cablea `onToolCall→executeTool` con callbacks UI, `onAgentTranscript`→subtítulo, `onAudioLevel`→`level`, `onState`→`state`), orbe `<Orb>`, chips que hacen `session.sendText(...)`, tarjetas de features (estado `features`), botón silenciar (`session.setMuted`), CTAs (descargar + WhatsApp), y **fallback texto** si el token/micrófono fallan. IDs/constantes:
  - APK: `https://gastos.atikodigital.cl/panel/HashIA.apk`
  - WhatsApp: `https://wa.me/56900000000` (el usuario confirma el número; dejar como const `WHATSAPP_URL`).
  - Chips: `['¿Qué es Hash IA?', '¿Cuánto cuesta?', '¿Sirve para mi negocio?', 'Muéstrame las características']`.
  - `mostrarFeatures(familia)` setea las tarjetas; `mostrarPlanes()` hace `document.getElementById('planes')?.scrollIntoView({behavior:'smooth'})`; `descargarApp()` hace `window.open(APK_URL)`; `abrirWhatsapp()` `window.open(WHATSAPP_URL)`.
  - Si `fetchKalyToken` lanza, setear `modoTexto=true` y mostrar input "Escríbele a KALY" + aviso "El modo voz no está disponible ahora".
  Código completo:
```jsx
import React, { useRef, useState } from 'react';
import Orb from './Orb.jsx';
import { fetchKalyToken } from './token.js';
import { buildSalesPrompt, KALY_VOICE } from './prompt.js';
import { TOOL_DECLARATIONS, executeTool } from './tools.js';
import { openLiveSession } from './live.js';

const APK_URL = 'https://gastos.atikodigital.cl/panel/HashIA.apk';
const WHATSAPP_URL = 'https://wa.me/56900000000';
const CHIPS = ['¿Qué es Hash IA?', '¿Cuánto cuesta?', '¿Sirve para mi negocio?', 'Muéstrame las características'];
const FEATURES = {
  finanzas: [
    { t: 'Gastos por foto o voz', d: 'Saca la foto de la boleta y la IA la registra con IVA.' },
    { t: 'Match SII + banco', d: 'Concilia tus documentos con el SII y la cartola.' },
    { t: 'Reportes y flujo de caja', d: 'Mira cómo va el mes sin Excel.' },
  ],
  ventas: [
    { t: 'Catálogo por voz/foto', d: 'Dile a KALY "agrega torta a 18 mil" o foto del menú.' },
    { t: 'Pedidos en el chat', d: 'Arma el pedido y genera el PDF para WhatsApp.' },
    { t: 'Delivery por comuna', d: 'Cobra el envío según la zona.' },
  ],
};

export default function Hero() {
  const [state, setState] = useState('idle');
  const [level, setLevel] = useState(0);
  const [subtitulo, setSubtitulo] = useState('');
  const [features, setFeatures] = useState(null);
  const [modoTexto, setModoTexto] = useState(false);
  const [texto, setTexto] = useState('');
  const sessionRef = useRef(null);

  const ui = {
    mostrarFeatures: (familia) => setFeatures(familia === 'todas' ? [...FEATURES.finanzas, ...FEATURES.ventas] : (FEATURES[familia] || [...FEATURES.finanzas, ...FEATURES.ventas])),
    mostrarPlanes: () => document.getElementById('planes')?.scrollIntoView({ behavior: 'smooth' }),
    descargarApp: () => window.open(APK_URL, '_blank'),
    abrirWhatsapp: () => window.open(WHATSAPP_URL, '_blank'),
  };

  async function iniciar() {
    if (sessionRef.current) return;
    setState('thinking');
    try {
      const { token, model } = await fetchKalyToken();
      const session = openLiveSession({
        token, model, voice: KALY_VOICE, systemPrompt: buildSalesPrompt(), tools: TOOL_DECLARATIONS,
        onState: setState, onAudioLevel: (_, rms) => setLevel(Math.min(1, rms * 6)),
        onAgentTranscript: (t) => setSubtitulo(t),
        onToolCall: (fc) => { executeTool(fc.name, fc.args || {}, ui); session.sendToolResponse(fc.id, fc.name, { ok: true }); },
        onClose: () => { sessionRef.current = null; setState('idle'); },
      });
      sessionRef.current = session;
    } catch (e) { setModoTexto(true); setState('idle'); }
  }

  function enviarTexto(t) {
    const msg = (t || texto).trim(); if (!msg) return;
    if (sessionRef.current) sessionRef.current.sendText(msg);
    setTexto('');
  }

  return (
    <section className="min-h-screen bg-hud-bg text-hud-text font-mono flex flex-col items-center justify-center px-4 py-12">
      <h1 className="text-2xl md:text-4xl text-center text-[#cfeaf3] max-w-2xl mb-2">La IA que le lleva las <span className="text-hud-cyan">cuentas</span> y las <span className="text-hud-gold">ventas</span> a tu pyme</h1>
      <p className="text-sm md:text-base text-[#5ab8cc] text-center mb-6">Háblale a KALY. Te cuenta todo sobre Hash IA.</p>

      <button onClick={iniciar} className="group" aria-label="Iniciar conversación con KALY"><Orb state={state} level={level} /></button>
      {state === 'idle' && !sessionRef.current && <p className="text-xs text-[#3a8a9a] mt-2">Toca el orbe para hablar con KALY</p>}
      {subtitulo && <p className="text-sm text-hud-cyan text-center max-w-xl mt-3 min-h-[1.5rem]">{subtitulo}</p>}

      <div className="flex flex-wrap gap-2 justify-center mt-5 max-w-xl">
        {CHIPS.map((c) => (
          <button key={c} onClick={() => (sessionRef.current ? enviarTexto(c) : iniciar())} className="text-xs border border-hud-cyandim text-hud-cyan rounded-full px-3 py-1.5 hover:bg-[#001f2e]">{c}</button>
        ))}
      </div>

      {features && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 max-w-3xl w-full">
          {features.map((f) => (
            <div key={f.t} className="border border-hud-cyandim/40 rounded-lg p-3 bg-hud-panel">
              <div className="text-hud-cyan text-sm font-bold">{f.t}</div>
              <div className="text-[#5ab8cc] text-xs mt-1">{f.d}</div>
            </div>
          ))}
        </div>
      )}

      {modoTexto && (
        <div className="mt-5 w-full max-w-md text-center">
          <p className="text-xs text-hud-gold mb-2">El modo voz no está disponible ahora — escríbele a KALY.</p>
          <div className="flex gap-2">
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escríbele a KALY…" className="flex-1 bg-hud-panel border border-hud-cyandim rounded px-3 py-2 text-sm text-hud-text" />
            <button onClick={() => enviarTexto()} className="border border-hud-cyan text-hud-cyan rounded px-4">Enviar</button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mt-8">
        <a href={APK_URL} target="_blank" rel="noreferrer" className="bg-hud-gold text-black font-bold rounded-lg px-6 py-3 text-center">Descargar la app</a>
        <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="border border-hud-cyan text-hud-cyan rounded-lg px-6 py-3 text-center">Hablar por WhatsApp</a>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Verificar PASS** — `npx jest tests/Hero.test.jsx` → PASS, luego `npm run build` → OK.

- [ ] **Step 5: Commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git add landing/src/kaly/Hero.jsx landing/tests/Hero.test.jsx && git commit -m "feat(landing): Hero KALY (orbe + chips + features + CTAs + fallback texto)"
```

---

## FASE 5 — Secciones de marketing (MCP 21st.dev)

### Task 9: Secciones con el MCP de 21st.dev magic

**Files:** Create `landing/src/sections/DosFamilias.jsx`, `ComoFunciona.jsx`, `Features.jsx`, `Planes.jsx`, `CtaFinal.jsx`, `Footer.jsx`.

- [ ] **Step 1: Generar cada sección con el MCP** — usa `mcp__magic__21st_magic_component_builder` (ToolSearch: "select:mcp__magic__21st_magic_component_builder" si está deferido) para generar componentes React+Tailwind oscuros (paleta `#00060a` fondo, cian `#19C3FF`, dorado `#C9A24B`). Una llamada por sección con este contenido:
  - `DosFamilias.jsx`: dos columnas — **Finanzas** (gastos por foto/voz, Match SII+banco, reportes) y **Ventas** (catálogo por voz/foto, pedidos en chat + PDF, delivery por comuna).
  - `ComoFunciona.jsx`: 3 pasos — 1) Saca foto o háblale a KALY · 2) La IA registra y contabiliza · 3) Ves reportes o armas pedidos.
  - `Features.jsx`: grid de 5 — OCR de facturas, conciliación SII/cartola (Match), catálogo por voz y foto, pedidos + PDF + delivery, recordatorios por WhatsApp.
  - `Planes.jsx`: envolver en `<section id="planes">`. 4 planes por shots: Free 30 ($0), Básico 100 ($9.900), **Pyme 250 ($24.900 — destacado "El más elegido")**, Empresa 800 ($49.900). Nota: "1 shot = 1 imagen interpretada por la IA". Botón de cada plan → descargar app.
  - `CtaFinal.jsx`: dos botones grandes — Descargar la app (`https://gastos.atikodigital.cl/panel/HashIA.apk`) y Hablar por WhatsApp (`https://wa.me/56900000000`).
  - `Footer.jsx`: "Hash IA · un producto de Atiko Digital" + enlaces básicos.
  Cada componente debe `export default` y ser responsive (mobile-first). Si el MCP no está disponible, escribir los componentes a mano con Tailwind siguiendo ese contenido y paleta.

- [ ] **Step 2: Verificar build** — `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\landing" && npm run build` → OK (aún no montados; solo que compilen).

- [ ] **Step 3: Commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git add landing/src/sections/ && git commit -m "feat(landing): secciones de marketing (familias, cómo funciona, features, planes, CTA, footer)"
```

---

### Task 10: Ensamblar `App.jsx` + responsive

**Files:** Modify `landing/src/App.jsx`.

- [ ] **Step 1: Implementar** — `landing/src/App.jsx`:
```jsx
import React from 'react';
import Hero from './kaly/Hero.jsx';
import DosFamilias from './sections/DosFamilias.jsx';
import ComoFunciona from './sections/ComoFunciona.jsx';
import Features from './sections/Features.jsx';
import Planes from './sections/Planes.jsx';
import CtaFinal from './sections/CtaFinal.jsx';
import Footer from './sections/Footer.jsx';

export default function App() {
  return (
    <div className="bg-hud-bg text-hud-text">
      <Hero />
      <DosFamilias />
      <ComoFunciona />
      <Features />
      <Planes />
      <CtaFinal />
      <Footer />
    </div>
  );
}
```

- [ ] **Step 2: Verificar build + suite** — `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\landing" && npx jest && npm run build` → tests verde + build OK.

- [ ] **Step 3: Commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git add landing/src/App.jsx && git commit -m "feat(landing): ensambla App con todas las secciones"
```

---

## FASE 6 — Verificación + deploy

### Task 11: Suite + build + deploy

- [ ] **Step 1: Suite completa** — `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\landing" && npx jest` → todo verde (token 3, tools 4, Hero 1).
- [ ] **Step 2: Build** — `npm run build` → `dist/` generado.
- [ ] **Step 3: Deploy (con el usuario):**
  1. Activar el endpoint del token en el agente (`docs/landing-token-endpoint.md`) y verificar `curl https://gastos.atikodigital.cl/api/public/kaly-token` → `{token,...}`.
  2. DNS: A `hash` → IP del VPS.
  3. Bloque Caddy (`docs/landing-caddy.md`) + `systemctl reload caddy`.
  4. `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && node deploy-landing-wt.js`.
  5. Verificar `curl -s -o /dev/null -w "%{http_code}" https://hash.atikodigital.cl` → 200 y probar la voz en el navegador.
- [ ] **Step 4: Sin commit** (deploy). Confirmar con el usuario el número de WhatsApp real antes del deploy (reemplazar `56900000000`).

---

## Self-review (hecho)
- **Cobertura del spec:** subdominio+Caddy+deploy (T1,T2,T11) ✅; token público rate-limit+CORS (T3) ✅; KALY web token/prompt/tools/live (T4,T5,T6) ✅; orbe HUD JARVIS celeste reactivo (T7) ✅; hero chips+features+subtítulos+CTAs+fallback (T8) ✅; secciones con magic: familias/cómo funciona/features/planes-shots/CTA/footer responsive (T9,T10) ✅; tests acotados token/tools/Hero (T4,T5,T8,T11) ✅; manejo de errores 429/502/sin-micrófono (T4,T8) ✅.
- **Sin placeholders:** código completo en token.js, tools.js, prompt.js, Orb.jsx, Hero.jsx, App.jsx, scaffold, deploy. live.js = port explícito del archivo existente con cambios listados. Secciones = contenido+paleta concretos vía magic (o a mano).
- **Consistencia:** `fetchKalyToken`→`{token,model,expireAt}` usado en Hero; `openLiveSession({token,model,voice,systemPrompt,tools,onState,onAudioLevel,onAgentTranscript,onToolCall,onClose})` coherente con el port; `executeTool(name,args,ui)` con callbacks `mostrarFeatures/mostrarPlanes/descargarApp/abrirWhatsapp` igual en tools.js y Hero; APK y WhatsApp URLs idénticas en Hero y CtaFinal; `id="planes"` referenciado por `mostrarPlanes`.
