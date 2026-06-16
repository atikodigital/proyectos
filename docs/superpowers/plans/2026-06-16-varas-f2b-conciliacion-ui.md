# VARAS — Fase 2b: Conciliación bancaria (UI) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar el informe de conciliación de F2a en la app (sub-pestaña Conciliación de VARAS · Contabilidad): tarjeta SCA vs SBA + badge de convergencia, partidas conciliatorias por tipo, asientos sugeridos con botón "Crear asiento" (que el dueño confirma), y excepciones; y en el panel web mostrar el último workpaper guardado.

**Architecture:** F2a ya dejó `/api/app/match/cartola` devolviendo el informe `{lineas, sca, sba, cuadrado, matched, partidas, suggested, exceptions, fuente}` y `/api/app/match/asiento/confirmar`. Esta fase reescribe la UI que lo consume: `MatchView.jsx` (que es la sub-pestaña "Conciliación" dentro de `ContabilidadView`) pasa de mostrar conciliadas/sugeridas/pagosMasivos/sinMatch al informe nuevo. En el panel se agrega una vista de solo-lectura del último informe (vía un endpoint `/api/panel/contabilidad/conciliacion` que lee `match/repo.getUltima`). Sin lógica de conciliación nueva — solo presentación + el botón confirmar.

**Tech Stack:** App React 18 + Vite + Jest/RTL (tests en `gastos-app/tests/`). Backend panel: Express + supertest + pg-mem. Panel estático: `lib.js` (UMD, jest node) + `index.html`.

**Worktree:** `C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112` — rama `claude/dazzling-driscoll-78a112`. App: `cd gastos-app && npx jest` / `npm run build`. Backend: `cd gastos && npx jest`. Antes de commitear: `git branch --show-current` == `claude/dazzling-driscoll-78a112` (NO main).

**Contrato del informe (de F2a):**
```
{ lineas:[...], saldoInicial, saldoFinalCartola, bancoContable, sca, sba, cuadrado, brecha,
  matched:[{expenseId,score,lineaIdx}], partidas:[{tipo,glosa,monto,fecha}],
  suggested:[{id,descripcion,tipo,monto,fecha,cuentaClaveDebe,cuentaClaveHaber}],
  exceptions:[{glosa,monto,motivo}], fuente:'ia'|'deterministico' }
```

---

## File Structure

**App:**
- Modify `gastos-app/src/gastos/api.js` — add `matchConfirmarAsiento(asiento)`.
- Modify `gastos-app/src/gastos/MatchView.jsx` — render the new informe (SCA/SBA card, partidas, suggested+confirm, exceptions). Keep the cartola upload.
- Test `gastos-app/tests/gastos/MatchView.test.jsx`.

**Backend (panel):**
- Modify `gastos/src/panel/router.js` — `GET /contabilidad/conciliacion` → last workpaper (`matchRepo.getUltima`).
- Test `gastos/tests/panel/conciliacion-router.test.js`.

**Panel estático:**
- Modify `gastos/public/panel/lib.js` — `conciliacionHtml(informe)` (puro, XSS-safe).
- Modify `gastos/public/panel/index.html` — sub-botón "Conciliación" en la sub-nav de Contabilidad + render.
- Test `gastos/tests/panel/conciliacion-lib.test.js`.

**Helpers de presentación (etiquetas de tipo de partida), compartidos conceptualmente:**
- `nota_debito`→"Cargo del banco (comisión/impuesto)", `nota_credito`→"Abono del banco", `deposito_transito`→"Depósito en tránsito", `cheque_no_cobrado`→"Cheque girado no cobrado", `error_empresa_mas`/`error_empresa_menos`→"Error de registro", `error_banco_mas`/`error_banco_menos`→"Error del banco".

---

## Task 1: App — `matchConfirmarAsiento` en api.js

**Files:**
- Modify: `gastos-app/src/gastos/api.js`

- [ ] **Step 1: Agregar el método**

En el objeto `api` de `gastos-app/src/gastos/api.js`, junto a `matchCartola`/`matchConfirmar`, agregar:

```javascript
  matchConfirmarAsiento(asiento) { return req('/api/app/match/asiento/confirmar', { method: 'POST', body: asiento }); },
```

(`matchCartola` ya existe y ya devuelve el informe nuevo — no cambiarlo.)

- [ ] **Step 2: Commit** (se valida con el test de la Task 2)

```bash
git add gastos-app/src/gastos/api.js
git commit -m "feat(varas-f2b): metodo matchConfirmarAsiento en api.js"
```

---

## Task 2: App — reescribir `MatchView.jsx` al informe nuevo

**Files:**
- Modify: `gastos-app/src/gastos/MatchView.jsx`
- Test: `gastos-app/tests/gastos/MatchView.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// gastos-app/tests/gastos/MatchView.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MatchView from '../../src/gastos/MatchView.jsx';
import { api } from '../../src/gastos/api';

jest.mock('../../src/gastos/api');
// EvidenceIntake hace captura nativa; lo simplificamos para test.
jest.mock('../../src/components/EvidenceIntake.jsx', () => ({ onChange }) => (
  <button onClick={() => onChange([{ imageBase64: 'x', imageMimeType: 'image/jpeg' }])}>subir-cartola</button>
));

const informe = {
  lineas: [{ fecha: '2026-06-15', glosa: 'COMISION', monto: 1900 }],
  sca: 86200, sba: 86200, cuadrado: true, brecha: 0,
  matched: [{ expenseId: 'e1', score: 100 }],
  partidas: [{ tipo: 'nota_debito', glosa: 'Comisión mantención', monto: 1900, fecha: '2026-06-15' }],
  suggested: [{ id: 'sug1', descripcion: 'Comisión mantención', tipo: 'nota_debito', monto: 1900, fecha: '2026-06-15', cuentaClaveDebe: 'gastos_financieros', cuentaClaveHaber: 'banco' }],
  exceptions: [],
  fuente: 'ia',
};

beforeEach(() => {
  api.matchCartola = jest.fn().mockResolvedValue(informe);
  api.matchConfirmarAsiento = jest.fn().mockResolvedValue({ ok: true, asientoId: 'a1' });
});

test('al subir cartola muestra SCA/SBA y badge cuadrado', async () => {
  render(<MatchView />);
  fireEvent.click(screen.getByText('subir-cartola'));
  await waitFor(() => expect(api.matchCartola).toHaveBeenCalled());
  expect(await screen.findByText(/cuadrado/i)).toBeInTheDocument();
});

test('muestra la partida y permite crear el asiento sugerido', async () => {
  render(<MatchView />);
  fireEvent.click(screen.getByText('subir-cartola'));
  expect(await screen.findByText(/Comisión mantención/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /crear asiento/i }));
  await waitFor(() => expect(api.matchConfirmarAsiento).toHaveBeenCalledWith(expect.objectContaining({ id: 'sug1' })));
  expect(await screen.findByText(/asiento creado|✓/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos-app && npx jest tests/gastos/MatchView.test.jsx`
Expected: FAIL (el MatchView viejo no muestra SCA/cuadrado ni botón "Crear asiento").

- [ ] **Step 3: Write implementation** (reemplazo COMPLETO de `gastos-app/src/gastos/MatchView.jsx`)

```jsx
import { useState } from 'react';
import { api } from './api';
import EvidenceIntake from '../components/EvidenceIntake.jsx';

function clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }
function fechaCorta(v) { if (!v) return ''; const s = String(v); return s.length >= 10 ? s.slice(0, 10) : s; }

const TIPO_LABEL = {
  nota_debito: 'Cargo del banco (comisión/impuesto)',
  nota_credito: 'Abono del banco no registrado',
  deposito_transito: 'Depósito en tránsito',
  cheque_no_cobrado: 'Cheque girado no cobrado',
  error_empresa_mas: 'Error de registro (empresa)',
  error_empresa_menos: 'Error de registro (empresa)',
  error_banco_mas: 'Error del banco',
  error_banco_menos: 'Error del banco',
};

export default function MatchView() {
  const [busy, setBusy] = useState(false);
  const [inf, setInf] = useState(null);
  const [err, setErr] = useState('');
  const [hechos, setHechos] = useState(() => new Set());

  async function onChange(items) {
    const ev = items && items[0];
    if (!ev || !ev.imageBase64) return;
    setBusy(true); setErr(''); setInf(null); setHechos(new Set());
    try {
      const r = await api.matchCartola(ev.imageBase64, ev.imageMimeType || 'image/jpeg');
      setInf(r);
    } catch (_e) {
      setErr('No pude leer la cartola. Prueba con una foto más nítida o el PDF del banco.');
    } finally { setBusy(false); }
  }

  async function crearAsiento(s) {
    try {
      await api.matchConfirmarAsiento(s);
      setHechos((prev) => new Set([...prev, s.id]));
    } catch (_e) { /* noop */ }
  }

  return (
    <div className="h-full flex flex-col p-4 gap-2 overflow-y-auto">
      <h2 className="text-xl font-black shrink-0" style={{ color: '#b91c1c' }}>Conciliación</h2>
      <p className="text-xs opacity-70 shrink-0">Sube tu <b>cartola bancaria</b>: VARAS cuadra tu banco contable contra el banco real y te propone los ajustes que faltan.</p>

      <div className="shrink-0">
        <EvidenceIntake maxEvidence={1} value={[]} onChange={onChange} showNativeCapture />
      </div>
      {busy ? <div className="text-sm font-bold py-2" style={{ color: '#b91c1c' }}>Analizando la cartola…</div> : null}
      {err ? <div className="text-sm" style={{ color: '#ff8a8a' }}>{err}</div> : null}

      {inf ? (
        <div className="grid gap-3 pt-1">
          {/* Tarjeta SCA vs SBA */}
          <div className="rounded-2xl border p-3" style={{ borderColor: inf.cuadrado ? '#1f7a3f55' : '#b91c1c55' }}>
            <div className={`text-center text-xs font-black rounded-lg py-1 mb-2 ${inf.cuadrado ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'}`}>
              {inf.cuadrado ? '✓ Banco cuadrado' : '⚠ Diferencia de ' + clp(inf.brecha)}
            </div>
            <div className="grid grid-cols-2 gap-2 text-center text-sm">
              <div><div className="text-[10px] font-bold opacity-60">Saldo contable (ajustado)</div><div className="font-black">{clp(inf.sca)}</div></div>
              <div><div className="text-[10px] font-bold opacity-60">Saldo banco (ajustado)</div><div className="font-black">{clp(inf.sba)}</div></div>
            </div>
            <div className="text-[10px] opacity-50 text-center mt-1">{inf.matched ? inf.matched.length : 0} movimientos cuadrados · análisis {inf.fuente === 'ia' ? 'con IA' : 'automático'}</div>
          </div>

          {/* Asientos sugeridos */}
          {(inf.suggested || []).length ? (
            <div className="grid gap-2">
              <div className="text-xs font-black opacity-70">Ajustes que propongo</div>
              {inf.suggested.map((s) => {
                const done = hechos.has(s.id);
                return (
                  <div key={s.id} className="rounded-xl border p-3 text-sm" style={{ borderColor: '#C9A24B55' }}>
                    <div className="flex justify-between gap-2">
                      <span className="font-bold truncate">{s.descripcion}</span>
                      <span className="font-black">{clp(s.monto)}</span>
                    </div>
                    <div className="text-[11px] opacity-60">{TIPO_LABEL[s.tipo] || 'Ajuste'} · {fechaCorta(s.fecha)}</div>
                    {done ? <div className="text-xs font-bold mt-1" style={{ color: '#1f7a3f' }}>✓ Asiento creado</div>
                          : <button onClick={() => crearAsiento(s)} className="mt-2 rounded-lg text-black font-black text-xs px-3 py-1.5" style={{ background: '#C9A24B' }}>Crear asiento</button>}
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Partidas en tránsito / informativas (las que no son sugerencia con asiento) */}
          {(inf.partidas || []).filter((p) => p.tipo === 'deposito_transito' || p.tipo === 'cheque_no_cobrado').length ? (
            <div className="grid gap-1">
              <div className="text-xs font-black opacity-70">En tránsito</div>
              {inf.partidas.filter((p) => p.tipo === 'deposito_transito' || p.tipo === 'cheque_no_cobrado').map((p, i) => (
                <div key={i} className="flex justify-between rounded-lg border px-3 py-2 text-xs">
                  <span className="truncate">{TIPO_LABEL[p.tipo]} · {p.glosa || ''}</span>
                  <span className="font-bold">{clp(p.monto)}</span>
                </div>
              ))}
            </div>
          ) : null}

          {/* Excepciones */}
          {(inf.exceptions || []).length ? (
            <div className="grid gap-1">
              <div className="text-xs font-black" style={{ color: '#b91c1c' }}>Requiere tu revisión</div>
              {inf.exceptions.map((e, i) => (
                <div key={i} className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: '#b91c1c55' }}>
                  {e.glosa || 'Movimiento'} · {clp(e.monto)}{e.motivo ? ' — ' + e.motivo : ''}
                </div>
              ))}
            </div>
          ) : null}

          {(inf.suggested || []).length + (inf.partidas || []).length + (inf.exceptions || []).length === 0 ? (
            <div className="opacity-60 text-sm">Todo cuadra: no hay diferencias que ajustar. 🎉</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos-app && npx jest tests/gastos/MatchView.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos-app/src/gastos/MatchView.jsx gastos-app/tests/gastos/MatchView.test.jsx
git commit -m "feat(varas-f2b): MatchView muestra informe SCA/SBA + asientos sugeridos"
```

---

## Task 3: Panel — endpoint último workpaper

**Files:**
- Modify: `gastos/src/panel/router.js`
- Test: `gastos/tests/panel/conciliacion-router.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/panel/conciliacion-router.test.js
const request = require('supertest');
const express = require('express');
require('express-async-errors');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { signToken } = require('../../src/auth/jwt');
const matchRepo = require('../../src/match/repo');
const { createPanelRouter } = require('../../src/panel/router');

const COMPANY = '11111111-1111-1111-1111-111111111111';
const USER = '33333333-3333-3333-3333-333333333333';

async function makeApp() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await matchRepo.guardarConciliacion(db, COMPANY, 'bancaria', { saldoFinalCartola: 88100, bancoContable: 90000, sca: 88100, sba: 88100, cuadrado: true, partidas: [{ tipo: 'nota_debito', monto: 1900 }], suggested: [], exceptions: [] });
  const app = express();
  app.use(express.json());
  app.use('/api/panel', createPanelRouter({ db }));
  const token = signToken({ kind: 'user', companyId: COMPANY, userId: USER, rol: 'owner' });
  return { app, token };
}

test('GET /api/panel/contabilidad/conciliacion devuelve el último workpaper', async () => {
  const { app, token } = await makeApp();
  const r = await request(app).get('/api/panel/contabilidad/conciliacion').set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(200);
  expect(r.body.cuadrado).toBe(true);
  expect(Number(r.body.sca)).toBe(88100);
});

test('sin conciliación previa -> 200 con null', async () => {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg(); const db = new pg.Pool(); await migrate(db);
  const app = express(); app.use(express.json()); app.use('/api/panel', createPanelRouter({ db }));
  const token = signToken({ kind: 'user', companyId: COMPANY, userId: USER, rol: 'owner' });
  const r = await request(app).get('/api/panel/contabilidad/conciliacion').set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(200);
  expect(r.body.conciliacion).toBeNull();
});

test('sin token -> 401', async () => {
  const { app } = await makeApp();
  const r = await request(app).get('/api/panel/contabilidad/conciliacion');
  expect(r.status).toBe(401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/panel/conciliacion-router.test.js`
Expected: FAIL — 404.

- [ ] **Step 3: Write minimal implementation**

En `gastos/src/panel/router.js`: importar arriba `const matchRepo = require('../match/repo');`. Después de las rutas `/contabilidad/*` existentes (y dentro de la región protegida `requireAuth, requireKind('user')`), agregar:

```javascript
  router.get('/contabilidad/conciliacion', async (req, res) => {
    const u = await matchRepo.getUltima(db, req.auth.companyId, 'bancaria');
    if (!u) return res.json({ conciliacion: null });
    res.json(u);
  });
```

(`getUltima` ya expone `partidas` como array y devuelve la fila con `sca/sba/cuadrado` + el workpaper.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/panel/conciliacion-router.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/src/panel/router.js gastos/tests/panel/conciliacion-router.test.js
git commit -m "feat(varas-f2b): endpoint panel ultimo workpaper de conciliacion"
```

---

## Task 4: Panel — helper `conciliacionHtml` en lib.js

**Files:**
- Modify: `gastos/public/panel/lib.js`
- Test: `gastos/tests/panel/conciliacion-lib.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/panel/conciliacion-lib.test.js
const lib = require('../../public/panel/lib');

test('conciliacionHtml muestra SCA/SBA, badge y partidas', () => {
  const html = lib.conciliacionHtml({
    sca: 88100, sba: 88100, cuadrado: true,
    partidas: [{ tipo: 'nota_debito', glosa: 'Comisión', monto: 1900 }],
  });
  expect(html.toLowerCase()).toContain('cuadrado');
  expect(html).toContain('Comisión');
});

test('conciliacionHtml con null dice que no hay conciliación', () => {
  const html = lib.conciliacionHtml(null);
  expect(html.toLowerCase()).toContain('sin conciliaci');
});

test('conciliacionHtml escapa HTML (anti-XSS)', () => {
  const html = lib.conciliacionHtml({ sca: 0, sba: 0, cuadrado: false, partidas: [{ tipo: 'x', glosa: '<script>alert(1)</script>', monto: 0 }] });
  expect(html).not.toContain('<script>alert(1)</script>');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/panel/conciliacion-lib.test.js`
Expected: FAIL — `lib.conciliacionHtml is not a function`.

- [ ] **Step 3: Write minimal implementation**

En `gastos/public/panel/lib.js`, agregar la función dentro del factory (reusa `fmtClp`/`escapeHtml`) y exponerla en el `return {...}`:

```javascript
  function conciliacionHtml(inf) {
    if (!inf) return '<p class="muted" style="padding:8px">Sin conciliación registrada todavía. Sube una cartola desde la app.</p>';
    var badge = inf.cuadrado ? '<span class="badge-ok">✓ Cuadrado</span>' : '<span class="badge-no">⚠ Descuadrado</span>';
    var partidas = (inf.partidas || []).map(function (p) {
      return '<tr><td>' + escapeHtml(p.tipo) + '</td><td>' + escapeHtml(p.glosa) + '</td><td class="num">' + fmtClp(p.monto) + '</td></tr>';
    }).join('');
    return badge
      + '<div class="flujo-tot">Saldo contable: <b>' + fmtClp(inf.sca) + '</b> · Saldo banco: <b>' + fmtClp(inf.sba) + '</b></div>'
      + '<table class="tbl"><thead><tr><th>Tipo</th><th>Glosa</th><th class="num">Monto</th></tr></thead><tbody>'
      + (partidas || '<tr><td colspan="3">Sin partidas conciliatorias.</td></tr>') + '</tbody></table>';
  }
```

Agregar `conciliacionHtml: conciliacionHtml` al objeto que retorna el factory (junto a `diarioTableHtml`, etc.).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/panel/conciliacion-lib.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add gastos/public/panel/lib.js gastos/tests/panel/conciliacion-lib.test.js
git commit -m "feat(varas-f2b): helper conciliacionHtml en panel lib.js"
```

---

## Task 5: Panel — sub-botón "Conciliación" en index.html

**Files:**
- Modify: `gastos/public/panel/index.html`
- Test: (regresión) `gastos/tests/panel/conciliacion-lib.test.js`

- [ ] **Step 1: Agregar el sub-botón y el cableado**

En `gastos/public/panel/index.html`, en la sub-nav de Contabilidad (los botones `.csub` con `data-libro`), agregar un botón más:
```html
<button class="tab csub" data-libro="conciliacion">Conciliación</button>
```
En la función `loadContabilidad()` (que hace el `if (libroActual === 'diario') ... else if ...`), agregar una rama:
```javascript
} else if (libroActual === 'conciliacion') {
  res = await apiFetch('/contabilidad/conciliacion');
  data = await res.json();
  $('cContenido').innerHTML = PanelLib.conciliacionHtml(data && data.conciliacion === null ? null : data);
}
```
(Reusa el mismo patrón `res = await apiFetch(...); data = await res.json();` que las otras ramas. OJO: la conciliación NO usa filtro de período — ignora `cPeriodo`. El botón Excel no aplica a conciliación; al estar en esa sub-pestaña, puedes ocultar `cExcelBtn` o dejarlo sin efecto — para mínima fricción, déjalo visible pero NO agregues handler especial; es aceptable que no haga nada útil ahí. Si es trivial, oculta `cExcelBtn` cuando `libroActual==='conciliacion'`.)

- [ ] **Step 2: Assert de regresión**

Agregar a `gastos/tests/panel/conciliacion-lib.test.js`:
```javascript
const fs = require('fs');
const path = require('path');
test('index.html declara el sub-botón Conciliación', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../public/panel/index.html'), 'utf8');
  expect(html).toContain('data-libro="conciliacion"');
});
```

- [ ] **Step 3: Run tests**

Run: `cd gastos && npx jest tests/panel/`
Expected: PASS (todos los de panel).

- [ ] **Step 4: Commit**

```bash
git add gastos/public/panel/index.html gastos/tests/panel/conciliacion-lib.test.js
git commit -m "feat(varas-f2b): sub-pestaña Conciliacion en el panel"
```

---

## Task 6: Cierre F2b — suites + build

- [ ] **Step 1: Backend completo**

Run: `cd gastos && npx jest`
Expected: PASS — todo verde.

- [ ] **Step 2: App completa + build**

Run: `cd gastos-app && npx jest && npm run build`
Expected: PASS + build OK.

- [ ] **Step 3: Commit final (si quedó algo)**

```bash
git add -A && git commit -m "test(varas-f2b): suites verdes F2b" || echo "nada que commitear"
```

---

## Notas de cierre F2b

- Con F2b, la sub-pestaña **Conciliación** de la app ya consume el contrato nuevo de `/match/cartola` → **F2 (a+b) queda listo para desplegar juntos**: `node deploy-gastos-wt.js` (backend+panel) + rebuild APK (bump versionCode + APP_VERSION) + `node upload-apk-wt.js`.
- Verificación en teléfono: subir una cartola real → ver SCA/SBA + asientos sugeridos → "Crear asiento" → revisar en Libro Diario que aparece el ajuste.
- **F3 (SII):** reusa este pipeline con el libro de compras/ventas SII (eje tributario / IVA).
- ⚠️ José edita KALY en paralelo en esta rama.
