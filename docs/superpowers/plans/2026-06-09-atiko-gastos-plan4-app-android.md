# Plan 4 — App Android (clon del proyecto de captura + flujo de gastos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-06-09-atiko-gastos-design.md` (§3.1)
**Depende de:** Plan 3 (API `/api/app`).

**Goal:** App Android "Atiko Gastos" construida **clonando** el proyecto Capacitor de la feature de captura (el de la conversación "Mobile screenshot capture feature", en disco = `dashboard-matico`) y montando encima el flujo de gastos: login de empleado, captura de boleta (reusando **EvidenceIntake** + el plugin de captura de pantalla), revisión de lo que leyó el OCR, confirmar/descartar, y "mis gastos" — contra `/api/app`.

**Architecture / decisión del usuario:** Se CLONA el proyecto completo (`dashboard-matico` → `gastos-app/`): su shell Capacitor, los plugins Java de captura ya cableados, `screenCaptureBridge.js`, `EvidenceIntake.jsx` y todo el stack (React/Vite/Tailwind/Capacitor 8). Sobre esa base se: (1) re-brandea a Atiko Gastos (appId/appName), (2) agrega un cliente API a `/api/app` + store de sesión, (3) agrega las pantallas de gastos (Login, Confirm, MyExpenses) y un componente `GastosApp` que usa `EvidenceIntake` (maxEvidence=1) para capturar, y (4) **reapunta `src/main.jsx` a `GastosApp`** en vez del `App` de Matico. Los componentes de Matico quedan en el código pero **fuera del bundle** (Vite tree-shake lo no importado). La capa JS nueva se prueba con TDD (jest + RTL). El APK se compila con `gradlew assembleDebug` (el usuario tiene Android Studio/SDK).

**Tech Stack (heredado del clon):** React 18, Vite 5, Tailwind 3, Capacitor 8.3.1, lucide-react. Se AGREGA toolchain de test: jest, @testing-library/react, @testing-library/jest-dom, jest-environment-jsdom, @babel/preset-env, @babel/preset-react, babel-jest.

**Fuente a clonar:** `C:\Users\josea\Desktop\proyectos\.gemini\antigravity\scratch\dashboard-matico` (excluyendo `.git`, `node_modules`, `dist`, `.claude`, `server`, y los build dirs de android).

---

## Convenciones

- Carpeta nueva: **`gastos-app/`** (clon), trackeada en git, con `node_modules`/`dist`/build de android ignorados.
- **appId** `cl.atikodigital.gastos`, **appName** "Atiko Gastos".
- API base: `import.meta.env.VITE_API_BASE || 'https://gastos.atikodigital.cl'`. Dev: `VITE_API_BASE=http://localhost:3100`.
- Token JWT en `localStorage` bajo `atiko_gastos_jwt` (NO el `matico_jwt` del clon).
- La entrada de la app (`src/main.jsx`) renderiza **`GastosApp`** (nuevo), no el `App` de Matico.

---

## Task 1: Clonar el proyecto + re-brandear + toolchain de test

**Files:**
- Clone: `dashboard-matico` → `gastos-app/` (excluyendo lo indicado)
- Create: `gastos-app/.gitignore`, `gastos-app/babel.config.cjs`, `gastos-app/jest.config.cjs`
- Modify: `gastos-app/package.json` (name + scripts test + devDeps), `gastos-app/capacitor.config.json`, `gastos-app/android/app/build.gradle`, `gastos-app/android/app/src/main/res/values/strings.xml`
- Test: `gastos-app/tests/smoke.test.js`

- [ ] **Step 1: Clonar.** Copiar `C:\Users\josea\Desktop\proyectos\.gemini\antigravity\scratch\dashboard-matico`
a `gastos-app/` EXCLUYENDO: `.git`, `node_modules`, `dist`, `.claude`, `server`, `android/app/build`,
`android/.gradle`, `android/build`, `android/local.properties`, `.tmp-playwright`.
(PowerShell sugerido: `robocopy "<src>" "gastos-app" /E /XD .git node_modules dist .claude server build .gradle .tmp-playwright /XF local.properties` — robocopy excluye por NOMBRE de carpeta en todo el árbol, así cubre los build de android.) Verificar que quedó `gastos-app/src/components/EvidenceIntake.jsx`, `gastos-app/src/mobile/screenCaptureBridge.js`, `gastos-app/android/app/src/main/java/app/matico/dashboard/MaticoScreenCapturePlugin.java`, `gastos-app/package.json`, `gastos-app/vite.config.js`.

- [ ] **Step 2: `.gitignore`** en `gastos-app/`:
```
node_modules/
dist/
.env
android/app/build/
android/.gradle/
android/build/
android/local.properties
```

- [ ] **Step 3: `package.json`** — cambiar `"name"` a `"atiko-gastos-app"`; agregar script `"test": "jest"`; agregar a `devDependencies`: `@babel/preset-env ^7.24.0`, `@babel/preset-react ^7.24.0`, `@testing-library/jest-dom ^6.4.0`, `@testing-library/react ^14.2.0`, `babel-jest ^29.7.0`, `jest ^29.7.0`, `jest-environment-jsdom ^29.7.0`. (Mantener lo demás del clon tal cual.)

- [ ] **Step 4: `babel.config.cjs`**:
```js
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
  ],
};
```
`jest.config.cjs`:
```js
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['@testing-library/jest-dom'],
  testMatch: ['**/tests/**/*.test.{js,jsx}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss)$': '<rootDir>/tests/styleMock.cjs',
  },
  transform: { '^.+\\.(js|jsx)$': 'babel-jest' },
  transformIgnorePatterns: ['/node_modules/(?!(lucide-react)/)'],
};
```
`gastos-app/tests/styleMock.cjs`:
```js
module.exports = {};
```

- [ ] **Step 5: Re-brandear Capacitor.** `gastos-app/capacitor.config.json` → reemplazar TODO por:
```json
{
  "appId": "cl.atikodigital.gastos",
  "appName": "Atiko Gastos",
  "webDir": "dist"
}
```
(Quita el `server.url` remoto de Matico → la app empaqueta su `dist` local. Quita el bloque `LocalNotifications` que no usamos.)

- [ ] **Step 6: Re-brandear Android.**
  - `gastos-app/android/app/build.gradle`: `applicationId` → `"cl.atikodigital.gastos"`; `versionCode 1`; `versionName "1.0"`. **Dejar `namespace = "app.matico.dashboard"`** (no mover los .java; el plugin sigue funcionando).
  - `gastos-app/android/app/src/main/res/values/strings.xml`: `app_name`, `title_activity_main` → "Atiko Gastos". (Si hay `custom_url_scheme`/`package_name`, dejarlos; no son críticos para el MVP.)

- [ ] **Step 7: `npm install`** dentro de `gastos-app`. (Si falla, reportar BLOCKED con el error.)

- [ ] **Step 8: Smoke test del toolchain** `gastos-app/tests/smoke.test.js`:
```js
test('jest corre en el clon', () => {
  expect(1 + 1).toBe(2);
});
```
Correr: `cd gastos-app && npx jest tests/smoke.test.js` → PASA.

- [ ] **Step 9: Verificar build web.** `cd gastos-app && npm run build`. Debe generar `dist/`.
> Si el build de Matico falla por algo de su `App.jsx`/dependencias de su backend, NO arreglar Matico:
> en la Task 4 reapuntaremos la entrada a `GastosApp` (más liviano). Si el build falla AHORA, dejar
> constancia y continuar — el build definitivo se valida tras la Task 4. (Idealmente igual pasa, es estático.)

- [ ] **Step 10: Commit**
```bash
git add gastos-app
git status   # confirmar que node_modules / android build NO estan staged
git commit -m "feat(gastos-app): clon del proyecto de captura + rebrand Atiko Gastos + toolchain test"
```

---

## Task 2: Cliente API de gastos + sesión

**Files:**
- Create: `gastos-app/src/gastos/api.js`
- Create: `gastos-app/src/gastos/session.js`
- Test: `gastos-app/tests/gastos/api.test.js`

(Se usa un namespace `src/gastos/**` para separar lo nuevo del código clonado de Matico.)

- [ ] **Step 1: Escribir el test que falla** `gastos-app/tests/gastos/api.test.js`:
```js
import { api } from '../../src/gastos/api';
import { getToken, setToken, clearToken } from '../../src/gastos/session';

beforeEach(() => { clearToken(); global.fetch = jest.fn(); });

test('login guarda y devuelve el token', async () => {
  fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: 'TK', employee: { id: 'e1', nombre: 'Juan' } }) });
  const r = await api.login('juan', 'clave');
  expect(r.employee.nombre).toBe('Juan');
  expect(getToken()).toBe('TK');
  const [url, opts] = fetch.mock.calls[0];
  expect(url).toContain('/api/app/login');
  expect(JSON.parse(opts.body)).toEqual({ usuario: 'juan', password: 'clave' });
});

test('login 401 lanza, no guarda token', async () => {
  fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'credenciales' }) });
  await expect(api.login('juan', 'x')).rejects.toThrow();
  expect(getToken()).toBeNull();
});

test('createExpense manda token + imagen', async () => {
  setToken('TK');
  fetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'x1', estado: 'pendiente_confirmacion' }) });
  const exp = await api.createExpense('B64', 'image/jpeg');
  expect(exp.id).toBe('x1');
  const [url, opts] = fetch.mock.calls[0];
  expect(url).toContain('/api/app/expenses');
  expect(opts.headers.Authorization).toBe('Bearer TK');
  expect(JSON.parse(opts.body)).toEqual({ imageBase64: 'B64', mimeType: 'image/jpeg' });
});

test('listExpenses devuelve filas', async () => {
  setToken('TK');
  fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ([{ id: 'x1' }]) });
  expect(await api.listExpenses()).toHaveLength(1);
});
```

- [ ] **Step 2: Correr y verificar que falla.** `cd gastos-app && npx jest tests/gastos/api.test.js`

- [ ] **Step 3: Implementar** `gastos-app/src/gastos/session.js`:
```js
const KEY = 'atiko_gastos_jwt';
export function getToken() { try { return localStorage.getItem(KEY); } catch { return null; } }
export function setToken(t) { try { if (t) localStorage.setItem(KEY, t); } catch { /* noop */ } }
export function clearToken() { try { localStorage.removeItem(KEY); } catch { /* noop */ } }
```

- [ ] **Step 4: Implementar** `gastos-app/src/gastos/api.js`:
```js
import { getToken, setToken } from './session';

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE)
  || 'https://gastos.atikodigital.cl';

async function req(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) { const t = getToken(); if (t) headers.Authorization = `Bearer ${t}`; }
  const res = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error((data && data.error) || `http_${res.status}`); e.status = res.status; throw e; }
  return data;
}

export const api = {
  async login(usuario, password) {
    const data = await req('/api/app/login', { method: 'POST', body: { usuario, password }, auth: false });
    setToken(data.token);
    return data;
  },
  createExpense(imageBase64, mimeType = 'image/jpeg') { return req('/api/app/expenses', { method: 'POST', body: { imageBase64, mimeType } }); },
  confirmExpense(id) { return req(`/api/app/expenses/${id}/confirm`, { method: 'POST' }); },
  updateExpense(id, patch) { return req(`/api/app/expenses/${id}`, { method: 'PATCH', body: patch }); },
  rejectExpense(id) { return req(`/api/app/expenses/${id}/reject`, { method: 'POST' }); },
  listExpenses() { return req('/api/app/expenses'); },
};
```
> NOTA: si babel-jest rompe al parsear `import.meta`, instalar `babel-plugin-transform-import-meta`
> (devDep) y agregarlo a `plugins` en `babel.config.cjs`. El guard `typeof import.meta !== 'undefined'`
> ayuda pero el PARSE puede fallar igual; aplicar el plugin si aparece el error y reportarlo.

- [ ] **Step 5: Correr y verificar que pasa.** `cd gastos-app && npx jest tests/gastos/api.test.js`

- [ ] **Step 6: Commit**
```bash
git add gastos-app/src/gastos/api.js gastos-app/src/gastos/session.js gastos-app/tests/gastos/api.test.js gastos-app/babel.config.cjs gastos-app/package.json gastos-app/package-lock.json
git commit -m "feat(gastos-app): cliente API /api/app + sesion JWT"
```

---

## Task 3: Pantallas Login, Confirm, MyExpenses

**Files:**
- Create: `gastos-app/src/gastos/LoginScreen.jsx`, `ConfirmScreen.jsx`, `MyExpenses.jsx`
- Test: `gastos-app/tests/gastos/LoginScreen.test.jsx`, `ConfirmScreen.test.jsx`, `MyExpenses.test.jsx`

- [ ] **Step 1: Tests que fallan.**

`gastos-app/tests/gastos/LoginScreen.test.jsx`:
```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginScreen from '../../src/gastos/LoginScreen.jsx';
import { api } from '../../src/gastos/api';
jest.mock('../../src/gastos/api', () => ({ api: { login: jest.fn() } }));

test('loguea y avisa', async () => {
  api.login.mockResolvedValue({ token: 'TK', employee: { id: 'e1', nombre: 'Juan' } });
  const onLoggedIn = jest.fn();
  render(<LoginScreen onLoggedIn={onLoggedIn} />);
  fireEvent.change(screen.getByLabelText(/usuario/i), { target: { value: 'juan' } });
  fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'clave' } });
  fireEvent.click(screen.getByRole('button', { name: /entrar/i }));
  await waitFor(() => expect(api.login).toHaveBeenCalledWith('juan', 'clave'));
  await waitFor(() => expect(onLoggedIn).toHaveBeenCalled());
});

test('muestra error', async () => {
  api.login.mockRejectedValue(new Error('credenciales'));
  render(<LoginScreen onLoggedIn={() => {}} />);
  fireEvent.change(screen.getByLabelText(/usuario/i), { target: { value: 'j' } });
  fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'x' } });
  fireEvent.click(screen.getByRole('button', { name: /entrar/i }));
  expect(await screen.findByText(/no pudimos|error|incorrect/i)).toBeInTheDocument();
});
```

`gastos-app/tests/gastos/ConfirmScreen.test.jsx`:
```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConfirmScreen from '../../src/gastos/ConfirmScreen.jsx';
import { api } from '../../src/gastos/api';
jest.mock('../../src/gastos/api', () => ({ api: { confirmExpense: jest.fn(), rejectExpense: jest.fn() } }));
const exp = { id: 'x1', proveedor: 'Copec', total: 25000, categoria: 'Combustible y transporte', fecha: '2026-06-12', iva: 3992, tipo_documento: 'boleta' };

test('confirma', async () => {
  api.confirmExpense.mockResolvedValue({ ...exp, estado: 'confirmado' });
  const onDone = jest.fn();
  render(<ConfirmScreen expense={exp} onDone={onDone} />);
  expect(screen.getByText(/Copec/)).toBeInTheDocument();
  expect(screen.getByText(/25\.000/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /confirmar|guardar/i }));
  await waitFor(() => expect(api.confirmExpense).toHaveBeenCalledWith('x1'));
  await waitFor(() => expect(onDone).toHaveBeenCalled());
});

test('descarta', async () => {
  api.rejectExpense.mockResolvedValue({ ...exp, estado: 'rechazado' });
  render(<ConfirmScreen expense={exp} onDone={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /descartar/i }));
  await waitFor(() => expect(api.rejectExpense).toHaveBeenCalledWith('x1'));
});
```

`gastos-app/tests/gastos/MyExpenses.test.jsx`:
```jsx
import { render, screen, waitFor } from '@testing-library/react';
import MyExpenses from '../../src/gastos/MyExpenses.jsx';
import { api } from '../../src/gastos/api';
jest.mock('../../src/gastos/api', () => ({ api: { listExpenses: jest.fn() } }));

test('lista', async () => {
  api.listExpenses.mockResolvedValue([
    { id: 'x1', proveedor: 'Copec', total: 25000, estado: 'confirmado', categoria: 'Combustible y transporte' },
    { id: 'x2', proveedor: 'Lider', total: 10000, estado: 'pendiente_confirmacion', categoria: 'Otros gastos' },
  ]);
  render(<MyExpenses />);
  await waitFor(() => expect(screen.getByText(/Copec/)).toBeInTheDocument());
  expect(screen.getByText(/Lider/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Correr y verificar que fallan.** `cd gastos-app && npx jest tests/gastos/LoginScreen.test.jsx tests/gastos/ConfirmScreen.test.jsx tests/gastos/MyExpenses.test.jsx`

- [ ] **Step 3: Implementar** `gastos-app/src/gastos/LoginScreen.jsx`:
```jsx
import { useState } from 'react';
import { api } from './api';

export default function LoginScreen({ onLoggedIn }) {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(e) {
    e.preventDefault(); setError(''); setLoading(true);
    try { onLoggedIn(await api.login(usuario, password)); }
    catch { setError('No pudimos iniciar sesión. Revisa tu usuario y contraseña.'); }
    finally { setLoading(false); }
  }
  return (
    <form onSubmit={submit} className="min-h-screen flex flex-col justify-center gap-4 p-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-black" style={{ color: '#C9A24B' }}>Atiko Gastos</h1>
      <label className="text-sm" htmlFor="usuario">Usuario</label>
      <input id="usuario" className="rounded-xl bg-black/10 px-4 py-3 border" value={usuario}
        onChange={(e) => setUsuario(e.target.value)} autoCapitalize="none" />
      <label className="text-sm" htmlFor="password">Contraseña</label>
      <input id="password" type="password" className="rounded-xl bg-black/10 px-4 py-3 border" value={password}
        onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button type="submit" disabled={loading} className="rounded-xl font-black py-3 text-black disabled:opacity-50" style={{ background: '#C9A24B' }}>
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Implementar** `gastos-app/src/gastos/ConfirmScreen.jsx`:
```jsx
import { useState } from 'react';
import { api } from './api';
function clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }
export default function ConfirmScreen({ expense, onDone }) {
  const [busy, setBusy] = useState(false);
  const e = expense;
  async function run(fn) { setBusy(true); try { await fn(); onDone(); } finally { setBusy(false); } }
  return (
    <div className="p-6 max-w-sm mx-auto grid gap-3">
      <h2 className="text-xl font-black" style={{ color: '#C9A24B' }}>Revisa el gasto</h2>
      <div className="rounded-2xl bg-black/5 p-4 grid gap-1 border">
        <div className="text-lg font-black">{e.proveedor || 'Sin proveedor'}</div>
        <div className="text-2xl font-black" style={{ color: '#C9A24B' }}>{clp(e.total)}</div>
        <div className="text-sm opacity-70">{e.tipo_documento || 'documento'} · {e.fecha || 's/fecha'}</div>
        <div className="text-sm opacity-70">{e.categoria || 'Otros gastos'} · IVA {clp(e.iva)}</div>
      </div>
      <button disabled={busy} onClick={() => run(() => api.confirmExpense(e.id))} className="rounded-xl font-black py-3 text-black disabled:opacity-50" style={{ background: '#C9A24B' }}>Confirmar y guardar</button>
      <button disabled={busy} onClick={() => run(() => api.rejectExpense(e.id))} className="rounded-xl font-black py-3 bg-black/10 border disabled:opacity-50">Descartar</button>
    </div>
  );
}
```

- [ ] **Step 5: Implementar** `gastos-app/src/gastos/MyExpenses.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { api } from './api';
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
      <h2 className="text-xl font-black px-2" style={{ color: '#C9A24B' }}>Mis gastos</h2>
      {rows.length === 0 && <p className="px-2 opacity-60">Aún no tienes gastos.</p>}
      {rows.map((e) => (
        <div key={e.id} className="rounded-xl bg-black/5 p-3 flex justify-between items-center border">
          <div>
            <div className="font-black">{e.proveedor || 'Sin proveedor'}</div>
            <div className="text-xs opacity-60">{e.categoria || 'Otros gastos'} · {e.estado}</div>
          </div>
          <div className="font-black" style={{ color: '#C9A24B' }}>{clp(e.total)}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Correr y verificar que pasan.** `cd gastos-app && npx jest tests/gastos`

- [ ] **Step 7: Commit**
```bash
git add gastos-app/src/gastos/LoginScreen.jsx gastos-app/src/gastos/ConfirmScreen.jsx gastos-app/src/gastos/MyExpenses.jsx gastos-app/tests/gastos/LoginScreen.test.jsx gastos-app/tests/gastos/ConfirmScreen.test.jsx gastos-app/tests/gastos/MyExpenses.test.jsx
git commit -m "feat(gastos-app): pantallas Login/Confirm/MyExpenses"
```

---

## Task 4: GastosApp (usa EvidenceIntake) + reapuntar la entrada

**Files:**
- Create: `gastos-app/src/gastos/GastosApp.jsx`
- Modify: `gastos-app/src/main.jsx` (renderizar `GastosApp`)
- Test: `gastos-app/tests/gastos/GastosApp.test.jsx`

`GastosApp` reusa el **EvidenceIntake** clonado (con `maxEvidence={1}`): cuando el empleado captura
(cámara/galería/pantalla nativa), `onChange` entrega `[{imageBase64, imageMimeType}]`; tomamos el
primero → `api.createExpense` → pantalla de confirmación.

- [ ] **Step 1: Escribir el test que falla** `gastos-app/tests/gastos/GastosApp.test.jsx`:
```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GastosApp from '../../src/gastos/GastosApp.jsx';
import { api } from '../../src/gastos/api';
import { setToken, clearToken } from '../../src/gastos/session';

jest.mock('../../src/gastos/api', () => ({ api: { createExpense: jest.fn(), listExpenses: jest.fn().mockResolvedValue([]) } }));
// Stub de EvidenceIntake: expone un botón que dispara onChange con una evidencia.
jest.mock('../../src/components/EvidenceIntake.jsx', () => ({
  __esModule: true,
  default: ({ onChange }) => (
    <button onClick={() => onChange([{ imageBase64: 'B64', imageMimeType: 'image/jpeg' }])}>fake-capture</button>
  ),
}));

beforeEach(() => clearToken());

test('sin token muestra login', () => {
  render(<GastosApp />);
  expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument();
});

test('con token: capturar crea gasto y pasa a confirmar', async () => {
  setToken('TK');
  api.createExpense.mockResolvedValue({ id: 'x1', proveedor: 'Copec', total: 25000, estado: 'pendiente_confirmacion' });
  render(<GastosApp />);
  fireEvent.click(screen.getByText('fake-capture'));
  await waitFor(() => expect(api.createExpense).toHaveBeenCalledWith('B64', 'image/jpeg'));
  expect(await screen.findByText(/Revisa el gasto/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Correr y verificar que falla.** `cd gastos-app && npx jest tests/gastos/GastosApp.test.jsx`

- [ ] **Step 3: Implementar** `gastos-app/src/gastos/GastosApp.jsx`:
```jsx
import { useState } from 'react';
import { getToken, clearToken } from './session';
import { api } from './api';
import LoginScreen from './LoginScreen.jsx';
import ConfirmScreen from './ConfirmScreen.jsx';
import MyExpenses from './MyExpenses.jsx';
import EvidenceIntake from '../components/EvidenceIntake.jsx';

export default function GastosApp() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [tab, setTab] = useState('capturar');
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!authed) return <LoginScreen onLoggedIn={() => setAuthed(true)} />;

  async function onChange(items) {
    const ev = (items || [])[0];
    if (!ev || !ev.imageBase64) return;
    setBusy(true);
    try { setPending(await api.createExpense(ev.imageBase64, ev.imageMimeType || 'image/jpeg')); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex justify-between items-center p-4 border-b">
        <span className="font-black" style={{ color: '#C9A24B' }}>Atiko Gastos</span>
        <button className="text-xs opacity-60" onClick={() => { clearToken(); setAuthed(false); }}>Salir</button>
      </header>
      <main className="flex-1">
        {pending ? (
          <ConfirmScreen expense={pending} onDone={() => { setPending(null); setTab('mis'); }} />
        ) : tab === 'capturar' ? (
          busy ? <div className="p-6">Procesando boleta…</div>
               : <div className="p-4"><p className="px-2 mb-2 opacity-70">Captura la boleta o factura:</p>
                   <EvidenceIntake maxEvidence={1} value={[]} onChange={onChange} showNativeCapture /></div>
        ) : (
          <MyExpenses />
        )}
      </main>
      {!pending && (
        <nav className="flex border-t">
          <button className={`flex-1 py-3 font-black ${tab === 'capturar' ? '' : 'opacity-50'}`} style={tab === 'capturar' ? { color: '#C9A24B' } : {}} onClick={() => setTab('capturar')}>Capturar</button>
          <button className={`flex-1 py-3 font-black ${tab === 'mis' ? '' : 'opacity-50'}`} style={tab === 'mis' ? { color: '#C9A24B' } : {}} onClick={() => setTab('mis')}>Mis gastos</button>
        </nav>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Reapuntar `gastos-app/src/main.jsx`.** Reemplazar el contenido por:
```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import GastosApp from './gastos/GastosApp.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GastosApp />
  </StrictMode>
);
```
(Ya no se importa el `App` de Matico. `index.css` se mantiene; si trae estilos de Matico no molesta.)

- [ ] **Step 5: Correr la suite del app.** `cd gastos-app && npx jest` — todo verde.

- [ ] **Step 6: Verificar el build web.** `cd gastos-app && npm run build` — `dist/` sin errores (ahora la entrada es `GastosApp`, mucho más liviana; el código Matico no importado se tree-shakea).
> Si el build falla por un import de Matico que `GastosApp`→`EvidenceIntake` arrastra (p.ej.
> `RemoteCaptureButton` y SUS deps), confirmá que esos archivos existen en el clon (deberían). Si
> `EvidenceIntake` arrastra algo de Matico que rompe el build, NO reescribir EvidenceIntake: stubear
> ese import problemático con un archivo mínimo equivalente y reportarlo. No tocar la lógica de captura.

- [ ] **Step 7: Commit**
```bash
git add gastos-app/src/gastos/GastosApp.jsx gastos-app/src/main.jsx gastos-app/tests/gastos/GastosApp.test.jsx
git commit -m "feat(gastos-app): GastosApp (login+captura EvidenceIntake+confirmar+mis gastos) y entrada reapuntada"
```

---

## Task 5: Sync Capacitor + compilar APK

**Files:** (sin código nuevo; build del clon ya re-brandeado)

- [ ] **Step 1: Build + sync.**
```
cd gastos-app
npm run build
npx cap sync android
```
`cap sync` copia `dist/` al android y actualiza los plugins (el plugin de captura ya está en el
clon). Reportar si `cap sync` pide algo.

- [ ] **Step 2: Compilar APK debug.**
```
cd gastos-app/android
.\gradlew.bat assembleDebug
```
APK en `gastos-app/android/app/build/outputs/apk/debug/app-debug.apk`.
> Si Gradle falla por entorno (SDK/JDK/paths), reportar el error exacto como DONE_WITH_CONCERNS con
> instrucciones de abrir en Android Studio (`npm run cap:android`) y compilar ahí. NO inventar
> workarounds. Si falla por `applicationId`/namespace, revisar la Task 1 Step 6.

- [ ] **Step 3: Verificar artefacto.** Confirmar que `app-debug.apk` existe; reportar ruta y tamaño.

- [ ] **Step 4: Commit** (si `cap sync` cambió algo trackeable, p.ej. `android/app/src/main/assets`):
```bash
git add gastos-app/android
git status   # build/.gradle/local.properties NO deben estar staged
git commit -m "chore(gastos-app): cap sync + APK debug compilado" --allow-empty
```

---

## Cierre del Plan 4

Al terminar: app Android "Atiko Gastos" (clon del proyecto de captura, re-brandeado) con login de
empleado, captura de boleta reusando **EvidenceIntake** + el plugin de captura de pantalla,
confirmación del gasto leído por el OCR y "mis gastos" — capa nueva testeada (jest+RTL), entrada
reapuntada a `GastosApp`, APK compilado.

**Pendiente para Plan 5/6:**
- Apuntar `VITE_API_BASE` al backend desplegado (Plan 6) y probar e2e en teléfono real.
- Icono/splash de Atiko (hoy los de Matico).
- (Opcional) limpiar del clon los componentes/deps de Matico que no se usan (quizzes, alarmas, JARVIS…).
- Editar campos en ConfirmScreen (hoy confirma/descarta).
- Firmar APK release para distribución.
