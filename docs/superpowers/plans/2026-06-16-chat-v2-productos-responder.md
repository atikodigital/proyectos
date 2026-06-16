# Chat v2 — Productos dentro de Chat + responder — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **WORKTREE GUARD (cada subagente):** trabaja SOLO en `C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112`. Toda ruta debe contener `.claude\worktrees\dazzling-driscoll-78a112`. Antes de commitear: `git rev-parse --show-toplevel && git branch --show-current` → toplevel termina en `dazzling-driscoll-78a112`, branch `claude/dazzling-driscoll-78a112`. `gastos-app/` también existe en `main` — NO tocar eso. Nunca `git add -A`. App bajo `gastos-app/`, jest desde ahí.

**Goal:** Unificar el módulo Chat: el catálogo "Productos" pasa adentro de Chat (selector Conversaciones|Productos), y la conversación gana una caja para redactar una respuesta que se envía por WhatsApp (wa.me) + crear pedido inline.

**Architecture:** Solo frontend. `GastosApp.jsx` pierde la pestaña Productos (queda en 5 tabs). `ChatView.jsx` gana un selector de 2 vistas (renderiza `ProductosView` en "Productos") y, en la conversación, una caja de respuesta que abre WhatsApp con el texto y muestra la respuesta en el hilo. El envío real ocurre en WhatsApp (constraint conocido).

**Tech Stack:** Capacitor/React/Vite, jest + React Testing Library, TDD. Spec: `docs/superpowers/specs/2026-06-16-chat-v2-productos-responder-design.md`.

---

## Task 1: GastosApp — quitar la pestaña Productos

**Files:**
- Modify: `gastos-app/src/gastos/GastosApp.jsx`
- Test: `gastos-app/tests/gastos/GastosApp.test.jsx` (añadir 1 assert)

- [ ] **Step 1: Write the failing test** — APPEND al final de `gastos-app/tests/gastos/GastosApp.test.jsx` (el archivo ya tiene los imports/helpers de render y un token seteado; reusa el mismo patrón de render que los tests existentes de ese archivo):

```js
test('el nav YA NO tiene la pestaña Productos (se movió a Chat)', () => {
  renderApp();
  expect(screen.queryByRole('button', { name: /^Productos$/i })).toBeNull();
  // las otras siguen
  expect(screen.getByRole('button', { name: /^Chat$/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Match$/i })).toBeInTheDocument();
});
```
NOTA: usa el MISMO helper de render que los demás tests del archivo (si se llama distinto a `renderApp`, reemplázalo por el que exista; lee el archivo para ver cómo montan `<GastosApp />` ya autenticado).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos-app" && npx jest tests/gastos/GastosApp.test.jsx -t "YA NO tiene"`
Expected: FAIL — el botón "Productos" todavía existe.

- [ ] **Step 3: Write minimal implementation** en `gastos-app/src/gastos/GastosApp.jsx`:
1. Quitar el import: borrar la línea `import ProductosView from './ProductosView.jsx';`.
2. Quitar la rama de render de productos: borrar
```jsx
        ) : tab === 'productos' ? (
          <ProductosView />
```
(de modo que tras `tab === 'chat' ? (<ChatView />`) siga directo `) : tab === 'transaccional' ? (`).
3. Quitar el botón del `<nav>`: borrar el `<button ... onClick={() => setTab('productos')}> ... <span>Productos</span> ... </button>` completo.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos-app" && npx jest tests/gastos/GastosApp.test.jsx`
Expected: PASS (el nuevo + los existentes; "Productos" ya no aparece).

- [ ] **Step 5: GUARD then commit**

```bash
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112" && git rev-parse --show-toplevel && git branch --show-current && git add gastos-app/src/gastos/GastosApp.jsx gastos-app/tests/gastos/GastosApp.test.jsx && git commit -m "feat(chat): quita la pestaña Productos del nav (se mueve a Chat)"
```

---

## Task 2: ChatView — selector Conversaciones|Productos + responder

**Files:**
- Modify: `gastos-app/src/gastos/ChatView.jsx` (reescritura completa abajo)
- Test: `gastos-app/tests/gastos/ChatView.test.jsx` (nuevo)

- [ ] **Step 1: Write the failing test** — crear `gastos-app/tests/gastos/ChatView.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatView from '../../src/gastos/ChatView';
import { api } from '../../src/gastos/api';

jest.mock('../../src/gastos/api', () => ({
  api: {
    chatConversaciones: jest.fn(),
    chatMensajes: jest.fn(),
    listProducts: jest.fn(),
    getPedidoConfig: jest.fn(),
    pedidoFromCatalog: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  api.chatConversaciones.mockResolvedValue([{ channel: 'whatsapp', contact: 'Ana', ultimo: 'hola', n: 1 }]);
  api.chatMensajes.mockResolvedValue([{ text: 'Hola, quiero 2 tortas' }]);
  api.listProducts.mockResolvedValue([]);
  api.getPedidoConfig.mockResolvedValue({ iva_incluido: true });
});

test('el selector Conversaciones|Productos está presente y "Productos" abre el catálogo', async () => {
  render(<ChatView />);
  await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /Conversaciones/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Productos$/i }));
  // ProductosView con catálogo vacío muestra su mensaje
  await waitFor(() => expect(screen.getByText(/Aún no tienes productos/i)).toBeInTheDocument());
});

test('en una conversación, responder abre WhatsApp con el texto y lo muestra en el hilo', async () => {
  const openSpy = jest.spyOn(window, 'open').mockImplementation(() => ({}));
  render(<ChatView />);
  await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Ana'));                       // abrir conversación
  await waitFor(() => expect(screen.getByText('Hola, quiero 2 tortas')).toBeInTheDocument());

  fireEvent.change(screen.getByPlaceholderText('Escribe una respuesta…'), { target: { value: 'Son $20.000' } });
  fireEvent.click(screen.getByRole('button', { name: /Responder por WhatsApp/i }));

  expect(openSpy).toHaveBeenCalled();
  const url = openSpy.mock.calls[0][0];
  expect(url).toContain('wa.me');
  expect(url).toContain(encodeURIComponent('Son $20.000'));
  expect(screen.getByText('Son $20.000')).toBeInTheDocument();    // aparece en el hilo
  openSpy.mockRestore();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos-app" && npx jest tests/gastos/ChatView.test.jsx`
Expected: FAIL — no existe el selector ni el placeholder de respuesta.

- [ ] **Step 3: Write minimal implementation** — REEMPLAZAR el contenido completo de `gastos-app/src/gastos/ChatView.jsx` por:

```jsx
import { useEffect, useState } from 'react';
import { api } from './api';
import PedidoBuilder from './pedido/PedidoBuilder';
import ProductosView from './ProductosView.jsx';

const plugin = () => (window && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AtikoPedido) || null;
const GOLD = '#C9A24B';
const CANALES = {
  whatsapp: { ic: '🟢', n: 'WhatsApp' },
  messenger: { ic: '🔵', n: 'Messenger' },
  instagram: { ic: '🟣', n: 'Instagram' },
  telegram: { ic: '🔷', n: 'Telegram' },
  compartido: { ic: '🔗', n: 'Compartido' },
};

function waPhone(contact) {
  const d = String(contact || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('56') && d.length >= 11) return d.slice(0, 11);
  if (d.length === 9 && d.startsWith('9')) return '56' + d;
  if (d.length === 8) return '569' + d;
  return null;
}
function waLinkLocal(text, contact) {
  const enc = encodeURIComponent(String(text || ''));
  const p = waPhone(contact);
  return p ? `https://wa.me/${p}?text=${enc}` : `https://wa.me/?text=${enc}`;
}
function abrir(url) { try { window.open(url, '_blank'); } catch (_e) { window.location.href = url; } }

function Conversacion({ conv, onBack }) {
  const [msgs, setMsgs] = useState(null);
  const [armando, setArmando] = useState(false);
  const [reply, setReply] = useState('');
  const [mias, setMias] = useState([]);

  useEffect(() => {
    api.chatMensajes(conv.channel, conv.contact).then((r) => setMsgs(Array.isArray(r) ? r : [])).catch(() => setMsgs([]));
  }, [conv]);

  function responder() {
    const t = reply.trim();
    if (!t) return;
    abrir(waLinkLocal(t, conv.contact));
    setMias((xs) => [...xs, { text: t }]);
    setReply('');
  }

  if (armando) return <PedidoBuilder channel={conv.channel} contact={conv.contact} onClose={() => setArmando(false)} />;
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 pb-2 shrink-0 flex items-center gap-2 border-b">
        <button onClick={onBack} className="text-base font-black" style={{ color: GOLD }}>←</button>
        <div className="font-black truncate">{conv.contact || 'Sin nombre'}</div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 grid gap-2 content-start">
        {msgs === null ? <div className="opacity-60 text-sm">Cargando…</div>
          : (msgs.length === 0 && mias.length === 0) ? <div className="opacity-60 text-sm">Sin mensajes capturados aún.</div>
            : (
              <>
                {msgs.map((m, i) => <div key={'r' + i} className="justify-self-start max-w-[85%] rounded-xl bg-black/5 p-2 text-sm whitespace-pre-wrap">{m.text}</div>)}
                {mias.map((m, i) => <div key={'m' + i} className="justify-self-end max-w-[85%] rounded-xl p-2 text-sm text-black whitespace-pre-wrap" style={{ background: GOLD }}>{m.text}</div>)}
              </>
            )}
      </div>
      <div className="p-3 shrink-0 border-t grid gap-2">
        <div className="flex items-center gap-2">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') responder(); }}
            placeholder="Escribe una respuesta…"
            className="flex-1 rounded-xl border px-3 py-2 text-sm"
          />
          <button onClick={responder} disabled={!reply.trim()} className="rounded-xl font-black px-3 py-2 text-white disabled:opacity-40 text-sm" style={{ background: '#16A34A' }}>Responder por WhatsApp</button>
        </div>
        <button onClick={() => setArmando(true)} className="w-full rounded-xl font-black py-3 text-black" style={{ background: GOLD }}>🧾 Crear pedido</button>
      </div>
    </div>
  );
}

export default function ChatView() {
  const [vista, setVista] = useState('conversaciones');
  const [convs, setConvs] = useState(null);
  const [sel, setSel] = useState(null);
  const [notif, setNotif] = useState(true);

  function load() {
    api.chatConversaciones().then((r) => setConvs(Array.isArray(r) ? r : [])).catch(() => setConvs([]));
  }
  async function checkPerms() {
    const p = plugin();
    if (!p) return;
    try { const s = await p.status(); setNotif(!!s.notificationAccess); } catch (_e) { /* noop */ }
  }
  useEffect(() => {
    load(); checkPerms();
    const onFocus = () => { load(); checkPerms(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  if (sel) return <Conversacion conv={sel} onBack={() => { setSel(null); load(); }} />;

  const segBtn = (key, label) => (
    <button
      onClick={() => setVista(key)}
      className={`flex-1 rounded-lg py-1.5 text-xs font-black ${vista === key ? 'text-black' : 'text-neutral-500'}`}
      style={{ background: vista === key ? GOLD : '#00000010' }}
    >{label}</button>
  );

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 pb-2 shrink-0">
        <h2 className="text-xl font-black" style={{ color: GOLD }}>Chat</h2>
        <div className="flex gap-2 mt-2">
          {segBtn('conversaciones', 'Conversaciones')}
          {segBtn('productos', 'Productos')}
        </div>
      </div>

      {vista === 'productos' ? (
        <div className="flex-1 min-h-0 overflow-y-auto"><ProductosView /></div>
      ) : (
        <>
          {plugin() && !notif ? (
            <div className="mx-4 mb-2 rounded-xl border p-3 shrink-0" style={{ borderColor: GOLD }}>
              <div className="font-bold text-sm mb-1">Activa la captura de chats</div>
              <p className="text-xs opacity-70 mb-2">Permite que Hash IA lea los mensajes que te llegan, para llenar la bandeja sola.</p>
              <button onClick={async () => { try { await plugin().openNotificationAccessSettings(); } catch (_e) { /* noop */ } }} className="rounded-lg font-black text-black px-3 py-1.5 text-xs" style={{ background: GOLD }}>Activar notificaciones</button>
            </div>
          ) : null}

          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 grid gap-2 content-start">
            {convs === null ? <div className="opacity-60 text-sm">Cargando…</div>
              : convs.length === 0 ? (
                <div className="opacity-60 text-sm">
                  Aún no hay conversaciones. Activa la captura arriba, o en WhatsApp mantén presionado un mensaje → <b>Compartir</b> → <b>Hash IA</b>.
                </div>
              ) : convs.map((c, i) => {
                const ca = CANALES[c.channel] || CANALES.compartido;
                return (
                  <button key={i} onClick={() => setSel(c)} className="text-left rounded-xl border p-3 flex items-center gap-3">
                    <span className="text-lg">{ca.ic}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold truncate">{c.contact || 'Sin nombre'} <span className="text-[10px] opacity-50">· {ca.n}</span></div>
                      <div className="text-xs opacity-60 truncate">{c.ultimo}</div>
                    </div>
                    <span className="text-[10px] opacity-50">{c.n}</span>
                  </button>
                );
              })}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos-app" && npx jest tests/gastos/ChatView.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 5: GUARD then commit**

```bash
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112" && git rev-parse --show-toplevel && git branch --show-current && git add gastos-app/src/gastos/ChatView.jsx gastos-app/tests/gastos/ChatView.test.jsx && git commit -m "feat(chat): selector Conversaciones|Productos + responder por WhatsApp"
```

---

## Task 3: Verificación final (suite + build)

**Files:** (sin cambios; verificación)

- [ ] **Step 1: Suite app completa**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos-app" && npx jest`
Expected: PASS — incluye GastosApp, ChatView, sin regresiones.

- [ ] **Step 2: Build de la app**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos-app" && npm run build`
Expected: build OK sin errores.

---

## Notas de despliegue (NO en este plan; con el usuario después)
- Deploy de TODO junto (KALY + Chat v2): rebuild APK (`npm run build && npx cap sync android && gradlew assembleDebug`) con bump de versión (→ v3.2) + subir con `upload-apk-wt.js`. Solo app; sin backend.

## Self-review (hecho)
- **Cobertura del spec:** quitar pestaña Productos ✅(T1); selector Conversaciones|Productos + ProductosView dentro de Chat ✅(T2); caja de respuesta → wa.me (window.open + fallback) + mostrar en hilo `mias` ✅(T2); detección teléfono chileno en `waPhone`/`waLinkLocal` ✅; mantener Crear pedido → PedidoBuilder ✅(T2); solo frontend ✅; audio/archivos/in-app fuera ✅ (no se implementan). Tests RTL ✅.
- **Sin placeholders:** código completo (ChatView.jsx íntegro + ediciones puntuales de GastosApp).
- **Consistencia:** `waLinkLocal(text, contact)` definido y usado en `responder`; el placeholder `"Escribe una respuesta…"` y el botón `"Responder por WhatsApp"` coinciden entre componente y test; ProductosView mensaje vacío `"Aún no tienes productos"` (existente) usado en el assert del test; `api` mock incluye listProducts/getPedidoConfig para que ProductosView/PedidoBuilder no rompan al montarse.
