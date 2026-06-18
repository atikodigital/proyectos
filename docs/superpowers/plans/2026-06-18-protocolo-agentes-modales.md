# Protocolo de interacción de agentes (modal de propuesta + captura) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un protocolo reutilizable para los agentes IA: cuando un agente CREA/SUGIERE/MODIFICA datos, la propuesta aparece en una ventana emergente editable (Confirmar/Editar/Cancelar); cuando PIDE un documento, aparecen los affordances de captura/foto/archivo. Aplicado a KALY (voz) y VARAS (chat).

**Architecture:** Un `AgentInteractionProvider` (bus, montado alto en `GastosApp`) expone `proponer(propuesta)→Promise<datos|null>` y `pedirEvidencia({motivo})→Promise<img|null>`, y renderiza `AgentProposalModal` (genérico, campos editables) y `EvidenceCaptureOverlay` (reusa `EvidenceIntake`). KALY (`kaly/tools.js`) y VARAS (`VarasChat.jsx`) rutean sus acciones de escritura por `proponer` y sus pedidos de documento por `pedirEvidencia`.

**Tech Stack:** React 18 + Capacitor + Vite, jest + RTL + jsdom (app `gastos-app/`). Backend casi sin cambios.

**⚠️ Reglas del repo (Antigravity trabaja `master` en paralelo):**
- Todo en `C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\` (NO el worktree).
- Antes de cada commit: `git rev-parse --abbrev-ref HEAD` = `master`; `git rev-parse --show-toplevel` termina en `HASH IA`.
- SIEMPRE `git add <archivos específicos>` — NUNCA `git add -A`/`.`/`-u`.
- **No tocar** `gastos/public/panel/index.html`.
- Tests app desde `gastos-app/`.

---

### Task 1: `AgentProposalModal` (modal de propuesta genérico)

Modal que renderiza una propuesta como campos editables. Confirmar devuelve los valores actuales; Cancelar devuelve null.

**Files:**
- Create: `gastos-app/src/gastos/agente/AgentProposalModal.jsx`
- Test: `gastos-app/tests/gastos/AgentProposalModal.test.jsx`

- [ ] **Step 1: Write the failing test**

Crea `gastos-app/tests/gastos/AgentProposalModal.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import AgentProposalModal from '../../src/gastos/agente/AgentProposalModal.jsx';

const PROP = {
  titulo: 'Crear producto',
  accion: 'agregar_producto',
  campos: [
    { key: 'nombre', label: 'Nombre', valor: 'Empanada', tipo: 'texto' },
    { key: 'precio', label: 'Precio (CLP)', valor: 1500, tipo: 'numero' },
    { key: 'tipo', label: 'Tipo', valor: 'producto', tipo: 'opciones', opciones: ['producto', 'servicio'] },
  ],
};

test('muestra título y los campos con sus valores', () => {
  render(<AgentProposalModal propuesta={PROP} onConfirmar={() => {}} onCancelar={() => {}} />);
  expect(screen.getByText('Crear producto')).toBeInTheDocument();
  expect(screen.getByLabelText('Nombre')).toHaveValue('Empanada');
  expect(screen.getByLabelText('Precio (CLP)')).toHaveValue(1500);
  expect(screen.getByLabelText('Tipo')).toHaveValue('producto');
});

test('editar un campo y Confirmar devuelve los valores editados', () => {
  const onConfirmar = jest.fn();
  render(<AgentProposalModal propuesta={PROP} onConfirmar={onConfirmar} onCancelar={() => {}} />);
  fireEvent.change(screen.getByLabelText('Precio (CLP)'), { target: { value: '1600' } });
  fireEvent.click(screen.getByText('Confirmar'));
  expect(onConfirmar).toHaveBeenCalledWith({ nombre: 'Empanada', precio: 1600, tipo: 'producto' });
});

test('Cancelar llama onCancelar', () => {
  const onCancelar = jest.fn();
  render(<AgentProposalModal propuesta={PROP} onConfirmar={() => {}} onCancelar={onCancelar} />);
  fireEvent.click(screen.getByText('Cancelar'));
  expect(onCancelar).toHaveBeenCalled();
});

test('Escape cancela', () => {
  const onCancelar = jest.fn();
  render(<AgentProposalModal propuesta={PROP} onConfirmar={() => {}} onCancelar={onCancelar} />);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(onCancelar).toHaveBeenCalled();
});

test('propuesta sin campos (solo acción) confirma con objeto vacío', () => {
  const onConfirmar = jest.fn();
  render(<AgentProposalModal propuesta={{ titulo: 'Enviar WhatsApp', accion: 'x', campos: [] }} onConfirmar={onConfirmar} onCancelar={() => {}} />);
  fireEvent.click(screen.getByText('Confirmar'));
  expect(onConfirmar).toHaveBeenCalledWith({});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest tests/gastos/AgentProposalModal.test.jsx 2>&1 | tail -20`
Expected: FAIL — `Cannot find module '.../AgentProposalModal.jsx'`.

- [ ] **Step 3: Write minimal implementation**

Crea `gastos-app/src/gastos/agente/AgentProposalModal.jsx`:

```jsx
import { useEffect, useState } from 'react';

const ORO = '#C9A24B';

export default function AgentProposalModal({ propuesta, onConfirmar, onCancelar }) {
  const campos = (propuesta && propuesta.campos) || [];
  const [valores, setValores] = useState(() => {
    const v = {};
    for (const c of campos) v[c.key] = c.valor;
    return v;
  });

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancelar?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancelar]);

  function set(key, raw, tipo) {
    const valor = tipo === 'numero' ? Number(raw) : raw;
    setValores((p) => ({ ...p, [key]: valor }));
  }

  return (
    <div
      role="dialog"
      aria-label={propuesta?.titulo || 'Propuesta'}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancelar?.(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ background: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 420, boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}>
        <h3 style={{ margin: '0 0 4px', fontWeight: 900, color: ORO }}>{propuesta?.titulo}</h3>
        {propuesta?.nota ? <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>{propuesta.nota}</p> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '12px 0' }}>
          {campos.map((c) => (
            <label key={c.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569', fontWeight: 700 }}>
              {c.label}
              {c.tipo === 'opciones' ? (
                <select aria-label={c.label} value={valores[c.key]} onChange={(e) => set(c.key, e.target.value, c.tipo)} style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}>
                  {(c.opciones || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  aria-label={c.label}
                  type={c.tipo === 'numero' ? 'number' : 'text'}
                  value={valores[c.key]}
                  onChange={(e) => set(c.key, e.target.value, c.tipo)}
                  style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
                />
              )}
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button onClick={() => onCancelar?.()} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700 }}>Cancelar</button>
          <button onClick={() => onConfirmar?.({ ...valores })} style={{ padding: '8px 14px', borderRadius: 8, border: 0, background: ORO, color: '#fff', fontWeight: 900 }}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest tests/gastos/AgentProposalModal.test.jsx 2>&1 | tail -20`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD   # master
git add gastos-app/src/gastos/agente/AgentProposalModal.jsx gastos-app/tests/gastos/AgentProposalModal.test.jsx
git commit -m "feat(agentes): AgentProposalModal (modal de propuesta editable)"
```

---

### Task 2: `EvidenceCaptureOverlay` (captura al pedir info)

Overlay que muestra el motivo + `EvidenceIntake` (pantalla/foto/archivo). Al capturar la primera evidencia, llama `onCapturar(asset)`.

**Files:**
- Create: `gastos-app/src/gastos/agente/EvidenceCaptureOverlay.jsx`
- Test: `gastos-app/tests/gastos/EvidenceCaptureOverlay.test.jsx`

- [ ] **Step 1: Write the failing test**

Abre primero `gastos-app/src/components/EvidenceIntake.jsx` para confirmar que su prop `onChange` recibe el array de items normalizados. El overlay se prueba con `EvidenceIntake` MOCKEADO (no necesitamos su lógica interna real). Crea `gastos-app/tests/gastos/EvidenceCaptureOverlay.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';

// Mock EvidenceIntake: expone un botón que dispara onChange con un item de prueba.
jest.mock('../../src/components/EvidenceIntake.jsx', () => ({
  __esModule: true,
  default: ({ onChange }) => (
    <button onClick={() => onChange([{ base64: 'ZZZ', mimeType: 'image/jpeg' }])}>mock-capturar</button>
  ),
}));

import EvidenceCaptureOverlay from '../../src/gastos/agente/EvidenceCaptureOverlay.jsx';

test('muestra el motivo y EvidenceIntake', () => {
  render(<EvidenceCaptureOverlay motivo="la boleta del proveedor" onCapturar={() => {}} onCancelar={() => {}} />);
  expect(screen.getByText(/la boleta del proveedor/i)).toBeInTheDocument();
  expect(screen.getByText('mock-capturar')).toBeInTheDocument();
});

test('al capturar la primera evidencia llama onCapturar con el item', () => {
  const onCapturar = jest.fn();
  render(<EvidenceCaptureOverlay motivo="x" onCapturar={onCapturar} onCancelar={() => {}} />);
  fireEvent.click(screen.getByText('mock-capturar'));
  expect(onCapturar).toHaveBeenCalledWith({ base64: 'ZZZ', mimeType: 'image/jpeg' });
});

test('Cancelar llama onCancelar', () => {
  const onCancelar = jest.fn();
  render(<EvidenceCaptureOverlay motivo="x" onCapturar={() => {}} onCancelar={onCancelar} />);
  fireEvent.click(screen.getByText('Cancelar'));
  expect(onCancelar).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest tests/gastos/EvidenceCaptureOverlay.test.jsx 2>&1 | tail -20`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Write minimal implementation**

Crea `gastos-app/src/gastos/agente/EvidenceCaptureOverlay.jsx`:

```jsx
import EvidenceIntake from '../../components/EvidenceIntake.jsx';

const ORO = '#C9A24B';

export default function EvidenceCaptureOverlay({ motivo, onCapturar, onCancelar }) {
  function onChange(items) {
    const first = Array.isArray(items) && items[0];
    if (first) onCapturar?.(first);
  }
  return (
    <div role="dialog" aria-label="Adjuntar documento" style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 420 }}>
        <h3 style={{ margin: '0 0 8px', fontWeight: 900, color: ORO }}>Adjunta un documento</h3>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#475569' }}>KALY te pide: {motivo}</p>
        <EvidenceIntake maxEvidence={1} value={[]} onChange={onChange} showNativeCapture />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={() => onCancelar?.()} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700 }}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest tests/gastos/EvidenceCaptureOverlay.test.jsx 2>&1 | tail -20`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD
git add gastos-app/src/gastos/agente/EvidenceCaptureOverlay.jsx gastos-app/tests/gastos/EvidenceCaptureOverlay.test.jsx
git commit -m "feat(agentes): EvidenceCaptureOverlay (captura al pedir documento)"
```

---

### Task 3: `AgentInteractionProvider` + `useAgentInteraction` (el bus)

Contexto que expone `proponer`/`pedirEvidencia` (devuelven promesas), renderiza el modal/overlay activo, y maneja una interacción a la vez. Default no-op fuera del provider (para no romper componentes que usen el hook sin estar envueltos en tests).

**Files:**
- Create: `gastos-app/src/gastos/agente/AgentInteractionProvider.jsx`
- Test: `gastos-app/tests/gastos/AgentInteractionProvider.test.jsx`

- [ ] **Step 1: Write the failing test**

Crea `gastos-app/tests/gastos/AgentInteractionProvider.test.jsx`:

```jsx
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { AgentInteractionProvider, useAgentInteraction } from '../../src/gastos/agente/AgentInteractionProvider.jsx';

jest.mock('../../src/components/EvidenceIntake.jsx', () => ({
  __esModule: true,
  default: ({ onChange }) => <button onClick={() => onChange([{ base64: 'ZZZ', mimeType: 'image/jpeg' }])}>mock-capturar</button>,
}));

function Harness() {
  const { proponer, pedirEvidencia } = useAgentInteraction();
  return (
    <div>
      <button onClick={async () => { const d = await proponer({ titulo: 'Crear', accion: 'x', campos: [{ key: 'n', label: 'Nombre', valor: 'A', tipo: 'texto' }] }); window.__res = d; }}>proponer</button>
      <button onClick={async () => { const e = await pedirEvidencia({ motivo: 'la boleta' }); window.__ev = e; }}>pedir</button>
    </div>
  );
}

test('proponer abre el modal; Confirmar resuelve con los datos', async () => {
  window.__res = undefined;
  render(<AgentInteractionProvider><Harness /></AgentInteractionProvider>);
  await act(async () => { fireEvent.click(screen.getByText('proponer')); });
  expect(screen.getByText('Crear')).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByText('Confirmar')); });
  await waitFor(() => expect(window.__res).toEqual({ n: 'A' }));
});

test('proponer + Cancelar resuelve null', async () => {
  window.__res = 'sentinel';
  render(<AgentInteractionProvider><Harness /></AgentInteractionProvider>);
  await act(async () => { fireEvent.click(screen.getByText('proponer')); });
  await act(async () => { fireEvent.click(screen.getByText('Cancelar')); });
  await waitFor(() => expect(window.__res).toBeNull());
});

test('pedirEvidencia abre el overlay; capturar resuelve la imagen', async () => {
  window.__ev = undefined;
  render(<AgentInteractionProvider><Harness /></AgentInteractionProvider>);
  await act(async () => { fireEvent.click(screen.getByText('pedir')); });
  expect(screen.getByText(/la boleta/i)).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByText('mock-capturar')); });
  await waitFor(() => expect(window.__ev).toEqual({ base64: 'ZZZ', mimeType: 'image/jpeg' }));
});

test('useAgentInteraction fuera del provider devuelve no-op (resuelve null)', async () => {
  let res = 'x';
  function Solo() { const { proponer } = useAgentInteraction(); return <button onClick={async () => { res = await proponer({ campos: [] }); }}>p</button>; }
  render(<Solo />);
  await act(async () => { fireEvent.click(screen.getByText('p')); });
  await waitFor(() => expect(res).toBeNull());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest tests/gastos/AgentInteractionProvider.test.jsx 2>&1 | tail -20`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Write minimal implementation**

Crea `gastos-app/src/gastos/agente/AgentInteractionProvider.jsx`:

```jsx
import { createContext, useContext, useState, useCallback, useRef } from 'react';
import AgentProposalModal from './AgentProposalModal.jsx';
import EvidenceCaptureOverlay from './EvidenceCaptureOverlay.jsx';

const noop = {
  proponer: async () => null,
  pedirEvidencia: async () => null,
  interaccionAbierta: false,
};

const Ctx = createContext(noop);

export function useAgentInteraction() {
  return useContext(Ctx);
}

export function AgentInteractionProvider({ children }) {
  const [activa, setActiva] = useState(null); // { tipo:'propuesta'|'evidencia', datos }
  const resolverRef = useRef(null);

  const abrir = useCallback((interaccion) => {
    // Una interacción a la vez: si hay una abierta, la nueva se resuelve null inmediatamente.
    if (resolverRef.current) return Promise.resolve(null);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setActiva(interaccion);
    });
  }, []);

  const cerrar = useCallback((valor) => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setActiva(null);
    if (r) r(valor);
  }, []);

  const proponer = useCallback((propuesta) => abrir({ tipo: 'propuesta', propuesta }), [abrir]);
  const pedirEvidencia = useCallback((req) => abrir({ tipo: 'evidencia', req }), [abrir]);

  const value = { proponer, pedirEvidencia, interaccionAbierta: Boolean(activa) };

  return (
    <Ctx.Provider value={value}>
      {children}
      {activa && activa.tipo === 'propuesta' ? (
        <AgentProposalModal propuesta={activa.propuesta} onConfirmar={(datos) => cerrar(datos)} onCancelar={() => cerrar(null)} />
      ) : null}
      {activa && activa.tipo === 'evidencia' ? (
        <EvidenceCaptureOverlay motivo={activa.req?.motivo} onCapturar={(asset) => cerrar(asset)} onCancelar={() => cerrar(null)} />
      ) : null}
    </Ctx.Provider>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest tests/gastos/AgentInteractionProvider.test.jsx 2>&1 | tail -20`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD
git add gastos-app/src/gastos/agente/AgentInteractionProvider.jsx gastos-app/tests/gastos/AgentInteractionProvider.test.jsx
git commit -m "feat(agentes): AgentInteractionProvider + useAgentInteraction (bus proponer/pedirEvidencia)"
```

---

### Task 4: KALY — `construirPropuesta` + `executeTool` rutea escritura por `proponer` + tool `pedir_documento`

`kaly/tools.js`: las tools de escritura arman una propuesta y esperan `ctx.proponer`; solo si se confirma llaman al `api` real (con los valores posiblemente editados). Se agrega `pedir_documento` → `ctx.pedirEvidencia`. Lectura sin cambios.

**Files:**
- Modify: `gastos-app/src/gastos/kaly/tools.js`
- Test: `gastos-app/tests/gastos/kaly-tools.test.js`

- [ ] **Step 1: Write the failing tests**

Abre `gastos-app/tests/gastos/kaly-tools.test.js` para ver cómo mockea `api`. Agrega:

```js
describe('protocolo de propuesta (escritura por proponer)', () => {
  test('agregar_producto pasa por proponer y solo crea si se confirma', async () => {
    api.createProduct.mockResolvedValue({ nombre: 'Empanada', precio_base: 1600 });
    const proponer = jest.fn().mockResolvedValue({ nombre: 'Empanada', precio: 1600, tipo: 'producto' });
    const r = await executeTool('agregar_producto', { nombre: 'Empanada', precio: 1500, tipo: 'producto' }, { proponer });
    expect(proponer).toHaveBeenCalledTimes(1);
    expect(api.createProduct).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Empanada', precio_base: 1600 }));
    expect(r.ok).toBe(true);
  });

  test('si el usuario cancela (proponer→null) NO llama al api', async () => {
    const proponer = jest.fn().mockResolvedValue(null);
    const r = await executeTool('agregar_producto', { nombre: 'X', precio: 1000 }, { proponer });
    expect(api.createProduct).not.toHaveBeenCalled();
    expect(r.cancelado).toBe(true);
  });

  test('una tool de LECTURA no llama a proponer', async () => {
    api.listExpenses.mockResolvedValue([]);
    const proponer = jest.fn();
    await executeTool('obtener_resumen', {}, { proponer });
    expect(proponer).not.toHaveBeenCalled();
  });

  test('pedir_documento usa pedirEvidencia y manda la foto a createExpense', async () => {
    const pedirEvidencia = jest.fn().mockResolvedValue({ base64: 'IMG', mimeType: 'image/png' });
    api.createExpense.mockResolvedValue({ id: 'e1' });
    const r = await executeTool('pedir_documento', { motivo: 'la boleta', destino: 'gasto' }, { pedirEvidencia });
    expect(pedirEvidencia).toHaveBeenCalledWith({ motivo: 'la boleta' });
    expect(api.createExpense).toHaveBeenCalledWith('IMG', 'image/png');
    expect(r.ok).toBe(true);
  });
});
```
> Si el mock de `api` del archivo no incluye `createProduct`/`createExpense`/`listExpenses`, agrégalos al `jest.mock('../../src/gastos/api', ...)` con `jest.fn()` y resetea en `beforeEach` como ya hace el archivo. Mira el patrón existente y síguelo.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest tests/gastos/kaly-tools.test.js -t "propuesta" 2>&1 | tail -25`
Expected: FAIL — hoy `executeTool` no llama a `proponer`/`pedirEvidencia`.

- [ ] **Step 3: Implement**

En `gastos-app/src/gastos/kaly/tools.js`:

(a) Agrega la tool `pedir_documento` al final del array `TOOL_DECLARATIONS` (tras `recordar`):
```js
  ,{ name: 'pedir_documento', description: 'Pide al usuario que adjunte una foto o captura de un documento (boleta, factura, comprobante o cartola). Úsalo cuando necesites ver un documento.', parameters: { type: 'OBJECT', properties: { motivo: { type: 'STRING', description: 'qué documento pides, en pocas palabras' }, destino: { type: 'STRING', enum: ['gasto', 'cartola'], description: 'gasto = boleta/factura/comprobante; cartola = cartola bancaria' } }, required: ['motivo'] } }
```

(b) Agrega, antes de `executeTool`, el set de tools de escritura y el constructor de propuestas:
```js
const TOOLS_ESCRITURA = new Set([
  'guardar_preferencias', 'marcar_pagada', 'anular_movimiento', 'enviar_resumen_whatsapp',
  'crear_movimiento_manual', 'agregar_producto', 'editar_precio', 'editar_stock', 'recordar',
]);

export function construirPropuesta(name, args = {}) {
  switch (name) {
    case 'agregar_producto':
      return { titulo: 'Crear producto', accion: name, campos: [
        { key: 'nombre', label: 'Nombre', valor: args.nombre || '', tipo: 'texto' },
        { key: 'precio', label: 'Precio (CLP)', valor: Number(args.precio) || 0, tipo: 'numero' },
        { key: 'tipo', label: 'Tipo', valor: args.tipo === 'servicio' ? 'servicio' : 'producto', tipo: 'opciones', opciones: ['producto', 'servicio'] },
      ] };
    case 'editar_precio':
      return { titulo: 'Cambiar precio', accion: name, campos: [
        { key: 'nombre', label: 'Producto', valor: args.nombre || '', tipo: 'texto' },
        { key: 'nuevo_precio', label: 'Nuevo precio (CLP)', valor: Number(args.nuevo_precio) || 0, tipo: 'numero' },
      ] };
    case 'editar_stock':
      return { titulo: 'Fijar stock', accion: name, campos: [
        { key: 'nombre', label: 'Producto', valor: args.nombre || '', tipo: 'texto' },
        { key: 'stock', label: 'Stock', valor: Number(args.stock) || 0, tipo: 'numero' },
      ] };
    case 'recordar':
      return { titulo: 'Guardar en memoria', accion: name, campos: [
        { key: 'contenido', label: 'Dato a recordar', valor: args.contenido || '', tipo: 'texto' },
        { key: 'tipo', label: 'Tipo', valor: ['negocio', 'dueño', 'preferencia', 'hecho'].includes(args.tipo) ? args.tipo : 'hecho', tipo: 'opciones', opciones: ['negocio', 'dueño', 'preferencia', 'hecho'] },
      ] };
    case 'crear_movimiento_manual':
      return { titulo: 'Registrar movimiento', accion: name, campos: [
        { key: 'tipo', label: 'Tipo', valor: args.tipo === 'ingreso' ? 'ingreso' : 'gasto', tipo: 'opciones', opciones: ['gasto', 'ingreso'] },
        { key: 'proveedor', label: 'Proveedor / descripción', valor: args.proveedor || '', tipo: 'texto' },
        { key: 'total', label: 'Total (CLP)', valor: Number(args.total) || 0, tipo: 'numero' },
        { key: 'categoria', label: 'Categoría', valor: args.categoria || '', tipo: 'texto' },
        { key: 'estado_pago', label: 'Estado de pago', valor: args.estado_pago === 'pagada' ? 'pagada' : 'pendiente', tipo: 'opciones', opciones: ['pendiente', 'pagada'] },
      ] };
    case 'marcar_pagada':
      return { titulo: 'Marcar gasto como pagado', accion: name, nota: 'Buscaré el gasto que coincida y lo marcaré como pagado.', campos: [
        { key: 'proveedor', label: 'Proveedor / descripción', valor: args.proveedor || '', tipo: 'texto' },
      ] };
    case 'anular_movimiento':
      return { titulo: 'Anular movimiento', accion: name, nota: 'Buscaré el movimiento que coincida y lo anularé.', campos: [
        { key: 'proveedor', label: 'Proveedor / descripción', valor: args.proveedor || '', tipo: 'texto' },
      ] };
    case 'enviar_resumen_whatsapp':
      return { titulo: 'Enviar resumen por WhatsApp', accion: name, nota: 'Se enviará el resumen de flujo de caja al WhatsApp del dueño.', campos: [] };
    case 'guardar_preferencias':
      return { titulo: 'Guardar tus datos', accion: name, campos: [
        { key: 'nombre', label: 'Nombre', valor: args.nombre || '', tipo: 'texto' },
        { key: 'trato', label: 'Trato', valor: args.trato === 'señora' ? 'señora' : 'señor', tipo: 'opciones', opciones: ['señor', 'señora'] },
      ] };
    default:
      return null;
  }
}
```

(c) Cambia la firma de `executeTool` y agrega el preámbulo de propuesta + el branch de `pedir_documento`:
```js
export async function executeTool(name, args = {}, { onPrefsSaved, proponer, pedirEvidencia } = {}) {
  // Caso A: pedir documento → captura.
  if (name === 'pedir_documento') {
    if (typeof pedirEvidencia !== 'function') return { error: 'no_disponible' };
    const ev = await pedirEvidencia({ motivo: args.motivo });
    if (!ev) return { cancelado: true, detalle: 'El usuario no adjuntó nada.' };
    try {
      if (args.destino === 'cartola') { const r = await api.matchCartola(ev.base64, ev.mimeType); return { ok: true, ...r }; }
      const r = await api.createExpense(ev.base64, ev.mimeType); return { ok: true, id: r.id };
    } catch (e) { return { error: 'fallo_operacion', detalle: e.message || 'error' }; }
  }
  // Caso B: escritura → propuesta editable (si hay 'proponer').
  if (TOOLS_ESCRITURA.has(name) && typeof proponer === 'function') {
    const propuesta = construirPropuesta(name, args);
    const datos = await proponer(propuesta);
    if (!datos) return { cancelado: true, detalle: 'El usuario canceló la acción.' };
    args = { ...args, ...datos };
  }
  try {
    // ...mantén EXACTAMENTE el resto del switch actual (guardar_preferencias ... recordar)...
```
El cuerpo del `try { ... } catch { ... }` existente queda IGUAL (usa `args`, que ahora trae los valores confirmados/editados). Solo agregaste el preámbulo y el branch de `pedir_documento` antes del `try`.

> Nota: `ev.base64` — el item de evidencia que entrega `EvidenceCaptureOverlay` viene de `EvidenceIntake`. Si la clave real del base64 en el asset no es `base64` (revísalo en `EvidenceIntake.jsx`/`normalizeEvidenceAsset`), usa la clave correcta aquí y en el test del overlay/captura de forma consistente. El contrato debe ser el mismo en `EvidenceCaptureOverlay` (lo que pasa a `onCapturar`) y aquí (lo que lee `executeTool`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest tests/gastos/kaly-tools.test.js 2>&1 | tail -20`
Expected: PASS (los nuevos + los existentes del archivo; los existentes que llamaban `executeTool` sin `proponer` siguen funcionando porque sin `proponer` las tools de escritura ejecutan directo como antes).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD
git add gastos-app/src/gastos/kaly/tools.js gastos-app/tests/gastos/kaly-tools.test.js
git commit -m "feat(agentes): KALY rutea escritura por proponer + tool pedir_documento"
```

---

### Task 5: Montar el provider en `GastosApp` + cablear KALY (ctx + pausa de voz)

El provider envuelve la app; `KalyAgent` toma `proponer`/`pedirEvidencia` del hook y los pasa a `executeTool`; mientras hay una interacción abierta, silencia la voz.

**Files:**
- Modify: `gastos-app/src/gastos/GastosApp.jsx`
- Modify: `gastos-app/src/gastos/kaly/KalyAgent.jsx`
- Test: `gastos-app/tests/gastos/KalyAgent.test.jsx`

- [ ] **Step 1: Write the failing test**

En `gastos-app/tests/gastos/KalyAgent.test.jsx`, agrega un test que verifica que el `ctx` pasado a `executeTool` incluye `proponer` y `pedirEvidencia` (el archivo ya mockea `tools.js` con `executeTool: jest.fn()`):

```js
test('(11) onToolCall pasa proponer y pedirEvidencia en el ctx de executeTool', async () => {
  await act(async () => { render(<KalyAgent />); });
  await waitFor(() => expect(openLiveSession).toHaveBeenCalledTimes(1));
  const fc = { id: '9', name: 'agregar_producto', args: { nombre: 'X', precio: 1000 } };
  await act(async () => { await lastLiveOpts.onToolCall(fc); });
  expect(executeTool).toHaveBeenCalledWith(
    'agregar_producto',
    { nombre: 'X', precio: 1000 },
    expect.objectContaining({ proponer: expect.any(Function), pedirEvidencia: expect.any(Function) }),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest tests/gastos/KalyAgent.test.jsx -t "pasa proponer" 2>&1 | tail -20`
Expected: FAIL — hoy el ctx solo tiene `onPrefsSaved`.

- [ ] **Step 3: Implement**

(a) En `gastos-app/src/gastos/kaly/KalyAgent.jsx`:
- Importa el hook arriba: `import { useAgentInteraction } from '../agente/AgentInteractionProvider.jsx';`
- Dentro del componente, cerca de los otros hooks: `const { proponer, pedirEvidencia, interaccionAbierta } = useAgentInteraction();`
- En `onToolCall`, cambia la llamada a `executeTool` para incluir el ctx:
```js
      const onToolCall = async (fc) => {
        const out = await executeTool(fc.name, fc.args, {
          onPrefsSaved: (p) => {
            contextRef.current = { ...contextRef.current, ...p, onboarded: true };
            localStorage.setItem('kaly_onboarded', '1');
          },
          proponer,
          pedirEvidencia,
        });
        if (sessionRef.current) sessionRef.current.sendToolResponse(fc.id, fc.name, out);
      };
```
- Pausa de voz: agrega un efecto que silencia la sesión mientras `interaccionAbierta`, y restaura al cerrar (respetando el mute del usuario):
```js
  useEffect(() => {
    if (!sessionRef.current || !sessionRef.current.setMuted) return;
    sessionRef.current.setMuted(interaccionAbierta || mutedRef.current);
  }, [interaccionAbierta]);
```
(Colócalo después de la definición de `start`/`mutedRef`. No cambies otra lógica.)

(b) En `gastos-app/src/gastos/GastosApp.jsx`, envuelve el árbol devuelto con el provider. Importa arriba: `import { AgentInteractionProvider } from './agente/AgentInteractionProvider.jsx';` y en el `return (`, envuelve el `<div className="h-screen ...">...</div>` raíz:
```jsx
  return (
    <AgentInteractionProvider>
      <div className="h-screen flex flex-col overflow-hidden">
        {/* ...todo el contenido actual... */}
      </div>
    </AgentInteractionProvider>
  );
```
(Solo agregás el wrapper de apertura/cierre; el contenido interno no cambia.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest tests/gastos/KalyAgent.test.jsx tests/gastos/GastosApp.test.jsx 2>&1 | tail -20`
Expected: PASS (KalyAgent nuevos + existentes; GastosApp sigue verde. KalyAgent usa el hook sin provider en su test → devuelve el no-op default, que provee `proponer`/`pedirEvidencia` como funciones → el assert pasa).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD
git add gastos-app/src/gastos/GastosApp.jsx gastos-app/src/gastos/kaly/KalyAgent.jsx gastos-app/tests/gastos/KalyAgent.test.jsx
git commit -m "feat(agentes): monta provider en GastosApp + KALY pasa ctx y pausa voz"
```

---

### Task 6: VARAS — la acción propuesta pasa por `proponer`

`VarasChat.jsx` ya recibe `accionPropuesta` (`{tipo, args, descripcion}`) y la confirma inline. Ahora la presenta vía el modal estándar.

**Files:**
- Modify: `gastos-app/src/gastos/VarasChat.jsx`
- Test: `gastos-app/tests/gastos/VarasChat.test.jsx`

- [ ] **Step 1: Write the failing test**

Abre `gastos-app/tests/gastos/VarasChat.test.jsx` y mira cómo mockea `api` y renderiza. Agrega un test que verifica que, al confirmar, se ejecuta vía `proponer` (mockeando `useAgentInteraction`). Patrón:

```js
jest.mock('../../src/gastos/agente/AgentInteractionProvider.jsx', () => ({
  __esModule: true,
  useAgentInteraction: () => ({ proponer: global.__proponer, pedirEvidencia: jest.fn(), interaccionAbierta: false }),
  AgentInteractionProvider: ({ children }) => children,
}));
```
Y en el test:
```js
test('al confirmar una acción propuesta, pasa por proponer y solo ejecuta si se confirma', async () => {
  global.__proponer = jest.fn().mockResolvedValue({});
  api.varasChat.mockResolvedValue({ reply: 'ok', accionPropuesta: { tipo: 'marcar_pagada', args: { id: 'x' }, descripcion: 'Marcar pagado' } });
  api.varasAccion.mockResolvedValue({ ok: true });
  // ...render VarasChat, enviar un mensaje que devuelva accionPropuesta, click en el botón de confirmar/ejecutar...
  // Tras confirmar:
  expect(global.__proponer).toHaveBeenCalled();
  expect(api.varasAccion).toHaveBeenCalledWith('marcar_pagada', { id: 'x' });
});

test('si proponer devuelve null, NO ejecuta la acción', async () => {
  global.__proponer = jest.fn().mockResolvedValue(null);
  api.varasChat.mockResolvedValue({ reply: 'ok', accionPropuesta: { tipo: 'marcar_pagada', args: { id: 'x' }, descripcion: 'Marcar pagado' } });
  // ...render, disparar, confirmar...
  expect(api.varasAccion).not.toHaveBeenCalled();
});
```
> Adapta los pasos de interacción (enviar mensaje, click) al markup real de `VarasChat.jsx` (revísalo: tiene un botón cuando `accion` está set, ~línea 73). Sigue el patrón del test existente del archivo.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest tests/gastos/VarasChat.test.jsx -t "proponer" 2>&1 | tail -20`
Expected: FAIL — hoy ejecuta `api.varasAccion` directo sin `proponer`.

- [ ] **Step 3: Implement**

En `gastos-app/src/gastos/VarasChat.jsx`:
- Importa el hook: `import { useAgentInteraction } from './agente/AgentInteractionProvider.jsx';`
- Dentro del componente: `const { proponer } = useAgentInteraction();`
- En la función que ejecuta la acción (hoy `await api.varasAccion(accion.tipo, accion.args)`, ~línea 44), antepón la propuesta:
```js
    const datos = await proponer({
      titulo: accion.descripcion || 'Confirmar acción',
      accion: accion.tipo,
      campos: Object.entries(accion.args || {}).map(([key, valor]) => ({
        key, label: key, valor: valor == null ? '' : valor,
        tipo: typeof valor === 'number' ? 'numero' : 'texto',
      })),
    });
    if (!datos) { setAccion(null); return; }
    await api.varasAccion(accion.tipo, { ...accion.args, ...datos });
```
(Mantén el resto del manejo: `setAccion(null)`, mensajes de éxito/error, `busy`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest tests/gastos/VarasChat.test.jsx 2>&1 | tail -20`
Expected: PASS (nuevos + existentes).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD
git add gastos-app/src/gastos/VarasChat.jsx gastos-app/tests/gastos/VarasChat.test.jsx
git commit -m "feat(agentes): VARAS rutea la acción propuesta por el modal (proponer)"
```

---

### Task 7: Suite completa verde + build

**Files:** (verificación)

- [ ] **Step 1: App — suite completa**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx jest 2>&1 | tail -12`
Expected: PASS — todas verdes (las previas + AgentProposalModal + EvidenceCaptureOverlay + AgentInteractionProvider + kaly-tools nuevos + KalyAgent nuevo + VarasChat nuevo).

- [ ] **Step 2: App — build**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos-app" && npx vite build 2>&1 | tail -6`
Expected: build OK (`✓ built`).

- [ ] **Step 3: Backend — suite (regresión, no debería cambiar)**

Run: `cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA/gastos" && npx jest 2>&1 | tail -6`
Expected: PASS (sin cambios de backend).

- [ ] **Step 4: Commit (solo si hubo algún ajuste)**

Si todo pasó sin cambios, no hay nada que commitear.

---

## Self-Review

**1. Spec coverage:**
- Bus `proponer`/`pedirEvidencia` (una a la vez, no-op fuera de provider) → Task 3 ✅
- `AgentProposalModal` genérico editable (Confirmar/Editar/Cancelar, Esc) → Task 1 ✅
- Captura reusando `EvidenceIntake` → Task 2 ✅
- KALY: escritura por `proponer`, lectura intacta, `pedir_documento` por `pedirEvidencia` → Task 4 ✅; ctx + montaje + pausa de voz → Task 5 ✅
- VARAS: acción de escritura por `proponer` → Task 6 ✅
- Sin adjuntos en el modal de propuesta (Task 1 no tiene captura) ✅; captura solo en pedir info (Task 2/4) ✅
- Suite + build → Task 7 ✅

**2. Placeholder scan:** Sin "TBD"/"TODO". Las notas de "adaptá al markup real / revisá la clave del asset" son por integrar con archivos existentes (VarasChat, EvidenceIntake) cuya forma exacta el implementador confirma leyendo; la lógica y el código están completos. El contrato del asset de evidencia (`base64`/`mimeType`) debe ser consistente entre Task 2, Task 3 y Task 4 (mismo objeto pasa por `onCapturar`→`cerrar`→resultado de `pedirEvidencia`→`executeTool`).

**3. Type consistency:** Propuesta `{titulo, accion, campos:[{key,label,valor,tipo,opciones?}], nota?}` y `datos={[key]:valor}` consistentes (Task 1/3/4/6). `proponer(propuesta)→Promise<datos|null>`, `pedirEvidencia({motivo})→Promise<asset|null>`, `interaccionAbierta:boolean` (Task 3) usados igual en Task 5/6. `construirPropuesta(name,args)` (Task 4) produce la forma de Task 1. `executeTool(name,args,{onPrefsSaved,proponer,pedirEvidencia})` (Task 4) llamado así en Task 5. ✅
