# Plan 4 — App Android (Capacitor, app nueva) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-06-09-atiko-gastos-design.md` (§3.1)
**Depende de:** Plan 3 (API `/api/app`). El backend ya expone login + crear/confirmar/editar/rechazar/listar gastos.

**Goal:** App Android **nueva y propia** (Capacitor + React + Vite + Tailwind) donde el empleado inicia sesión, captura una boleta (cámara / galería / **captura de pantalla** de recibos digitales), revisa lo que el OCR entendió, confirma o corrige, y ve "mis gastos" — todo contra `/api/app`.

**NO es un clon de Matico.** De Matico/del feature "Mobile screenshot capture" SOLO se reutiliza la **feature de captura de pantalla**: el plugin Capacitor nativo (MediaProjection) y su puente JS. Todo lo demás (alarmas, notificaciones, `MaticoApplication`, etc.) NO se trae. Mismo stack de librerías (React/Vite/Tailwind/Capacitor) porque es el estándar para que el plugin entre, pero el proyecto es fresco.

**Architecture:** App web React (Vite) empaquetada en un shell Capacitor/Android **generado de cero** (`npx cap add android`, package `cl.atikodigital.gastos`). Se porta ÚNICAMENTE la feature de captura de pantalla: 3 archivos Java (Plugin/Service/Store) renombrados al package de gastos y a un plugin neutral `ScreenCapture`, registrados en el `MainActivity` nuevo, con sólo los permisos + el `<service mediaProjection>` que esa feature requiere. El puente `screenCaptureBridge.js` se copia y se le adapta el nombre del plugin. La captura cámara/galería NO necesita plugin (input file nativo del webview). La capa JS (cliente API, sesión, pantallas) se prueba con TDD (jest + RTL + jsdom). APK con `gradlew assembleDebug` (el usuario tiene Android Studio/SDK).

**Tech Stack:** React 18, Vite 5, Tailwind 3, Capacitor 8.3.1 (@capacitor/core,cli,android), lucide-react. Tests: jest, @testing-library/react, @testing-library/jest-dom, jsdom, @babel/preset-react.

**Fuente del feature de captura (para portar la lógica Java + el bridge):** `C:\Users\josea\Desktop\proyectos\.gemini\antigravity\scratch\dashboard-matico` — archivos `android/app/src/main/java/app/matico/dashboard/MaticoScreenCapture{Plugin,Service,Store}.java` y `src/mobile/screenCaptureBridge.js`. (Ignorar sus `.claude/worktrees/**` y `android/app/build/**`.) Estos son los mismos que el usuario pegó en el chat. **Solo se porta esa feature, NADA más del proyecto Matico.**

---

## Convenciones

- Carpeta nueva: **`gastos-app/`** en la raíz del repo (worktree), trackeada en git, `node_modules` ignorado.
- API base: `const API_BASE = import.meta.env.VITE_API_BASE || 'https://gastos.atikodigital.cl'`. En dev se setea `VITE_API_BASE=http://localhost:3100`.
- Token JWT en `localStorage` bajo `atiko_gastos_jwt`.
- **appId/package Java** `cl.atikodigital.gastos`, **appName** "Atiko Gastos". El plugin de captura se renombra a un nombre neutral **`ScreenCapture`** (clases `ScreenCapturePlugin/Service/Store`, package `cl.atikodigital.gastos`) — nada queda con la marca "Matico".

---

## Estructura de archivos (Plan 4)

```
gastos-app/
  package.json  vite.config.js  tailwind.config.js  postcss.config.js  index.html
  babel.config.cjs  jest.config.cjs
  capacitor.config.json
  src/
    main.jsx  App.jsx  index.css
    api/client.js            # authFetch + login/crear/confirmar/editar/rechazar/listar
    state/session.js         # token store + estado de sesión
    mobile/screenCaptureBridge.js   # COPIADO de Matico (verbatim)
    components/
      LoginScreen.jsx
      ReceiptCapture.jsx     # captura: galería / cámara / pantalla nativa (usa el bridge)
      ConfirmScreen.jsx      # revisar/editar/confirmar el gasto OCR
      MyExpenses.jsx
  tests/
    api/client.test.js
    components/LoginScreen.test.jsx
    components/ConfirmScreen.test.jsx
    components/MyExpenses.test.jsx
    components/App.test.jsx
  android/                   # GENERADO de cero (npx cap add android) + feature de captura portada (Task 6)
    app/src/main/java/cl/atikodigital/gastos/
      MainActivity.java          # generado; + registerPlugin(ScreenCapturePlugin)
      ScreenCapturePlugin.java   # portado de MaticoScreenCapturePlugin (renombrado)
      ScreenCaptureService.java  # portado de MaticoScreenCaptureService (renombrado)
      ScreenCaptureStore.java    # portado de MaticoScreenCaptureStore (renombrado)
```

---

## Task 1: Scaffold del proyecto (Vite+React+Tailwind+Jest/RTL)

**Files:**
- Create: `gastos-app/package.json`, `vite.config.js`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `babel.config.cjs`, `jest.config.cjs`, `.gitignore`
- Create: `gastos-app/src/main.jsx`, `src/App.jsx`, `src/index.css`
- Test: `gastos-app/tests/components/App.test.jsx`

- [ ] **Step 1: `gastos-app/package.json`**
```json
{
  "name": "atiko-gastos-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host",
    "build": "vite build",
    "test": "jest",
    "cap:sync": "npx cap sync android",
    "cap:android": "npx cap sync android && npx cap open android",
    "apk:debug": "cd android && gradlew.bat assembleDebug"
  },
  "dependencies": {
    "@capacitor/android": "^8.3.1",
    "@capacitor/cli": "^8.3.1",
    "@capacitor/core": "^8.3.1",
    "lucide-react": "^0.300.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@babel/preset-env": "^7.24.0",
    "@babel/preset-react": "^7.24.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^14.2.0",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.16",
    "babel-jest": "^29.7.0",
    "jest": "^29.7.0",
    "jest-environment-jsdom": "^29.7.0",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.4.0",
    "vite": "^5.0.8"
  }
}
```

- [ ] **Step 2: configs**

`gastos-app/vite.config.js`:
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
```

`gastos-app/tailwind.config.js`:
```js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: { atiko: { gold: '#C9A24B', black: '#0E0E0E' } },
    },
  },
  plugins: [],
};
```

`gastos-app/postcss.config.js`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`gastos-app/index.html`:
```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Atiko Gastos</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

`gastos-app/babel.config.cjs` (jest necesita transpilar JSX):
```js
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
  ],
};
```

`gastos-app/jest.config.cjs`:
```js
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['@testing-library/jest-dom'],
  testMatch: ['**/tests/**/*.test.{js,jsx}'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  transform: { '^.+\\.(js|jsx)$': 'babel-jest' },
};
```

`gastos-app/.gitignore`:
```
node_modules/
dist/
.env
android/app/build/
android/.gradle/
android/build/
android/local.properties
```

- [ ] **Step 3: `npm install`** dentro de `gastos-app`. (Si falla, reportar BLOCKED con el error exacto.)

- [ ] **Step 4: entry + estilos**

`gastos-app/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
body { font-family: system-ui, sans-serif; background: #0E0E0E; color: #fff; }
```

`gastos-app/src/main.jsx`:
```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

`gastos-app/src/App.jsx` (mínimo por ahora; se amplía en Task 5):
```jsx
export default function App() {
  return <div data-testid="app-root">Atiko Gastos</div>;
}
```

- [ ] **Step 5: Escribir el test que falla** `gastos-app/tests/components/App.test.jsx`:
```jsx
import { render, screen } from '@testing-library/react';
import App from '../../src/App.jsx';

test('renderiza la app', () => {
  render(<App />);
  expect(screen.getByTestId('app-root')).toBeInTheDocument();
});
```

- [ ] **Step 6: Correr el test.** `cd gastos-app && npx jest tests/components/App.test.jsx` → debe PASAR (App.jsx ya existe). (Es smoke test del setup.)

- [ ] **Step 7: Commit**
```bash
git add gastos-app/package.json gastos-app/package-lock.json gastos-app/vite.config.js gastos-app/tailwind.config.js gastos-app/postcss.config.js gastos-app/index.html gastos-app/babel.config.cjs gastos-app/jest.config.cjs gastos-app/.gitignore gastos-app/src/main.jsx gastos-app/src/App.jsx gastos-app/src/index.css gastos-app/tests/components/App.test.jsx
git commit -m "feat(gastos-app): scaffold Vite+React+Tailwind+Jest (espejo Matico)"
```

---

## Task 2: Cliente API

**Files:**
- Create: `gastos-app/src/api/client.js`
- Create: `gastos-app/src/state/session.js`
- Test: `gastos-app/tests/api/client.test.js`

- [ ] **Step 1: Escribir el test que falla** `gastos-app/tests/api/client.test.js`:
```js
import { api } from '../../src/api/client';
import { getToken, setToken, clearToken } from '../../src/state/session';

beforeEach(() => {
  clearToken();
  global.fetch = jest.fn();
});

test('login guarda el token y lo devuelve', async () => {
  fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: 'TK', employee: { id: 'e1', nombre: 'Juan' } }) });
  const r = await api.login('juan', 'clave');
  expect(r.employee.nombre).toBe('Juan');
  expect(getToken()).toBe('TK');
  const [url, opts] = fetch.mock.calls[0];
  expect(url).toContain('/api/app/login');
  expect(JSON.parse(opts.body)).toEqual({ usuario: 'juan', password: 'clave' });
});

test('login 401 lanza y no guarda token', async () => {
  fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'credenciales' }) });
  await expect(api.login('juan', 'mala')).rejects.toThrow();
  expect(getToken()).toBeNull();
});

test('createExpense manda el token y la imagen', async () => {
  setToken('TK');
  fetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'x1', estado: 'pendiente_confirmacion' }) });
  const exp = await api.createExpense('BASE64', 'image/jpeg');
  expect(exp.id).toBe('x1');
  const [url, opts] = fetch.mock.calls[0];
  expect(url).toContain('/api/app/expenses');
  expect(opts.headers.Authorization).toBe('Bearer TK');
  expect(JSON.parse(opts.body)).toEqual({ imageBase64: 'BASE64', mimeType: 'image/jpeg' });
});

test('listExpenses devuelve filas', async () => {
  setToken('TK');
  fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ([{ id: 'x1' }]) });
  const rows = await api.listExpenses();
  expect(rows).toHaveLength(1);
});
```

- [ ] **Step 2: Correr y verificar que falla.** `cd gastos-app && npx jest tests/api/client.test.js`

- [ ] **Step 3: Implementar** `gastos-app/src/state/session.js`:
```js
const TOKEN_KEY = 'atiko_gastos_jwt';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t) {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); } catch { /* noop */ }
}
export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* noop */ }
}
```

- [ ] **Step 4: Implementar** `gastos-app/src/api/client.js`:
```js
import { getToken, setToken } from '../state/session';

const API_BASE = (import.meta.env && import.meta.env.VITE_API_BASE) || 'https://gastos.atikodigital.cl';

async function req(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data && data.error) || `http_${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  async login(usuario, password) {
    const data = await req('/api/app/login', { method: 'POST', body: { usuario, password }, auth: false });
    setToken(data.token);
    return data;
  },
  createExpense(imageBase64, mimeType = 'image/jpeg') {
    return req('/api/app/expenses', { method: 'POST', body: { imageBase64, mimeType } });
  },
  confirmExpense(id) {
    return req(`/api/app/expenses/${id}/confirm`, { method: 'POST' });
  },
  updateExpense(id, patch) {
    return req(`/api/app/expenses/${id}`, { method: 'PATCH', body: patch });
  },
  rejectExpense(id) {
    return req(`/api/app/expenses/${id}/reject`, { method: 'POST' });
  },
  listExpenses() {
    return req('/api/app/expenses');
  },
};
```

> NOTA jest: `import.meta.env` no existe bajo babel-jest. Para que el test no rompa, en
> `client.js` usar el guard `(import.meta.env && import.meta.env.VITE_API_BASE)` — pero babel-jest
> puede fallar al parsear `import.meta`. Si el test falla por `import.meta`, agregar al
> `babel.config.cjs` el plugin `babel-plugin-transform-import-meta` (instalarlo en devDeps) o leer
> la base vía `globalThis.__API_BASE__ || 'https://gastos.atikodigital.cl'` y setear
> `import.meta.env` solo en build. Implementador: si aparece el error de `import.meta`, instala
> `babel-plugin-transform-import-meta` y agrégalo a `plugins: ['babel-plugin-transform-import-meta']`
> en babel.config.cjs. Reporta lo que hiciste.

- [ ] **Step 5: Correr y verificar que pasa.** `cd gastos-app && npx jest tests/api/client.test.js`

- [ ] **Step 6: Commit**
```bash
git add gastos-app/src/api/client.js gastos-app/src/state/session.js gastos-app/tests/api/client.test.js gastos-app/babel.config.cjs gastos-app/package.json gastos-app/package-lock.json
git commit -m "feat(gastos-app): cliente API + store de sesion (JWT)"
```

---

## Task 3: Pantalla de Login

**Files:**
- Create: `gastos-app/src/components/LoginScreen.jsx`
- Test: `gastos-app/tests/components/LoginScreen.test.jsx`

- [ ] **Step 1: Escribir el test que falla** `gastos-app/tests/components/LoginScreen.test.jsx`:
```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginScreen from '../../src/components/LoginScreen.jsx';
import { api } from '../../src/api/client';

jest.mock('../../src/api/client', () => ({ api: { login: jest.fn() } }));

test('envia usuario/password y avisa al loguear', async () => {
  api.login.mockResolvedValue({ token: 'TK', employee: { id: 'e1', nombre: 'Juan' } });
  const onLoggedIn = jest.fn();
  render(<LoginScreen onLoggedIn={onLoggedIn} />);
  fireEvent.change(screen.getByLabelText(/usuario/i), { target: { value: 'juan' } });
  fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'clave' } });
  fireEvent.click(screen.getByRole('button', { name: /entrar/i }));
  await waitFor(() => expect(api.login).toHaveBeenCalledWith('juan', 'clave'));
  await waitFor(() => expect(onLoggedIn).toHaveBeenCalled());
});

test('muestra error en credenciales malas', async () => {
  api.login.mockRejectedValue(new Error('credenciales'));
  render(<LoginScreen onLoggedIn={() => {}} />);
  fireEvent.change(screen.getByLabelText(/usuario/i), { target: { value: 'juan' } });
  fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'x' } });
  fireEvent.click(screen.getByRole('button', { name: /entrar/i }));
  expect(await screen.findByText(/no pudimos|incorrect|error/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Correr y verificar que falla.** `cd gastos-app && npx jest tests/components/LoginScreen.test.jsx`

- [ ] **Step 3: Implementar** `gastos-app/src/components/LoginScreen.jsx`:
```jsx
import { useState } from 'react';
import { api } from '../api/client';

export default function LoginScreen({ onLoggedIn }) {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await api.login(usuario, password);
      onLoggedIn(r);
    } catch {
      setError('No pudimos iniciar sesión. Revisa tu usuario y contraseña.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="min-h-screen flex flex-col justify-center gap-4 p-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-black text-atiko-gold">Atiko Gastos</h1>
      <label className="text-sm" htmlFor="usuario">Usuario</label>
      <input id="usuario" className="rounded-xl bg-white/10 px-4 py-3" value={usuario}
        onChange={(e) => setUsuario(e.target.value)} autoCapitalize="none" />
      <label className="text-sm" htmlFor="password">Contraseña</label>
      <input id="password" type="password" className="rounded-xl bg-white/10 px-4 py-3" value={password}
        onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button type="submit" disabled={loading}
        className="rounded-xl bg-atiko-gold text-black font-black py-3 disabled:opacity-50">
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Correr y verificar que pasa.** `cd gastos-app && npx jest tests/components/LoginScreen.test.jsx`

- [ ] **Step 5: Commit**
```bash
git add gastos-app/src/components/LoginScreen.jsx gastos-app/tests/components/LoginScreen.test.jsx
git commit -m "feat(gastos-app): pantalla de login"
```

---

## Task 4: Captura de boleta (reusa el bridge de Matico)

**Files:**
- Copy: `gastos-app/src/mobile/screenCaptureBridge.js` (verbatim desde Matico)
- Create: `gastos-app/src/components/ReceiptCapture.jsx`
- Test: `gastos-app/tests/components/ReceiptCapture.test.jsx`

- [ ] **Step 1: Copiar el bridge y adaptar SOLO el nombre del plugin.** Copiar
`C:\Users\josea\Desktop\proyectos\.gemini\antigravity\scratch\dashboard-matico\src\mobile\screenCaptureBridge.js`
a `gastos-app/src/mobile/screenCaptureBridge.js`. Es self-contained (solo usa `window.Capacitor`).
**Único cambio:** en la función `getPlugin()`, reemplazar `plugins?.MaticoScreenCapture` por
`plugins?.ScreenCapture` (el plugin se registra con ese nombre neutral en la Task 6). Nada más se edita.

- [ ] **Step 2: Escribir el test que falla** `gastos-app/tests/components/ReceiptCapture.test.jsx`:
```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReceiptCapture from '../../src/components/ReceiptCapture.jsx';

// El bridge nativo no está disponible en jsdom → el componente cae a galería/cámara web.
jest.mock('../../src/mobile/screenCaptureBridge', () => ({
  isNativeScreenCaptureAvailable: () => false,
  waitForNativeScreenCapture: async () => false,
}));

test('al subir una imagen llama onCaptured con base64', async () => {
  const onCaptured = jest.fn();
  render(<ReceiptCapture onCaptured={onCaptured} />);
  const input = screen.getByTestId('file-input');
  const file = new File(['hello'], 'boleta.jpg', { type: 'image/jpeg' });
  // jsdom no implementa FileReader.readAsDataURL completo; el componente debe usarlo.
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(onCaptured).toHaveBeenCalled());
  const arg = onCaptured.mock.calls[0][0];
  expect(arg.mimeType).toBe('image/jpeg');
  expect(typeof arg.imageBase64).toBe('string');
});
```

- [ ] **Step 3: Correr y verificar que falla.** `cd gastos-app && npx jest tests/components/ReceiptCapture.test.jsx`

- [ ] **Step 4: Implementar** `gastos-app/src/components/ReceiptCapture.jsx`:
```jsx
import { useEffect, useRef, useState } from 'react';
import { Camera, UploadCloud, Smartphone } from 'lucide-react';
import {
  isNativeScreenCaptureAvailable, waitForNativeScreenCapture,
} from '../mobile/screenCaptureBridge';

// Lee un File a {imageBase64, mimeType}.
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      resolve({ imageBase64: base64, mimeType: file.type || 'image/jpeg', dataUrl });
    };
    reader.onerror = () => reject(new Error('no_se_pudo_leer'));
    reader.readAsDataURL(file);
  });
}

export default function ReceiptCapture({ onCaptured }) {
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const [nativeOk, setNativeOk] = useState(false);

  useEffect(() => {
    let cancel = false;
    if (isNativeScreenCaptureAvailable()) setNativeOk(true);
    else waitForNativeScreenCapture().then((ok) => { if (!cancel) setNativeOk(Boolean(ok)); });
    return () => { cancel = true; };
  }, []);

  async function onFile(e) {
    const file = (e.target.files || [])[0];
    if (!file) return;
    try {
      const out = await readFileAsBase64(file);
      onCaptured(out);
    } catch { /* noop */ }
    e.target.value = '';
  }

  async function captureNativeScreen() {
    try {
      const mod = await import('../mobile/screenCaptureBridge');
      const shot = await mod.captureNativeScreenshot();
      onCaptured({ imageBase64: shot.imageBase64, mimeType: shot.imageMimeType, dataUrl: shot.dataUrl });
    } catch { /* noop */ }
  }

  return (
    <div className="p-6 grid gap-3 max-w-sm mx-auto">
      <input data-testid="file-input" ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <button onClick={() => camRef.current?.click()} className="rounded-2xl bg-atiko-gold text-black font-black py-4 flex items-center justify-center gap-2">
        <Camera className="w-5 h-5" /> Tomar foto de la boleta
      </button>
      <button onClick={() => fileRef.current?.click()} className="rounded-2xl bg-white/10 font-black py-4 flex items-center justify-center gap-2">
        <UploadCloud className="w-5 h-5" /> Subir desde galería
      </button>
      {nativeOk && (
        <button onClick={captureNativeScreen} className="rounded-2xl bg-white/10 font-black py-4 flex items-center justify-center gap-2">
          <Smartphone className="w-5 h-5" /> Capturar pantalla (recibo digital)
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Correr y verificar que pasa.** `cd gastos-app && npx jest tests/components/ReceiptCapture.test.jsx`

> Si jsdom no dispara `FileReader.onload`, el test usará el `FileReader` de jsdom (que SÍ soporta
> `readAsDataURL` para Blobs). Si aun así no resuelve, el implementador puede usar un pequeño
> polyfill en el test (mock de FileReader). NO cambiar la lógica del componente; ajustar el test.

- [ ] **Step 6: Commit**
```bash
git add gastos-app/src/mobile/screenCaptureBridge.js gastos-app/src/components/ReceiptCapture.jsx gastos-app/tests/components/ReceiptCapture.test.jsx
git commit -m "feat(gastos-app): captura de boleta (galeria/camara/pantalla nativa, bridge Matico)"
```

---

## Task 5: Confirmar/editar + Mis gastos + App shell

**Files:**
- Create: `gastos-app/src/components/ConfirmScreen.jsx`
- Create: `gastos-app/src/components/MyExpenses.jsx`
- Modify: `gastos-app/src/App.jsx` (shell con navegación)
- Test: `gastos-app/tests/components/ConfirmScreen.test.jsx`
- Test: `gastos-app/tests/components/MyExpenses.test.jsx`

- [ ] **Step 1: Escribir el test que falla** `gastos-app/tests/components/ConfirmScreen.test.jsx`:
```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConfirmScreen from '../../src/components/ConfirmScreen.jsx';
import { api } from '../../src/api/client';

jest.mock('../../src/api/client', () => ({ api: { confirmExpense: jest.fn(), updateExpense: jest.fn(), rejectExpense: jest.fn() } }));

const exp = { id: 'x1', proveedor: 'Copec', total: 25000, categoria: 'Combustible y transporte', fecha: '2026-06-12', iva: 3992, tipo_documento: 'boleta' };

test('muestra lo extraido y confirma', async () => {
  api.confirmExpense.mockResolvedValue({ ...exp, estado: 'confirmado' });
  const onDone = jest.fn();
  render(<ConfirmScreen expense={exp} onDone={onDone} />);
  expect(screen.getByText(/Copec/)).toBeInTheDocument();
  expect(screen.getByText(/25\.000/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /confirmar|guardar/i }));
  await waitFor(() => expect(api.confirmExpense).toHaveBeenCalledWith('x1'));
  await waitFor(() => expect(onDone).toHaveBeenCalled());
});

test('descartar llama rejectExpense', async () => {
  api.rejectExpense.mockResolvedValue({ ...exp, estado: 'rechazado' });
  const onDone = jest.fn();
  render(<ConfirmScreen expense={exp} onDone={onDone} />);
  fireEvent.click(screen.getByRole('button', { name: /descartar/i }));
  await waitFor(() => expect(api.rejectExpense).toHaveBeenCalledWith('x1'));
});
```

- [ ] **Step 2: Escribir el test que falla** `gastos-app/tests/components/MyExpenses.test.jsx`:
```jsx
import { render, screen, waitFor } from '@testing-library/react';
import MyExpenses from '../../src/components/MyExpenses.jsx';
import { api } from '../../src/api/client';

jest.mock('../../src/api/client', () => ({ api: { listExpenses: jest.fn() } }));

test('lista mis gastos', async () => {
  api.listExpenses.mockResolvedValue([
    { id: 'x1', proveedor: 'Copec', total: 25000, estado: 'confirmado', categoria: 'Combustible y transporte' },
    { id: 'x2', proveedor: 'Lider', total: 10000, estado: 'pendiente_confirmacion', categoria: 'Otros gastos' },
  ]);
  render(<MyExpenses />);
  await waitFor(() => expect(screen.getByText(/Copec/)).toBeInTheDocument());
  expect(screen.getByText(/Lider/)).toBeInTheDocument();
});
```

- [ ] **Step 3: Correr y verificar que fallan.** `cd gastos-app && npx jest tests/components/ConfirmScreen.test.jsx tests/components/MyExpenses.test.jsx`

- [ ] **Step 4: Implementar** `gastos-app/src/components/ConfirmScreen.jsx`:
```jsx
import { useState } from 'react';
import { api } from '../api/client';

function clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }

export default function ConfirmScreen({ expense, onDone }) {
  const [busy, setBusy] = useState(false);
  const e = expense;

  async function run(fn) {
    setBusy(true);
    try { await fn(); onDone(); } finally { setBusy(false); }
  }

  return (
    <div className="p-6 max-w-sm mx-auto grid gap-3">
      <h2 className="text-xl font-black text-atiko-gold">Revisa el gasto</h2>
      <div className="rounded-2xl bg-white/5 p-4 grid gap-1">
        <div className="text-lg font-black">{e.proveedor || 'Sin proveedor'}</div>
        <div className="text-2xl font-black text-atiko-gold">{clp(e.total)}</div>
        <div className="text-sm opacity-80">{e.tipo_documento || 'documento'} · {e.fecha || 's/fecha'}</div>
        <div className="text-sm opacity-80">{e.categoria || 'Otros gastos'} · IVA {clp(e.iva)}</div>
      </div>
      <button disabled={busy} onClick={() => run(() => api.confirmExpense(e.id))}
        className="rounded-xl bg-atiko-gold text-black font-black py-3 disabled:opacity-50">Confirmar y guardar</button>
      <button disabled={busy} onClick={() => run(() => api.rejectExpense(e.id))}
        className="rounded-xl bg-white/10 font-black py-3 disabled:opacity-50">Descartar</button>
    </div>
  );
}
```

- [ ] **Step 5: Implementar** `gastos-app/src/components/MyExpenses.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { api } from '../api/client';

function clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }

export default function MyExpenses() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.listExpenses().then((r) => { if (alive) setRows(Array.isArray(r) ? r : []); })
      .catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="p-6">Cargando…</div>;
  return (
    <div className="p-4 grid gap-2">
      <h2 className="text-xl font-black text-atiko-gold px-2">Mis gastos</h2>
      {rows.length === 0 && <p className="px-2 opacity-70">Aún no tienes gastos.</p>}
      {rows.map((e) => (
        <div key={e.id} className="rounded-xl bg-white/5 p-3 flex justify-between items-center">
          <div>
            <div className="font-black">{e.proveedor || 'Sin proveedor'}</div>
            <div className="text-xs opacity-70">{e.categoria || 'Otros gastos'} · {e.estado}</div>
          </div>
          <div className="font-black text-atiko-gold">{clp(e.total)}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Reemplazar** `gastos-app/src/App.jsx` con el shell (login → tabs captura/mis gastos → confirmar):
```jsx
import { useState } from 'react';
import { getToken, clearToken } from './state/session';
import LoginScreen from './components/LoginScreen.jsx';
import ReceiptCapture from './components/ReceiptCapture.jsx';
import ConfirmScreen from './components/ConfirmScreen.jsx';
import MyExpenses from './components/MyExpenses.jsx';
import { api } from './api/client';

export default function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [tab, setTab] = useState('capturar');
  const [pending, setPending] = useState(null); // gasto recién creado a confirmar
  const [busy, setBusy] = useState(false);

  if (!authed) return <div data-testid="app-root"><LoginScreen onLoggedIn={() => setAuthed(true)} /></div>;

  async function onCaptured({ imageBase64, mimeType }) {
    setBusy(true);
    try { setPending(await api.createExpense(imageBase64, mimeType)); }
    finally { setBusy(false); }
  }

  return (
    <div data-testid="app-root" className="min-h-screen flex flex-col">
      <header className="flex justify-between items-center p-4 border-b border-white/10">
        <span className="font-black text-atiko-gold">Atiko Gastos</span>
        <button className="text-xs opacity-70" onClick={() => { clearToken(); setAuthed(false); }}>Salir</button>
      </header>

      <main className="flex-1">
        {pending ? (
          <ConfirmScreen expense={pending} onDone={() => { setPending(null); setTab('mis'); }} />
        ) : tab === 'capturar' ? (
          busy ? <div className="p-6">Procesando boleta…</div> : <ReceiptCapture onCaptured={onCaptured} />
        ) : (
          <MyExpenses />
        )}
      </main>

      {!pending && (
        <nav className="flex border-t border-white/10">
          <button className={`flex-1 py-3 font-black ${tab === 'capturar' ? 'text-atiko-gold' : 'opacity-60'}`} onClick={() => setTab('capturar')}>Capturar</button>
          <button className={`flex-1 py-3 font-black ${tab === 'mis' ? 'text-atiko-gold' : 'opacity-60'}`} onClick={() => setTab('mis')}>Mis gastos</button>
        </nav>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Correr la suite del app.** `cd gastos-app && npx jest` — todo verde.

- [ ] **Step 8: Verificar el build web.** `cd gastos-app && npm run build` — genera `dist/` sin errores.

- [ ] **Step 9: Commit**
```bash
git add gastos-app/src/components/ConfirmScreen.jsx gastos-app/src/components/MyExpenses.jsx gastos-app/src/App.jsx gastos-app/tests/components/ConfirmScreen.test.jsx gastos-app/tests/components/MyExpenses.test.jsx
git commit -m "feat(gastos-app): confirmar/editar + mis gastos + shell con navegacion"
```

---

## Task 6: Android nuevo + portar SOLO la feature de captura + APK

**NO se copia el proyecto Matico.** Se genera un Android fresco con Capacitor y se le agrega
únicamente la feature de captura de pantalla (3 Java renombrados + registro + permisos del service).

**Files:**
- Create: `gastos-app/capacitor.config.json`
- Generate: `gastos-app/android/` (vía `npx cap add android`)
- Create (portados): `ScreenCapturePlugin.java`, `ScreenCaptureService.java`, `ScreenCaptureStore.java`
- Modify: el `MainActivity.java` generado, el `AndroidManifest.xml` generado

- [ ] **Step 1: `gastos-app/capacitor.config.json`** (empaqueta dist local, sin server.url remoto):
```json
{
  "appId": "cl.atikodigital.gastos",
  "appName": "Atiko Gastos",
  "webDir": "dist"
}
```

- [ ] **Step 2: Generar el Android de cero.**
```
cd gastos-app
npm run build
npx cap add android
```
Esto crea `gastos-app/android/` con el package `cl.atikodigital.gastos` y un `MainActivity.java`
limpio en `android/app/src/main/java/cl/atikodigital/gastos/`. NO trae nada de Matico.
(Si `cap add` pide la plataforma ya instalada, está OK; luego `npx cap sync android`.)

- [ ] **Step 3: Portar los 3 Java de la feature de captura** a
`gastos-app/android/app/src/main/java/cl/atikodigital/gastos/`. Tomar como fuente los archivos de
Matico (`...\dashboard-matico\android\app\src\main\java\app\matico\dashboard\MaticoScreenCapture{Plugin,Service,Store}.java`)
y aplicar EXACTAMENTE estos renombres (find-and-replace) al portarlos — sin cambiar la lógica:
  - `package app.matico.dashboard;` → `package cl.atikodigital.gastos;`
  - Clase/archivo `MaticoScreenCapturePlugin` → `ScreenCapturePlugin`; `MaticoScreenCaptureService` → `ScreenCaptureService`; `MaticoScreenCaptureStore` → `ScreenCaptureStore` (renombrar TODAS las referencias cruzadas entre los 3 archivos, incluido `MaticoScreenCaptureService.class`, `MaticoScreenCaptureStore.queueCount()`, etc.).
  - La anotación `@CapacitorPlugin(name = "MaticoScreenCapture")` → `@CapacitorPlugin(name = "ScreenCapture")`.
  - Las constantes de acción `"app.matico.dashboard.ACTION_..."` → `"cl.atikodigital.gastos.ACTION_..."` (son strings internos únicos; cambiarlos por coherencia).
  - Los `Log.e("MaticoCaptureService", ...)`/tags pueden quedarse o cambiarse a `"GastosCaptureService"` (cosmético).
  Guardar los 3 archivos resultantes en el package nuevo. NO portar `MaticoApplication.java` ni nada de alarmas/notificaciones.

- [ ] **Step 4: Registrar el plugin en el `MainActivity.java` generado.**
Editar `gastos-app/android/app/src/main/java/cl/atikodigital/gastos/MainActivity.java`: dentro de
`onCreate`, ANTES de `super.onCreate(...)`, agregar `registerPlugin(ScreenCapturePlugin.class);`.
(Mismo package, no hace falta import.) Opcional: portar de Matico el `requestAppPermissions()` para
pedir CAMERA/READ_MEDIA_IMAGES/POST_NOTIFICATIONS al inicio (recomendado; copiar ese método tal cual
del MainActivity de Matico, ya está en el package correcto). Dejar el resto del MainActivity generado intacto.

- [ ] **Step 5: Agregar al `AndroidManifest.xml`** generado SOLO lo que la feature de captura necesita.
Dentro de `<application>` (junto al `<activity>` que genera Capacitor), agregar el service:
```xml
<service
    android:name=".ScreenCaptureService"
    android:enabled="true"
    android:exported="false"
    android:foregroundServiceType="mediaProjection" />
```
Y a nivel `<manifest>` agregar los permisos (los que NO estén ya):
```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" />
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
```
(`INTERNET` ya viene en el manifest de Capacitor.) NO agregar alarmas/exact-alarm/boot/wake-lock — esos eran de Matico, no de esta feature.

- [ ] **Step 6: Asegurar minSdk/targetSdk compatibles.** La feature usa MediaProjection con checks de API
hasta UPSIDE_DOWN_CAKE (34). En `gastos-app/android/variables.gradle` confirmar `minSdkVersion >= 24`
y `compileSdkVersion >= 34` (Capacitor 8 ya pone compile/target altos; si minSdk quedó <24, subirlo a 24).
`versionName "1.0"`, `versionCode 1` en `app/build.gradle`.

- [ ] **Step 7: Sync + compilar el APK debug.**
```
cd gastos-app
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```
El APK queda en `gastos-app/android/app/build/outputs/apk/debug/app-debug.apk`.

> Si Gradle falla por entorno (SDK/JDK/paths), **NO** inventar workarounds: reportar el error exacto
> como DONE_WITH_CONCERNS con instrucciones para abrir en Android Studio (`npm run cap:android`) y
> compilar desde ahí. El código web + el android generado + la feature portada quedan listos igual.
> Si `gradlew assembleDebug` falla porque un .java renombrado tiene una referencia cruzada vieja
> (`MaticoScreenCapture*`), corregir esa referencia (es un renombre que se escapó) y recompilar.

- [ ] **Step 8: Verificar artefacto.** Confirmar que `app-debug.apk` existe; reportar ruta y tamaño.

- [ ] **Step 9: Commit** (sin el APK ni build/):
```bash
git add gastos-app/capacitor.config.json gastos-app/android
git status   # confirmar que android/app/build, .gradle, local.properties NO estan staged (.gitignore los cubre)
git commit -m "feat(gastos-app): Android nuevo + feature de captura de pantalla portada + APK debug"
```

---

## Cierre del Plan 4

Al terminar: una app Android **propia** instalable (`app-debug.apk`) con login de empleado, captura
de boleta (cámara/galería/**captura de pantalla** reusando SOLO la feature de captura portada),
confirmación del gasto leído por el OCR, y "mis gastos" — toda la capa JS testeada (jest+RTL), el
Android generado de cero (no un clon de Matico) con la feature de captura portada y renombrada, y el
APK compilado.

**Pendiente para Plan 5/6:**
- Apuntar `VITE_API_BASE` al backend real desplegado (Plan 6) y probar e2e en un teléfono.
- Icono/splash de Atiko (hoy quedan los de Matico).
- Edición de campos en ConfirmScreen (hoy confirma/descarta; editar monto/categoría es mejora).
- Firmar el APK release para distribución.
