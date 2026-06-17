# Onboarding wizard híbrido (Hash IA · Chat #6) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **UBICACIÓN:** Todo en `C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\` (repo independiente, branch `master`). Antes de commitear: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git rev-parse --show-toplevel && git branch --show-current` → toplevel termina en `HASH IA`, branch `master`. `git add <archivos específicos>` (NO `git add -A`). READ los archivos actuales antes de editar. Windows; Bash tool con comillas para rutas con espacios.

**Goal:** Un wizard de primer-arranque en la app que deja al cliente con su negocio configurado y catálogo cargado, listo para vender.

**Architecture:** Wizard de 5 pasos en `gastos-app` que reusa lo existente (catálogo foto/voz/manual, pedido-config IVA/delivery, KALY). Una función pura `onboardingStatus` deriva el progreso desde company+productos+config. Backend mínimo nuevo: `GET/PATCH /api/app/company` + flag `companies.onboarded_at`.

**Tech Stack:** Node/Express, jest+pg-mem; React/Capacitor, jest+RTL.

Spec: `HASH IA\docs\superpowers\specs\2026-06-17-onboarding-wizard-design.md`.

## Estructura de archivos
- `gastos/src/onboarding/status.js` — NEW, `onboardingStatus(company, productos, config)` puro.
- `gastos/src/companies/repo.js` — MOD, agregar `getCompanyProfile`, `setOnboarded` (+ ensure columna `onboarded_at`), extender `updateCompany` con `giro`/`owner_whatsapp`.
- `gastos/src/app/router.js` — MOD, `GET/PATCH /api/app/company`.
- `gastos-app/src/gastos/api.js` — MOD, `getCompany`, `updateCompany`.
- `gastos-app/src/gastos/onboarding/OnboardingWizard.jsx` — NEW (orquesta pasos; subpasos inline en el mismo archivo).
- `gastos-app/src/gastos/GastosApp.jsx` — MOD, guarda de primer-arranque + acceso "Configurar mi negocio".

---

## Task 1: `onboarding/status.js` (puro) + test

**Files:** Create `gastos/src/onboarding/status.js`, Test `gastos/tests/onboarding/status.test.js`.

- [ ] **Step 1: Test que falla** — `gastos/tests/onboarding/status.test.js`:
```js
const { onboardingStatus } = require('../../src/onboarding/status');

test('sin datos → empieza en negocio', () => {
  const s = onboardingStatus({}, [], {});
  expect(s.onboarded).toBe(false);
  expect(s.completos.negocio).toBe(false);
  expect(s.completos.catalogo).toBe(false);
  expect(s.pasoActual).toBe('negocio');
});

test('con negocio pero sin productos → paso catalogo', () => {
  const s = onboardingStatus({ nombre: 'Pyme', owner_whatsapp: '569...' }, [], {});
  expect(s.completos.negocio).toBe(true);
  expect(s.completos.catalogo).toBe(false);
  expect(s.pasoActual).toBe('catalogo');
});

test('con negocio y productos → paso iva (confirmar resto)', () => {
  const s = onboardingStatus({ nombre: 'Pyme', owner_whatsapp: '569...' }, [{ id: 1 }], { pedido_iva_incluido: true });
  expect(s.completos.catalogo).toBe(true);
  expect(s.pasoActual).toBe('iva');
});

test('onboarded_at presente → pasoActual listo, onboarded true', () => {
  const s = onboardingStatus({ nombre: 'Pyme', owner_whatsapp: 'x', onboarded_at: '2026-06-17T00:00:00Z' }, [{ id: 1 }], {});
  expect(s.onboarded).toBe(true);
  expect(s.pasoActual).toBe('listo');
});
```

- [ ] **Step 2: Verificar FAIL** — `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\gastos" && npx jest tests/onboarding/status.test.js` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar** — `gastos/src/onboarding/status.js`:
```js
// Deriva el progreso del onboarding del negocio desde company + productos + config (pedido-config).
function _tiene(v) { return v !== undefined && v !== null && String(v).trim() !== ''; }

function onboardingStatus(company, productos, config) {
  company = company || {};
  productos = Array.isArray(productos) ? productos : [];
  config = config || {};
  const completos = {
    negocio: _tiene(company.nombre) && _tiene(company.owner_whatsapp),
    catalogo: productos.length > 0,
    iva: config.pedido_iva_incluido !== undefined && config.pedido_iva_incluido !== null,
    despacho: !!(config.delivery && Array.isArray(config.delivery.zonas) && config.delivery.zonas.length > 0),
  };
  const onboarded = _tiene(company.onboarded_at);
  let pasoActual;
  if (onboarded) pasoActual = 'listo';
  else if (!completos.negocio) pasoActual = 'negocio';
  else if (!completos.catalogo) pasoActual = 'catalogo';
  else pasoActual = 'iva';
  return { pasoActual, completos, onboarded };
}

module.exports = { onboardingStatus };
```

- [ ] **Step 4: Verificar PASS** — `npx jest tests/onboarding/status.test.js` → PASS (4).

- [ ] **Step 5: Commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git rev-parse --show-toplevel && git branch --show-current && git add gastos/src/onboarding/status.js gastos/tests/onboarding/status.test.js && git commit -m "feat(onboarding): onboardingStatus (progreso puro)"
```

---

## Task 2: Backend company profile + onboarded + endpoints

**Files:** Modify `gastos/src/companies/repo.js`, Modify `gastos/src/app/router.js`, Test `gastos/tests/onboarding/company-routes.test.js`.

- [ ] **Step 1: Test que falla** — `gastos/tests/onboarding/company-routes.test.js`:
```js
process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { hashPassword } = require('../../src/auth/password');
const { createAppRouter } = require('../../src/app/router');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}
async function seed(db) {
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const hash = await hashPassword('clave');
  await db.query("INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'J','juan',$2)", [c.rows[0].id, hash]);
}
function app(db) { const a = express(); a.use(express.json()); a.use('/api/app', createAppRouter({ db })); return a; }
async function token(a) { return (await request(a).post('/api/app/login').send({ usuario: 'juan', password: 'clave' })).body.token; }

test('GET /company devuelve perfil; PATCH actualiza nombre/giro/owner_whatsapp y marca onboarded', async () => {
  const db = await freshDb(); await seed(db); const a = app(db);
  const t = await token(a); const auth = (r) => r.set('Authorization', `Bearer ${t}`);

  const g0 = await auth(request(a).get('/api/app/company')).expect(200);
  expect(g0.body).toHaveProperty('nombre');
  expect(g0.body.onboarded_at == null).toBe(true);

  await auth(request(a).patch('/api/app/company').send({ nombre: 'Mi Pyme', giro: 'Pastelería', owner_whatsapp: '56999999999' })).expect(200);
  const g1 = await auth(request(a).get('/api/app/company')).expect(200);
  expect(g1.body.nombre).toBe('Mi Pyme');
  expect(g1.body.giro).toBe('Pastelería');
  expect(g1.body.owner_whatsapp).toBe('56999999999');

  await auth(request(a).patch('/api/app/company').send({ onboarded: true })).expect(200);
  const g2 = await auth(request(a).get('/api/app/company')).expect(200);
  expect(g2.body.onboarded_at).toBeTruthy();
});

test('GET/PATCH /company exigen token', async () => {
  const db = await freshDb(); await seed(db); const a = app(db);
  await request(a).get('/api/app/company').expect(401);
  await request(a).patch('/api/app/company').send({ nombre: 'x' }).expect(401);
});
```

- [ ] **Step 2: Verificar FAIL** — `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\gastos" && npx jest tests/onboarding/company-routes.test.js` → FAIL (404/sin función).

- [ ] **Step 3: Implementar**

(a) READ `gastos/src/companies/repo.js`. Verifica cómo se crea la columna `giro` (busca un ensure/migrate; p.ej. en `gastos/src/db/migrate.js` o un `ensureCompaniesColumns`). Agrega una función que asegure la columna `onboarded_at` SIGUIENDO ESE MISMO PATRÓN. Si el patrón es un ALTER idempotente al inicio (como `ensurePedidosTable`), crea `ensureCompanyOnboarding(db)`:
```js
const _ocReady = new WeakMap();
async function ensureCompanyOnboarding(db) {
  if (_ocReady.get(db)) return;
  try { await db.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS onboarded_at timestamptz'); } catch (e) { /* ya existe */ }
  try { await db.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS giro text'); } catch (e) { /* ya existe */ }
  _ocReady.set(db, true);
}
```
(Si `giro` ya se asegura en otro lado, deja solo `onboarded_at`. Si `ADD COLUMN IF NOT EXISTS` no lo soporta pg-mem, usa try/catch alrededor de un ALTER simple, como hace el resto del repo.)

(b) Agrega `getCompanyProfile` y `setOnboarded`, y extiende `updateCompany` para aceptar `giro` y `owner_whatsapp` (owner_whatsapp ya está en updateCompany; agrega giro vía setGiro). Implementación:
```js
async function getCompanyProfile(db, companyId) {
  await ensureCompanyOnboarding(db);
  const r = await db.query('SELECT id, nombre, rut, giro, owner_nombre, owner_whatsapp, onboarded_at, created_at FROM companies WHERE id=$1', [companyId]);
  return r.rows[0] || null;
}
async function setOnboarded(db, companyId) {
  await ensureCompanyOnboarding(db);
  await db.query('UPDATE companies SET onboarded_at=now() WHERE id=$1 AND onboarded_at IS NULL', [companyId]);
  return getCompanyProfile(db, companyId);
}
```
Exporta `getCompanyProfile`, `setOnboarded`, `ensureCompanyOnboarding` en `module.exports`. Para el `giro`: reusa `setGiro` (ya existe).

(c) READ `gastos/src/app/router.js`. Importa lo necesario de companies/repo (mira la línea `const { ... } = require('../companies/repo')` existente y agrega `getCompanyProfile, setOnboarded, updateCompany, setGiro`). Agrega los endpoints bajo el middleware de auth de empleado (junto a `/pedido-config`):
```js
  router.get('/company', async (req, res) => {
    return res.json(await getCompanyProfile(db, req.auth.companyId));
  });
  router.patch('/company', async (req, res) => {
    const b = req.body || {};
    if (b.nombre !== undefined || b.owner_whatsapp !== undefined) await updateCompany(db, req.auth.companyId, { nombre: b.nombre, owner_whatsapp: b.owner_whatsapp });
    if (b.giro !== undefined) await setGiro(db, req.auth.companyId, b.giro);
    if (b.onboarded) await setOnboarded(db, req.auth.companyId);
    return res.json(await getCompanyProfile(db, req.auth.companyId));
  });
```
(Usa los nombres reales del auth: `req.auth.companyId`. Verifica que `updateCompany` no pise campos a `undefined` — su filtro `.filter((f) => patch[f] !== undefined)` ya lo maneja.)

- [ ] **Step 4: Verificar PASS** — `npx jest tests/onboarding/company-routes.test.js` luego `npx jest` (suite backend completa) → todo verde.

- [ ] **Step 5: Commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git add gastos/src/companies/repo.js gastos/src/app/router.js gastos/tests/onboarding/company-routes.test.js && git commit -m "feat(onboarding): GET/PATCH /api/app/company + flag onboarded_at"
```

---

## Task 3: App api.js — getCompany / updateCompany

**Files:** Modify `gastos-app/src/gastos/api.js`.

- [ ] **Step 1: READ `gastos-app/src/gastos/api.js`** y agrega dentro del objeto `api` (calca el helper `req` existente):
```js
  getCompany() { return req('/api/app/company'); },
  updateCompany(patch) { return req('/api/app/company', { method: 'PATCH', body: patch }); },
```

- [ ] **Step 2: Verificar build** — `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\gastos-app" && npm run build` → OK.

- [ ] **Step 3: Commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git add gastos-app/src/gastos/api.js && git commit -m "feat(onboarding-app): api getCompany/updateCompany"
```

---

## Task 4: OnboardingWizard.jsx + subpasos + test

**Files:** Create `gastos-app/src/gastos/onboarding/OnboardingWizard.jsx`, Test `gastos-app/tests/gastos/OnboardingWizard.test.jsx`.

- [ ] **Step 1: Test que falla** — `gastos-app/tests/gastos/OnboardingWizard.test.jsx`. Mockea `api` y `ProductosView` (para no arrastrar su árbol):
```jsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('../../src/gastos/ProductosView.jsx', () => ({ __esModule: true, default: () => <div>productos-view-mock</div> }));
jest.mock('../../src/gastos/api', () => ({ api: {
  getCompany: jest.fn(), updateCompany: jest.fn(), listProducts: jest.fn(),
  getPedidoConfig: jest.fn(), setPedidoConfig: jest.fn(),
} }));
import { api } from '../../src/gastos/api';
import OnboardingWizard from '../../src/gastos/onboarding/OnboardingWizard.jsx';

beforeEach(() => {
  jest.clearAllMocks();
  api.getCompany.mockResolvedValue({ nombre: '', owner_whatsapp: '', giro: '', onboarded_at: null });
  api.updateCompany.mockResolvedValue({});
  api.listProducts.mockResolvedValue([]);
  api.getPedidoConfig.mockResolvedValue({ pedido_iva_incluido: true });
  api.setPedidoConfig.mockResolvedValue({});
});

test('paso 1 guarda el negocio con updateCompany', async () => {
  render(<OnboardingWizard onDone={() => {}} onSkip={() => {}} />);
  await screen.findByText(/Tu negocio/i);
  fireEvent.change(screen.getByPlaceholderText(/nombre de tu negocio/i), { target: { value: 'Mi Pyme' } });
  fireEvent.change(screen.getByPlaceholderText(/WhatsApp/i), { target: { value: '56999999999' } });
  fireEvent.click(screen.getByText(/Siguiente/i));
  await waitFor(() => expect(api.updateCompany).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Mi Pyme', owner_whatsapp: '56999999999' })));
});

test('botón Saltar dispara onSkip', async () => {
  const onSkip = jest.fn();
  render(<OnboardingWizard onDone={() => {}} onSkip={onSkip} />);
  await screen.findByText(/Tu negocio/i);
  fireEvent.click(screen.getByText(/Saltar por ahora/i));
  expect(onSkip).toHaveBeenCalled();
});
```

- [ ] **Step 2: Verificar FAIL** — `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\gastos-app" && npx jest tests/gastos/OnboardingWizard.test.jsx` → FAIL.

- [ ] **Step 3: Implementar** — `gastos-app/src/gastos/onboarding/OnboardingWizard.jsx`. Props: `onDone()` (al terminar/marcar onboarded), `onSkip()`, `onIrAlChat()`, `onCrearPedido()`. Carga inicial `getCompany`+`listProducts`+`getPedidoConfig`. Pasos por índice 0..4. Cada paso guarda al avanzar. Reusa `<ProductosView/>` en el paso catálogo. Código completo:
```jsx
import React, { useEffect, useState } from 'react';
import { api } from '../api';
import ProductosView from '../ProductosView.jsx';

const GOLD = '#C9A24B';
const PASOS = ['Tu negocio', 'Tu catálogo', 'IVA', 'Despacho', '¡Listo!'];

export default function OnboardingWizard({ onDone, onSkip, onIrAlChat, onCrearPedido }) {
  const [i, setI] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState('');
  const [nombre, setNombre] = useState('');
  const [giro, setGiro] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [nProductos, setNProductos] = useState(0);
  const [ivaIncluido, setIvaIncluido] = useState(true);
  const [haceDelivery, setHaceDelivery] = useState(false);
  const [costoEnvio, setCostoEnvio] = useState('');
  const [gratisDesde, setGratisDesde] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const c = await api.getCompany();
        setNombre(c?.nombre || ''); setGiro(c?.giro || ''); setWhatsapp(c?.owner_whatsapp || '');
        const cfg = await api.getPedidoConfig();
        if (cfg && cfg.pedido_iva_incluido != null) setIvaIncluido(!!cfg.pedido_iva_incluido);
        const prods = await api.listProducts(true);
        setNProductos((prods || []).length);
      } catch (e) { /* sigue con defaults */ }
      setCargando(false);
    })();
  }, []);

  async function guardarNegocio() {
    setErr('');
    if (!nombre.trim()) { setErr('Pon el nombre de tu negocio'); return false; }
    try { await api.updateCompany({ nombre: nombre.trim(), giro: giro.trim(), owner_whatsapp: whatsapp.trim() }); return true; }
    catch (e) { setErr('No pude guardar, reintenta'); return false; }
  }
  async function guardarIva() { try { await api.setPedidoConfig({ pedido_iva_incluido: ivaIncluido }); return true; } catch { setErr('No pude guardar el IVA'); return false; } }
  async function guardarDespacho() {
    try {
      const delivery = haceDelivery
        ? { zonas: [{ id: 'general', nombre: 'Despacho', costo: Math.max(0, Math.round(Number(costoEnvio) || 0)), comunas: [] }], gratis_desde: gratisDesde === '' ? null : Math.max(0, Math.round(Number(gratisDesde) || 0)) }
        : { zonas: [], gratis_desde: null };
      await api.setPedidoConfig({ delivery });
      return true;
    } catch { setErr('No pude guardar el despacho'); return false; }
  }

  async function siguiente() {
    if (i === 0) { if (!(await guardarNegocio())) return; }
    if (i === 1) { try { setNProductos((await api.listProducts(true) || []).length); } catch {} }
    if (i === 2) { if (!(await guardarIva())) return; }
    if (i === 3) { if (!(await guardarDespacho())) return; }
    setI((x) => Math.min(PASOS.length - 1, x + 1));
  }
  async function terminar() { try { await api.updateCompany({ onboarded: true }); } catch {} onDone && onDone(); }

  if (cargando) return <div style={{ padding: 24, color: '#cfeaf3' }}>Cargando…</div>;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0f', color: '#e7eef2', overflowY: 'auto', zIndex: 50, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Paso {i + 1} de {PASOS.length} · {PASOS[i]}</div>
        <button onClick={() => onSkip && onSkip()} style={{ background: 'transparent', color: '#9aa', border: 0 }}>Saltar por ahora</button>
      </div>
      <div style={{ height: 4, background: '#ffffff14', borderRadius: 4, margin: '10px 0 18px' }}>
        <div style={{ width: `${((i + 1) / PASOS.length) * 100}%`, height: '100%', background: GOLD, borderRadius: 4 }} />
      </div>

      {i === 0 && (
        <div>
          <h2 style={{ color: GOLD }}>Tu negocio</h2>
          <input placeholder="Nombre de tu negocio" value={nombre} onChange={(e) => setNombre(e.target.value)} style={inp} />
          <input placeholder="Rubro (ej. pastelería)" value={giro} onChange={(e) => setGiro(e.target.value)} style={inp} />
          <input placeholder="WhatsApp del dueño (569…)" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} style={inp} />
        </div>
      )}
      {i === 1 && (
        <div>
          <h2 style={{ color: GOLD }}>Tu catálogo</h2>
          <p style={{ fontSize: 13, opacity: 0.75 }}>Cárgalos por foto, por voz con KALY o a mano. Llevas {nProductos}.</p>
          <ProductosView />
        </div>
      )}
      {i === 2 && (
        <div>
          <h2 style={{ color: GOLD }}>IVA</h2>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
            <input type="checkbox" checked={ivaIncluido} onChange={(e) => setIvaIncluido(e.target.checked)} />
            Mis precios YA incluyen IVA
          </label>
          <p style={{ fontSize: 12, opacity: 0.6 }}>Si lo desmarcas, al pedido se le agrega 19%.</p>
        </div>
      )}
      {i === 3 && (
        <div>
          <h2 style={{ color: GOLD }}>Despacho</h2>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" checked={haceDelivery} onChange={(e) => setHaceDelivery(e.target.checked)} /> Hago delivery
          </label>
          {haceDelivery && (
            <div style={{ marginTop: 10 }}>
              <input placeholder="Costo del despacho" type="number" value={costoEnvio} onChange={(e) => setCostoEnvio(e.target.value)} style={inp} />
              <input placeholder="Gratis desde $ (opcional)" type="number" value={gratisDesde} onChange={(e) => setGratisDesde(e.target.value)} style={inp} />
              <p style={{ fontSize: 12, opacity: 0.6 }}>Las zonas por comuna se configuran después en el panel.</p>
            </div>
          )}
        </div>
      )}
      {i === 4 && (
        <div>
          <h2 style={{ color: GOLD }}>¡Listo!</h2>
          <p>Tienes {nProductos} producto(s). IVA {ivaIncluido ? 'incluido' : 'se agrega 19%'}. {haceDelivery ? `Despacho $${Math.round(Number(costoEnvio) || 0)}` : 'Sin despacho'}.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={() => { terminar(); onIrAlChat && onIrAlChat(); }} style={btnGold}>Ir al Chat</button>
            <button onClick={() => { terminar(); onCrearPedido && onCrearPedido(); }} style={btnOutline}>Crear pedido de prueba</button>
          </div>
        </div>
      )}

      {err ? <div style={{ color: '#ff6b6b', fontSize: 13, marginTop: 10 }}>{err}</div> : null}

      {i < 4 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22 }}>
          <button onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} style={{ ...btnOutline, opacity: i === 0 ? 0.4 : 1 }}>Atrás</button>
          <button onClick={siguiente} style={btnGold}>Siguiente</button>
        </div>
      )}
    </div>
  );
}

const inp = { width: '100%', padding: 11, borderRadius: 8, marginTop: 10, background: '#ffffff10', border: '1px solid #ffffff22', color: '#e7eef2' };
const btnGold = { background: GOLD, color: '#000', fontWeight: 800, borderRadius: 10, padding: '11px 18px', border: 0 };
const btnOutline = { background: 'transparent', color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 10, padding: '11px 18px' };
```

- [ ] **Step 4: Verificar PASS** — `npx jest tests/gastos/OnboardingWizard.test.jsx` luego `npm run build` → verde + build OK.

- [ ] **Step 5: Commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git add gastos-app/src/gastos/onboarding/OnboardingWizard.jsx gastos-app/tests/gastos/OnboardingWizard.test.jsx && git commit -m "feat(onboarding-app): OnboardingWizard (5 pasos, reusa catálogo/pedido-config)"
```

---

## Task 5: Montaje en GastosApp (guarda primer-arranque + retomar)

**Files:** Modify `gastos-app/src/gastos/GastosApp.jsx`.

- [ ] **Step 1: READ `gastos-app/src/gastos/GastosApp.jsx`** para ver cómo maneja el estado de sesión/tabs y dónde montar. Implementa:
  - Al montar (con sesión iniciada), llamar `api.getCompany()`; si `onboarded_at` es null y el usuario no ha saltado en esta sesión (`useState mostrarOnboarding`), renderizar `<OnboardingWizard onDone={...} onSkip={...} onIrAlChat={...} onCrearPedido={...} />` por encima de la app.
  - `onSkip`: `setMostrarOnboarding(false)` (no marca onboarded; reaparece el acceso para retomar).
  - `onDone`: `setMostrarOnboarding(false)` (ya quedó onboarded en el backend).
  - `onIrAlChat`: navegar a la pestaña Chat. `onCrearPedido`: navegar a Chat y abrir PedidoBuilder (usa el mecanismo existente de ChatView "Crear pedido"; si no hay un gancho directo, deja `onCrearPedido` = ir a Chat).
  - Si `onboarded_at` no es null O el usuario saltó: mostrar en algún lugar visible (p.ej. junto al header o en Ajustes) un botón **"Configurar mi negocio"** que hace `setMostrarOnboarding(true)` para retomar.
  Mantén el patrón de estado y navegación YA EXISTENTE en GastosApp (no inventes un router nuevo). Importa `OnboardingWizard` desde `./onboarding/OnboardingWizard.jsx`.

- [ ] **Step 2: Verificar** — `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\gastos-app" && npx jest && npm run build` → suite verde + build OK. (Si algún test de GastosApp existente se rompe por el `getCompany` nuevo, mockéalo en ese test o haz el fetch tolerante a fallos para no romper render.)

- [ ] **Step 3: Commit**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA" && git add gastos-app/src/gastos/GastosApp.jsx && git commit -m "feat(onboarding-app): guarda de primer-arranque + retomar en GastosApp"
```

---

## Task 6: Verificación final (suites + build)

- [ ] **Step 1: Backend** — `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\gastos" && npx jest` → PASS (incluye onboarding/status + company-routes).
- [ ] **Step 2: App** — `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\gastos-app" && npx jest` → PASS (incluye OnboardingWizard).
- [ ] **Step 3: Build** — `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\gastos-app" && npm run build` → OK.
(Sin commit; verificación.)

---

## Notas de despliegue (con el usuario después)
- Backend: `HASH IA\deploy-gastos-wt.js` (la columna `onboarded_at`/`giro` se crea sola idempotente al arrancar). App: rebuild APK (→ v3.8/versionCode 38) + `upload-apk-wt.js`.

## Self-review (hecho)
- **Cobertura del spec:** disparo por `onboarded_at` null + status (T1) ✅; pasos negocio/catálogo/IVA/despacho/listo (T4) ✅; backend company profile + onboarded + endpoints (T2) ✅; api app (T3) ✅; montaje guarda primer-arranque + retomar + saltar (T5) ✅; reusa catálogo (ProductosView)/pedido-config/comunas ✅; tests status+endpoint+wizard (T1,T2,T4) ✅; manejo de errores por paso (T4 setErr) ✅; despacho simple plano, zonas avanzadas fuera (T4) ✅; CTAs listo (T4) ✅.
- **Sin placeholders:** código completo en status.js, repo, endpoints, api, wizard. T5 describe el montaje concreto adaptándose al GastosApp real (se le pide READ + seguir el patrón existente, con código de comportamiento explícito).
- **Consistencia:** `onboardingStatus(company, productos, config)` (T1); `getCompanyProfile`/`setOnboarded` (T2) → `GET/PATCH /api/app/company` (T2) → `api.getCompany/updateCompany` (T3) → consumidos por el wizard (T4); `updateCompany({onboarded:true})` marca onboarded; `setPedidoConfig({pedido_iva_incluido})` y `{delivery:{zonas,gratis_desde}}` coinciden con el repo existente.
