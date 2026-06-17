# VARAS F5b — Asientos manuales (UI) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UI para crear asientos manuales (form con filas cuenta·debe·haber + indicador de cuadre en vivo) y anularlos desde el Libro Diario, en panel y app, sobre los endpoints de F5a.

**Architecture:** F5a ya expone `GET /cuentas`, `POST /asientos/manual`, `POST /asientos/:id/anular` en app y panel. App: un componente `AsientoManual.jsx` (form con cuadre en vivo) montado como nueva pestaña "Manual" en `ContabilidadView`, + botón Anular en el componente `Diario`. Panel: una sub-vista "Manual" en la sub-nav de Contabilidad (form en `index.html`) + botón Anular en `diarioTableHtml`. Un helper PURO `cuadreManual(lineas)` en `lib.js` (testeable) calcula Σdebe/Σhaber/cuadrado.

**Tech Stack:** App React + Jest/RTL (tests en `gastos-app/tests/`); panel lib.js (jest node) + index.html. Sin deps nuevas.

**Repo:** `C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA` (canónico, rama `master`). App: `cd "...\HASH IA\gastos-app" && npx jest` / `npm run build`. Backend (panel lib): `cd "...\HASH IA\gastos" && npx jest tests/panel`. Commit `git -c user.name="José Antonio Olguín" -c user.email="atikodigital@gmail.com"`. Confirmar `rev-parse --show-toplevel` ends in `HASH IA`.

**Depende de F5a:** endpoints `/cuentas`, `/asientos/manual`, `/asientos/:id/anular` (app y panel). De F1-UI: `ContabilidadView.jsx` (TABS + componente `Diario`), panel `diarioTableHtml` (una `<tr>` por línea, fecha/glosa en la 1ª).

---

## File Structure

**App — Crear/Modificar:**
- Modify `gastos-app/src/gastos/api.js` — `listCuentasApp`, `crearAsientoManual`, `anularAsiento`.
- Create `gastos-app/src/gastos/AsientoManual.jsx` — form de asiento manual con cuadre en vivo.
- Modify `gastos-app/src/gastos/ContabilidadView.jsx` — pestaña "Manual" + botón Anular en `Diario`.
- Test `gastos-app/tests/gastos/AsientoManual.test.jsx`.

**Panel — Modificar:**
- Modify `gastos/public/panel/lib.js` — `cuadreManual(lineas)` (puro) + botón Anular en `diarioTableHtml`.
- Modify `gastos/public/panel/index.html` — sub-vista "Manual" (form) + cablear crear/anular.
- Test `gastos/tests/panel/manual-lib.test.js`.

---

## Task 1: App — `AsientoManual.jsx` + api.js

**Files:**
- Modify: `gastos-app/src/gastos/api.js`
- Create: `gastos-app/src/gastos/AsientoManual.jsx`
- Test: `gastos-app/tests/gastos/AsientoManual.test.jsx`

- [ ] **Step 1: Agregar métodos a `api.js`** (junto a los de contabilidad):
```javascript
  listCuentasApp() { return req('/api/app/cuentas'); },
  crearAsientoManual(body) { return req('/api/app/asientos/manual', { method: 'POST', body }); },
  anularAsiento(id) { return req(`/api/app/asientos/${id}/anular`, { method: 'POST' }); },
```

- [ ] **Step 2: Write the failing test**

```jsx
// gastos-app/tests/gastos/AsientoManual.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AsientoManual from '../../src/gastos/AsientoManual.jsx';
import { api } from '../../src/gastos/api';
jest.mock('../../src/gastos/api');

beforeEach(() => {
  api.listCuentasApp = jest.fn().mockResolvedValue({ cuentas: [
    { id: 'c1', codigo: '1.1.10.2', nombre: 'Banco' }, { id: 'c2', codigo: '4.5.10.1', nombre: 'Gastos Financieros' },
  ] });
  api.crearAsientoManual = jest.fn().mockResolvedValue({ asiento: { id: 'a1' } });
});

test('no guarda mientras no cuadra; guarda cuando Σdebe==Σhaber', async () => {
  const onSaved = jest.fn();
  render(<AsientoManual onSaved={onSaved} />);
  await screen.findByText(/Banco/); // cuentas cargadas en los selects
  // fila 0: debe 5000 en c1 ; fila 1: haber 5000 en c2
  fireEvent.change(screen.getByLabelText('cuenta-0'), { target: { value: 'c1' } });
  fireEvent.change(screen.getByLabelText('debe-0'), { target: { value: '5000' } });
  fireEvent.change(screen.getByLabelText('cuenta-1'), { target: { value: 'c2' } });
  fireEvent.change(screen.getByLabelText('haber-1'), { target: { value: '5000' } });
  const guardar = screen.getByRole('button', { name: /guardar/i });
  expect(guardar).not.toBeDisabled();
  fireEvent.click(guardar);
  await waitFor(() => expect(api.crearAsientoManual).toHaveBeenCalled());
  const arg = api.crearAsientoManual.mock.calls[0][0];
  expect(arg.lineas.length).toBe(2);
  expect(onSaved).toHaveBeenCalled();
});

test('botón guardar deshabilitado si descuadra', async () => {
  render(<AsientoManual onSaved={() => {}} />);
  await screen.findByText(/Banco/);
  fireEvent.change(screen.getByLabelText('debe-0'), { target: { value: '5000' } });
  fireEvent.change(screen.getByLabelText('haber-1'), { target: { value: '4000' } });
  expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd gastos-app && npx jest tests/gastos/AsientoManual.test.jsx`
Expected: FAIL — Cannot find module.

- [ ] **Step 4: Write implementation**

```jsx
// gastos-app/src/gastos/AsientoManual.jsx
import { useState, useEffect } from 'react';
import { api } from './api';

const ORO = '#C9A24B';
function clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }
function ymActual() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function hoy() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function _int(v) { const n = Math.round(Number(v) || 0); return n > 0 ? n : 0; }

export default function AsientoManual({ onSaved }) {
  const [cuentas, setCuentas] = useState([]);
  const [fecha, setFecha] = useState(hoy());
  const [glosa, setGlosa] = useState('');
  const [filas, setFilas] = useState([{ cuenta_id: '', debe: '', haber: '' }, { cuenta_id: '', debe: '', haber: '' }]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { api.listCuentasApp().then((r) => setCuentas((r && r.cuentas) || [])).catch(() => setCuentas([])); }, []);

  const sumD = filas.reduce((s, f) => s + _int(f.debe), 0);
  const sumH = filas.reduce((s, f) => s + _int(f.haber), 0);
  const cuadrado = sumD > 0 && sumD === sumH;
  const validas = filas.filter((f) => f.cuenta_id && (_int(f.debe) > 0 || _int(f.haber) > 0));
  const puedeGuardar = cuadrado && validas.length >= 2 && !busy;

  function setFila(i, patch) { setFilas((prev) => prev.map((f, j) => j === i ? { ...f, ...patch } : f)); }
  function addFila() { setFilas((prev) => [...prev, { cuenta_id: '', debe: '', haber: '' }]); }

  async function guardar() {
    setBusy(true); setMsg('');
    try {
      await api.crearAsientoManual({ fecha, glosa, lineas: validas.map((f) => ({ cuenta_id: f.cuenta_id, debe: _int(f.debe), haber: _int(f.haber) })) });
      setMsg('✓ Asiento guardado'); setGlosa(''); setFilas([{ cuenta_id: '', debe: '', haber: '' }, { cuenta_id: '', debe: '', haber: '' }]);
      if (onSaved) onSaved();
    } catch (e) { setMsg('No se pudo guardar (revisa que cuadre).'); }
    finally { setBusy(false); }
  }

  return (
    <div className="p-3 grid gap-2">
      <h3 className="text-sm font-black" style={{ color: ORO }}>Nuevo asiento manual</h3>
      <div className="flex gap-2">
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="text-xs border rounded px-2 py-1" aria-label="fecha" />
        <input placeholder="Glosa" value={glosa} onChange={(e) => setGlosa(e.target.value)} className="flex-1 text-xs border rounded px-2 py-1" aria-label="glosa" />
      </div>
      {filas.map((f, i) => (
        <div key={i} className="grid grid-cols-3 gap-1">
          <select aria-label={`cuenta-${i}`} value={f.cuenta_id} onChange={(e) => setFila(i, { cuenta_id: e.target.value })} className="text-xs border rounded px-1 py-1 bg-black/5">
            <option value="">cuenta…</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <input aria-label={`debe-${i}`} placeholder="Debe" inputMode="numeric" value={f.debe} onChange={(e) => setFila(i, { debe: e.target.value, haber: '' })} className="text-xs border rounded px-1 py-1" />
          <input aria-label={`haber-${i}`} placeholder="Haber" inputMode="numeric" value={f.haber} onChange={(e) => setFila(i, { haber: e.target.value, debe: '' })} className="text-xs border rounded px-1 py-1" />
        </div>
      ))}
      <button onClick={addFila} className="text-xs font-bold opacity-70 text-left">+ línea</button>
      <div className={`text-center text-xs font-black rounded-lg py-1 ${cuadrado ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'}`}>
        Debe {clp(sumD)} · Haber {clp(sumH)} {cuadrado ? '✓ cuadra' : '⚠ no cuadra'}
      </div>
      <button disabled={!puedeGuardar} onClick={guardar} className="rounded-xl font-black py-2 text-black disabled:opacity-40" style={{ background: ORO }}>Guardar asiento</button>
      {msg ? <div className="text-xs text-center opacity-70">{msg}</div> : null}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd gastos-app && npx jest tests/gastos/AsientoManual.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add gastos-app/src/gastos/api.js gastos-app/src/gastos/AsientoManual.jsx gastos-app/tests/gastos/AsientoManual.test.jsx
git commit -m "feat(varas-f5): AsientoManual en la app (form con cuadre en vivo)"
```

---

## Task 2: App — montar "Manual" en ContabilidadView + Anular en Diario

**Files:**
- Modify: `gastos-app/src/gastos/ContabilidadView.jsx`
- Test: `gastos-app/tests/gastos/ContabilidadView.test.jsx` (extender, opcional)

- [ ] **Step 1: Implementación**

En `gastos-app/src/gastos/ContabilidadView.jsx`:
1. Importar: `import AsientoManual from './AsientoManual.jsx';`
2. Agregar a `TABS` un item: `{ id: 'manual', label: 'Manual' }` (al final).
3. En el `useEffect` que carga `data` por tab: para `tab === 'manual'` NO cargar reporte (igual que `concil`): agregar `if (tab === 'concil' || tab === 'manual') { setData(null); return; }` (o la guarda equivalente que ya exista para `concil`).
4. En el render del área de contenido, agregar el caso: cuando `tab === 'manual'` renderizar `<AsientoManual onSaved={() => setTab('diario')} />`.
5. En el componente `Diario`, agregar un botón **Anular** por asiento que llame a `api.anularAsiento(a.id)` y luego refresque. Como `Diario` es un sub-componente sin acceso al reload del padre, pásale una prop `onAnular`: en el render `tab === 'diario' ? <Diario data={data} onAnular={recargar} /> : ...` donde `recargar` re-dispara la carga (puedes exponer una función que vuelva a setear el periodo o un contador de refresh). Mínimo viable: en `Diario`, el botón hace `await api.anularAsiento(a.id)` y luego `onAnular && onAnular()`. Implementar `recargar` en el padre (re-fetch del tab actual).

Bloque del botón en `Diario` (dentro del map de asientos, tras las líneas):
```jsx
          {a.id ? <button onClick={async () => { try { await api.anularAsiento(a.id); onAnular && onAnular(); } catch (_) {} }} className="mt-1 text-[11px] font-bold text-red-600">Anular</button> : null}
```
(IMPORTA `api` ya está importado en ContabilidadView.)

- [ ] **Step 2: Run tests**

Run: `cd gastos-app && npx jest tests/gastos/ContabilidadView.test.jsx tests/gastos/AsientoManual.test.jsx`
Expected: PASS (los existentes de ContabilidadView no deben romperse; si el test de ContabilidadView mockea `api`, agregar `api.listCuentasApp`/`api.anularAsiento` a su mock si hace falta).

- [ ] **Step 3: App suite completa**

Run: `cd gastos-app && npx jest`
Expected: PASS — sin regresión.

- [ ] **Step 4: Commit**

```bash
git add gastos-app/src/gastos/ContabilidadView.jsx
git commit -m "feat(varas-f5): pestaña Manual + Anular en Diario (app)"
```

---

## Task 3: Panel — cuadre helper + Anular en Diario + form Manual

**Files:**
- Modify: `gastos/public/panel/lib.js`, `gastos/public/panel/index.html`
- Test: `gastos/tests/panel/manual-lib.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// gastos/tests/panel/manual-lib.test.js
const lib = require('../../public/panel/lib');

test('cuadreManual suma debe/haber y marca cuadrado', () => {
  expect(lib.cuadreManual([{ debe: 1000, haber: 0 }, { debe: 0, haber: 1000 }])).toEqual({ sumD: 1000, sumH: 1000, cuadrado: true });
  expect(lib.cuadreManual([{ debe: 1000, haber: 0 }, { debe: 0, haber: 900 }]).cuadrado).toBe(false);
  expect(lib.cuadreManual([]).cuadrado).toBe(false);
});

test('diarioTableHtml incluye botón Anular con el id del asiento', () => {
  const html = lib.diarioTableHtml([{ id: 'as1', fecha: '2026-06-10', glosa: 'Ajuste', lineas: [{ cuenta_nombre: 'Banco', debe: 1000, haber: 0 }] }]);
  expect(html).toContain('data-anular="as1"');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gastos && npx jest tests/panel/manual-lib.test.js`
Expected: FAIL — `cuadreManual is not a function` / sin botón.

- [ ] **Step 3: Write implementation**

(a) En `gastos/public/panel/lib.js` agregar y exponer:
```javascript
  function cuadreManual(lineas) {
    var sumD = 0, sumH = 0;
    (lineas || []).forEach(function (l) { sumD += Math.round(Number(l.debe) || 0); sumH += Math.round(Number(l.haber) || 0); });
    return { sumD: sumD, sumH: sumH, cuadrado: sumD > 0 && sumD === sumH };
  }
```
(b) En `diarioTableHtml` (lib.js), en la fila de la PRIMERA línea de cada asiento (donde hoy se pone fecha/glosa, `i === 0`), agregar al final de esa celda de glosa (o en una celda extra) un botón:
```javascript
        + (i === 0 && a.id ? ' <button class="btn-ghost aux-del" data-anular="' + escapeHtml(a.id) + '">Anular</button>' : '')
```
(Insertarlo dentro de la celda de glosa de la 1ª línea. Reusa la clase de botón existente. Si `diarioTableHtml` no tenía `a.id` disponible, ya viene en el asiento del Libro Diario.)

(c) En `index.html`: en la sub-nav de Contabilidad agregar un sub-botón `data-libro="manual"`; cuando se abre, mostrar un form (fecha, glosa, contenedor de filas `cuenta·debe·haber` con un select de cuentas cargado de `GET /cuentas`, botón "+ línea", indicador de cuadre usando `PanelLib.cuadreManual(filasActuales)`, botón Guardar habilitado solo si cuadra → `POST /asientos/manual`). Cablear también: en la rama `diario` de `loadContabilidad`, tras render, delegar click en `[data-anular]` → `POST /asientos/:id/anular` → recargar el diario. Seguir el patrón `apiFetch`/`PanelLib` y la carga de cuentas como en la pestaña Auxiliares.

> El form del panel es JS vanilla en index.html (no testeado unitariamente más allá del helper `cuadreManual` y el botón en `diarioTableHtml`). Mantén el patrón de las otras sub-vistas.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gastos && npx jest tests/panel/`
Expected: PASS — todos los de panel + los nuevos. (Si el test de A1 `diarioTableHtml` valida estructura exacta, revisar que el botón no rompa sus aserciones — esos tests buscan textos, no estructura.)

- [ ] **Step 5: Commit**

```bash
git add gastos/public/panel/lib.js gastos/public/panel/index.html gastos/tests/panel/manual-lib.test.js
git commit -m "feat(varas-f5): panel form asiento manual + Anular en Diario"
```

---

## Task 4: Cierre F5b — suites + build

- [ ] **Step 1: Backend (panel lib) + app + build**

Run: `cd gastos && npx jest tests/panel` (verde) ; `cd gastos-app && npx jest && npm run build` (verde + build OK).

- [ ] **Step 2: Commit final (si quedó algo)**

```bash
git add -A && git commit -m "test(varas-f5): suites F5b verdes" || echo "nada que commitear"
```

---

## Notas de cierre F5b

- Con F5b se **cierra el roadmap contable F1–F5**: contabilidad automática (F1), conciliación bancaria (F2) y SII/IVA (F3), y asientos manuales (F5). (Queda F4 = VARAS conversacional, fase aparte.)
- **Deploy:** backend+panel con `deploy-gastos-wt.js` desde `HASH IA\` + rebuild APK (por AsientoManual + ContabilidadView). Idealmente desplegar TODO lo acumulado (Auxiliares A1-A4 + F5) de una vez.
- ⚠️ Trabajar SOLO en `HASH IA\`.
