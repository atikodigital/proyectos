# Fase 4d — Panel web (React + 21st.dev) · Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) o subagent-driven-development. Checkboxes para tracking.

**Goal:** Panel web (SPA) donde se ven, crean, aprueban y programan contenidos en un layout híbrido (sidebar de clientes + Calendario/Lista), conectado a las APIs del agente, servido en `/panel`.

**Architecture:** App nueva `panel/` (Vite + React + TypeScript + Tailwind). Cliente de API tipado (`api.ts`) como única puerta al backend. Componentes en Tailwind; sidebar premium de 21st.dev. Build estático servido por Express en `/panel`. Unit tests con Vitest para la lógica pura (api, status).

**Tech Stack:** Vite, React 18, TypeScript, Tailwind CSS, Vitest, componentes 21st.dev. Backend ya existente (`/api/content`, `/api/reels/generate`, `/api/posts/generate`).

---

## Estructura de archivos

```
panel/
├── package.json, vite.config.ts, tailwind.config.js, index.html
├── src/
│   ├── main.tsx, index.css
│   ├── api.ts                 ← cliente tipado (listContent, createContent, approve, schedule, generateReel, generatePost)
│   ├── lib/status.ts          ← STATUS_META (color/label por estado)
│   ├── App.tsx                ← shell híbrido (sidebar + topbar + vista activa)
│   ├── components/
│   │   ├── Sidebar.tsx        ← 21st sidebar colapsable (clientes + vistas)
│   │   ├── ContentCard.tsx
│   │   ├── ListView.tsx
│   │   ├── CalendarView.tsx
│   │   ├── ContentDetail.tsx
│   │   └── CreateDialog.tsx
│   └── tests/ (api.test.ts, status.test.ts)
agent/server.js               ← servir panel/dist en /panel
```

**Contratos compartidos:**
- `ContentItem`: `{ id, clientId, format, network, mediaUrl, caption, hashtags, status, scheduledAt, publishedAt, error, createdAt }` (espejo de la API 4a).
- Estados: `draft|approved|scheduled|publishing|published|failed`.

---

## Task 0: Scaffold Vite + React + TS + Tailwind

**Files:** Create `panel/` (vía Vite), `panel/tailwind.config.js`, `panel/src/index.css`.

- [ ] **Step 1: Crear la app**

Run desde la raíz del repo:
```bash
npm create vite@latest panel -- --template react-ts
cd panel && npm install && npm install -D tailwindcss@^3 postcss autoprefixer vitest jsdom @testing-library/react && npx tailwindcss init -p
```
Expected: crea `panel/` con React+TS y deps instaladas.

- [ ] **Step 2: Configurar Tailwind** — `panel/tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
```

- [ ] **Step 3: `panel/src/index.css`** (reemplazar todo):
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
:root { color-scheme: dark; }
body { margin: 0; background: #0b1220; color: #e6edf7; font-family: Inter, system-ui, Arial, sans-serif; }
```

- [ ] **Step 4: Script de test** — en `panel/package.json` scripts añade `"test": "vitest run"`. Configura Vitest en `vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "/panel/",
  plugins: [react()],
  test: { environment: "jsdom" },
});
```

- [ ] **Step 5: Verificar build + commit**

Run: `cd panel && npm run build`
Expected: genera `panel/dist/` sin errores.
```bash
git add panel/ -- ':!panel/node_modules' && echo "panel/node_modules/\npanel/dist/" >> ../.gitignore && git commit -m "chore(panel): scaffold vite react ts + tailwind"
```

---

## Task 1: Cliente de API tipado (`api.ts`)

**Files:** Create `panel/src/api.ts`, `panel/src/tests/api.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// panel/src/tests/api.test.ts
import { test, expect, vi } from "vitest";
import { listContent, createContent, scheduleContent } from "../api";

test("listContent fetches and returns items", async () => {
  const items = [{ id: "1", status: "draft" }];
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, items }) }) as any;
  const r = await listContent({ clientId: "atiko" });
  expect(r).toEqual(items);
  expect((global.fetch as any).mock.calls[0][0]).toContain("/api/content?clientId=atiko");
});

test("createContent posts the body", async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, item: { id: "9" } }) }) as any;
  const r = await createContent({ clientId: "a", format: "reel", network: "instagram", mediaUrl: "/x.mp4", caption: "c", hashtags: [] });
  expect(r.id).toBe("9");
  const call = (global.fetch as any).mock.calls[0];
  expect(call[1].method).toBe("POST");
});

test("scheduleContent posts scheduledAt", async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, item: { id: "9", status: "scheduled" } }) }) as any;
  const r = await scheduleContent("9", "2026-06-12T18:00:00Z");
  expect(r.status).toBe("scheduled");
  expect((global.fetch as any).mock.calls[0][0]).toContain("/api/content/9/schedule");
});
```

- [ ] **Step 2: Run** `cd panel && npx vitest run src/tests/api.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

```ts
// panel/src/api.ts
export type Status = "draft" | "approved" | "scheduled" | "publishing" | "published" | "failed";
export interface ContentItem {
  id: string; clientId: string; format: string; network: string;
  mediaUrl: string | null; caption: string | null; hashtags: string[];
  status: Status; scheduledAt: string | null; publishedAt: string | null;
  error: string | null; createdAt: string;
}

const BASE = ""; // mismo origen (servido en /panel por el agente)

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(BASE + url, init);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || ("HTTP " + res.status));
  return data;
}
function postJson(url: string, body?: unknown) {
  return jsonFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
}

export async function listContent(q: { clientId?: string; status?: string } = {}): Promise<ContentItem[]> {
  const params = new URLSearchParams();
  if (q.clientId) params.set("clientId", q.clientId);
  if (q.status) params.set("status", q.status);
  const qs = params.toString();
  const data = await jsonFetch("/api/content" + (qs ? "?" + qs : ""));
  return data.items;
}
export async function createContent(item: Partial<ContentItem>): Promise<ContentItem> {
  return (await postJson("/api/content", item)).item;
}
export async function approveContent(id: string): Promise<ContentItem> {
  return (await postJson("/api/content/" + id + "/approve")).item;
}
export async function scheduleContent(id: string, scheduledAt: string): Promise<ContentItem> {
  return (await postJson("/api/content/" + id + "/schedule", { scheduledAt })).item;
}
export async function generateReel(topic: string, opts: { style?: string } = {}): Promise<{ publicUrl: string; caption: string; hashtags: string[] }> {
  return await postJson("/api/reels/generate", { topic, ...opts });
}
export async function generatePost(topic: string, format: string): Promise<{ imageUrls: string[]; caption: string; hashtags: string[] }> {
  return await postJson("/api/posts/generate", { topic, format });
}
```

- [ ] **Step 4: Run** → PASS (3 tests). **Commit** `feat(panel): typed API client`.

---

## Task 2: Estados (`lib/status.ts`)

**Files:** Create `panel/src/lib/status.ts`, `panel/src/tests/status.test.ts`.

- [ ] **Step 1: Test**

```ts
// panel/src/tests/status.test.ts
import { test, expect } from "vitest";
import { STATUS_META, statusMeta } from "../lib/status";

test("every status has color and label", () => {
  for (const s of ["draft","approved","scheduled","publishing","published","failed"] as const) {
    expect(STATUS_META[s].label.length).toBeGreaterThan(0);
    expect(STATUS_META[s].dot).toMatch(/^#/);
  }
});
test("statusMeta falls back for unknown", () => {
  expect(statusMeta("???").label).toBe("Desconocido");
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar**

```ts
// panel/src/lib/status.ts
export const STATUS_META: Record<string, { label: string; dot: string; chip: string }> = {
  draft:      { label: "Borrador",   dot: "#8aa0c2", chip: "bg-slate-700/40 text-slate-300" },
  approved:   { label: "Aprobado",   dot: "#7e5bef", chip: "bg-violet-700/30 text-violet-300" },
  scheduled:  { label: "Programado", dot: "#3b6fd4", chip: "bg-blue-700/30 text-blue-300" },
  publishing: { label: "Publicando", dot: "#e0a33b", chip: "bg-amber-700/30 text-amber-300" },
  published:  { label: "Publicado",  dot: "#3bd47e", chip: "bg-emerald-700/30 text-emerald-300" },
  failed:     { label: "Fallido",    dot: "#e0533b", chip: "bg-red-700/30 text-red-300" },
};
export function statusMeta(s: string) {
  return STATUS_META[s] || { label: "Desconocido", dot: "#888", chip: "bg-slate-700/40 text-slate-300" };
}
```

- [ ] **Step 4: Run** → PASS. **Commit** `feat(panel): status metadata`.

---

## Task 3: Shell + Sidebar (21st.dev)

**Files:** Create `panel/src/components/Sidebar.tsx`, modify `panel/src/App.tsx`, `panel/src/main.tsx`.

- [ ] **Step 1: Traer el sidebar de 21st.dev** — usar la herramienta `mcp__magic__21st_magic_component_builder` con searchQuery "collapsible dashboard sidebar" y standaloneRequestQuery describiendo: sidebar colapsable, sección CLIENTES (lista) y VISTAS (Calendario/Lista), tema oscuro. Integrar el snippet como `Sidebar.tsx`. **Fallback completo** (si no se usa 21st), `Sidebar.tsx`:

```tsx
import React from "react";
const clients = ["Atiko Digital", "CASA LUXE", "Dulmom"];
const views = [{ id: "calendar", label: "🗓️ Calendario" }, { id: "list", label: "📃 Lista" }];
export function Sidebar({ client, setClient, view, setView }:{
  client: string; setClient: (c: string)=>void; view: string; setView: (v: string)=>void;
}) {
  return (
    <aside className="w-52 shrink-0 border-r border-slate-800 bg-[#0e1729] p-3">
      <div className="flex items-center gap-2 px-1 mb-5">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500" />
        <b className="text-white">Atiko</b>
      </div>
      <div className="text-[10px] tracking-widest text-slate-500 px-1 mb-2">CLIENTES</div>
      {clients.map((c) => (
        <button key={c} onClick={() => setClient(c)}
          className={"w-full text-left flex items-center gap-2 px-2 py-2 rounded-lg mb-1 text-sm " + (client===c?"bg-blue-600/30 text-white":"text-slate-300 hover:bg-slate-800")}>
          <span className="w-4 h-4 rounded bg-slate-600" />{c}
        </button>
      ))}
      <div className="text-[10px] tracking-widest text-slate-500 px-1 mt-5 mb-2">VISTAS</div>
      {views.map((v) => (
        <button key={v.id} onClick={() => setView(v.id)}
          className={"w-full text-left px-2 py-2 rounded-lg mb-1 text-sm " + (view===v.id?"bg-slate-800 text-white":"text-slate-300 hover:bg-slate-800")}>
          {v.label}
        </button>
      ))}
    </aside>
  );
}
```

- [ ] **Step 2: `App.tsx`** (shell + topbar + router de vistas):

```tsx
import React, { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { ListView } from "./components/ListView";
import { CalendarView } from "./components/CalendarView";
import { CreateDialog } from "./components/CreateDialog";
import { ContentDetail } from "./components/ContentDetail";
import { listContent, ContentItem } from "./api";

export default function App() {
  const [client, setClient] = useState("Atiko Digital");
  const [view, setView] = useState("list");
  const [items, setItems] = useState<ContentItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ContentItem | null>(null);

  async function refresh() { setItems(await listContent()); }
  useEffect(() => { refresh(); }, []);

  return (
    <div className="flex min-h-screen">
      <Sidebar client={client} setClient={setClient} view={view} setView={setView} />
      <main className="flex-1 p-5">
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-1 bg-[#0e1729] rounded-xl p-1">
            {[["list","Lista"],["calendar","Calendario"]].map(([id,label]) => (
              <button key={id} onClick={() => setView(id)}
                className={"text-sm px-3 py-1.5 rounded-lg " + (view===id?"bg-blue-600 text-white":"text-slate-300")}>{label}</button>
            ))}
          </div>
          <button onClick={() => setCreating(true)}
            className="text-sm font-semibold px-4 py-2 rounded-lg text-white bg-gradient-to-br from-blue-500 to-violet-500">+ Crear contenido</button>
        </div>
        {view === "list"
          ? <ListView items={items} onSelect={setSelected} />
          : <CalendarView items={items} onSelect={setSelected} />}
      </main>
      {creating && <CreateDialog onClose={() => setCreating(false)} onCreated={() => { setCreating(false); refresh(); }} />}
      {selected && <ContentDetail item={selected} onClose={() => setSelected(null)} onChanged={() => { refresh(); }} />}
    </div>
  );
}
```

`main.tsx` asegúrate que importe `./index.css` y monte `<App/>`.

- [ ] **Step 3: Commit** `feat(panel): app shell + sidebar (21st)`.

---

## Task 4: ContentCard + ListView

**Files:** Create `panel/src/components/ContentCard.tsx`, `panel/src/components/ListView.tsx`.

- [ ] **Step 1: `ContentCard.tsx`**

```tsx
import React from "react";
import { ContentItem } from "../api";
import { statusMeta } from "../lib/status";
const ICON: Record<string,string> = { reel:"🎬", post:"🖼️", carousel:"🖼️", story:"📲" };
export function ContentCard({ item, onClick }:{ item: ContentItem; onClick: ()=>void }) {
  const m = statusMeta(item.status);
  return (
    <button onClick={onClick} className="w-full text-left bg-[#0e1729] hover:bg-[#13203a] border border-slate-800 rounded-xl p-3 flex gap-3 items-center">
      <span className="text-xl">{ICON[item.format] || "📄"}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-slate-100 truncate">{item.caption || "(sin caption)"}</span>
        <span className="block text-xs text-slate-500">{item.network} · {item.format}{item.scheduledAt ? " · " + new Date(item.scheduledAt).toLocaleString() : ""}</span>
      </span>
      <span className={"text-xs px-2 py-1 rounded-full whitespace-nowrap " + m.chip}>● {m.label}</span>
    </button>
  );
}
```

- [ ] **Step 2: `ListView.tsx`**

```tsx
import React from "react";
import { ContentItem } from "../api";
import { ContentCard } from "./ContentCard";
export function ListView({ items, onSelect }:{ items: ContentItem[]; onSelect:(i:ContentItem)=>void }) {
  if (!items.length) return <p className="text-slate-500">Aún no hay contenido. Crea el primero con “+ Crear contenido”.</p>;
  return <div className="grid gap-2">{items.map((it) => <ContentCard key={it.id} item={it} onClick={() => onSelect(it)} />)}</div>;
}
```

- [ ] **Step 3: Commit** `feat(panel): content card + list view`.

---

## Task 5: CreateDialog (generar → crear item)

**Files:** Create `panel/src/components/CreateDialog.tsx`.

- [ ] **Step 1: Implementar**

```tsx
import React, { useState } from "react";
import { generateReel, generatePost, createContent } from "../api";

const FORMATS = [["reel","🎬 Reel"],["post","🖼️ Post"],["carousel","🖼️ Carrusel"],["story","📲 Historia"]];
const NETWORKS = [["instagram","Instagram"],["facebook","Facebook"]];

export function CreateDialog({ onClose, onCreated }:{ onClose:()=>void; onCreated:()=>void }) {
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState("reel");
  const [network, setNetwork] = useState("instagram");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!topic.trim()) return;
    setBusy(true); setError(null);
    try {
      let mediaUrl: string, caption: string, hashtags: string[];
      if (format === "reel") {
        const r = await generateReel(topic); mediaUrl = r.publicUrl; caption = r.caption; hashtags = r.hashtags;
      } else {
        const r = await generatePost(topic, format); mediaUrl = r.imageUrls[0]; caption = r.caption; hashtags = r.hashtags;
      }
      await createContent({ clientId: "atiko", format, network, mediaUrl, caption, hashtags });
      onCreated();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0e1729] border border-slate-800 rounded-2xl p-5 w-full max-w-md" onClick={(e)=>e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-3">Crear contenido</h3>
        <label className="text-xs text-slate-400">Tema</label>
        <textarea value={topic} onChange={(e)=>setTopic(e.target.value)} rows={2}
          placeholder="5 errores al vender por WhatsApp"
          className="w-full mt-1 mb-3 bg-[#0b1220] border border-slate-700 rounded-lg p-2 text-sm" />
        <div className="flex gap-3 mb-3">
          <div className="flex-1"><label className="text-xs text-slate-400">Formato</label>
            <select value={format} onChange={(e)=>setFormat(e.target.value)} className="w-full mt-1 bg-[#0b1220] border border-slate-700 rounded-lg p-2 text-sm">
              {FORMATS.map(([v,l])=> <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="flex-1"><label className="text-xs text-slate-400">Red</label>
            <select value={network} onChange={(e)=>setNetwork(e.target.value)} className="w-full mt-1 bg-[#0b1220] border border-slate-700 rounded-lg p-2 text-sm">
              {NETWORKS.map(([v,l])=> <option key={v} value={v}>{l}</option>)}</select></div>
        </div>
        {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-2 rounded-lg text-slate-300">Cancelar</button>
          <button onClick={submit} disabled={busy} className="text-sm font-semibold px-4 py-2 rounded-lg text-white bg-gradient-to-br from-blue-500 to-violet-500 disabled:opacity-50">
            {busy ? "Generando…" : "Generar"}</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit** `feat(panel): create dialog (generate -> content item)`.

---

## Task 6: CalendarView (semana)

**Files:** Create `panel/src/components/CalendarView.tsx`.

- [ ] **Step 1: Implementar** (semana actual lun-dom; cada item programado en su día)

```tsx
import React from "react";
import { ContentItem } from "../api";
import { statusMeta } from "../lib/status";

function startOfWeek(d: Date) { const x = new Date(d); const day = (x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; }

export function CalendarView({ items, onSelect }:{ items: ContentItem[]; onSelect:(i:ContentItem)=>void }) {
  const week = startOfWeek(new Date());
  const days = Array.from({length:7}, (_,i) => { const d = new Date(week); d.setDate(d.getDate()+i); return d; });
  const byDay = (d: Date) => items.filter((it) => it.scheduledAt && new Date(it.scheduledAt).toDateString() === d.toDateString());
  const names = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d,i) => (
        <div key={i} className="bg-[#0e1729] rounded-xl p-2 min-h-[220px]">
          <div className="text-[11px] text-slate-500 mb-2">{names[i]} {d.getDate()}</div>
          {byDay(d).map((it) => { const m = statusMeta(it.status); return (
            <button key={it.id} onClick={() => onSelect(it)} className="w-full text-left rounded-lg p-2 mb-1 bg-[#15233f]" style={{ borderLeft: "3px solid " + m.dot }}>
              <div className="text-[10px] text-slate-400">{new Date(it.scheduledAt!).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</div>
              <div className="text-[11px] text-slate-200 truncate">{it.caption || it.format}</div>
            </button>
          ); })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit** `feat(panel): week calendar view`.

---

## Task 7: ContentDetail (preview + aprobar + programar)

**Files:** Create `panel/src/components/ContentDetail.tsx`.

- [ ] **Step 1: Implementar**

```tsx
import React, { useState } from "react";
import { ContentItem, approveContent, scheduleContent } from "../api";
import { statusMeta } from "../lib/status";

export function ContentDetail({ item, onClose, onChanged }:{ item: ContentItem; onClose:()=>void; onChanged:()=>void }) {
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const m = statusMeta(item.status);
  const isVideo = item.format === "reel";

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setErr(null);
    try { await fn(); onChanged(); onClose(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0e1729] border-l border-slate-800 h-full p-5 overflow-auto" onClick={(e)=>e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <span className={"text-xs px-2 py-1 rounded-full " + m.chip}>● {m.label}</span>
          <button onClick={onClose} className="text-slate-400">✕</button>
        </div>
        {item.mediaUrl && (isVideo
          ? <video src={item.mediaUrl} controls className="w-full rounded-xl bg-black mb-3" />
          : <img src={item.mediaUrl} className="w-full rounded-xl mb-3" />)}
        <p className="text-sm text-slate-200 whitespace-pre-wrap mb-1">{item.caption}</p>
        <p className="text-xs text-blue-300 mb-4">{(item.hashtags||[]).map(h=>"#"+h).join(" ")}</p>
        {item.error && <p className="text-red-400 text-xs mb-3">⚠ {item.error}</p>}

        {item.status === "draft" && (
          <button disabled={busy} onClick={() => run(() => approveContent(item.id))}
            className="w-full text-sm font-semibold px-4 py-2 rounded-lg text-white bg-violet-600 mb-2 disabled:opacity-50">Aprobar</button>
        )}
        {item.status === "approved" && (
          <div className="flex gap-2">
            <input type="datetime-local" value={when} onChange={(e)=>setWhen(e.target.value)}
              className="flex-1 bg-[#0b1220] border border-slate-700 rounded-lg p-2 text-sm" />
            <button disabled={busy || !when} onClick={() => run(() => scheduleContent(item.id, new Date(when).toISOString()))}
              className="text-sm font-semibold px-4 py-2 rounded-lg text-white bg-blue-600 disabled:opacity-50">Programar</button>
          </div>
        )}
        {err && <p className="text-red-400 text-xs mt-2">{err}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build de la app completa** — `cd panel && npm run build` → debe compilar sin errores TS. Arreglar imports si falta alguno.

- [ ] **Step 3: Commit** `feat(panel): content detail drawer (approve + schedule)`.

---

## Task 8: Servir en `/panel` + docs

**Files:** Modify `agent/server.js`, `agent/README.md`.

- [ ] **Step 1: Servir el build** — en `agent/server.js`, junto a los `express.static`, añadir:

```js
const path = require("path");
app.use("/panel", express.static(path.join(__dirname, "..", "panel", "dist")));
```

(El `base: "/panel/"` de vite hace que los assets carguen bien.)

- [ ] **Step 2: README** — añadir sección "🖥️ Panel web (Fase 4d)": correr `cd panel && npm run build`, abrir `http://localhost:3000/panel`. Para desarrollo: `cd panel && npm run dev` (Vite proxy a la API si hace falta).

- [ ] **Step 3: Verificar** — `cd agent && node --check server.js && echo OK`. Suite backend sigue 92/92 (el panel no la toca).

- [ ] **Step 4: Commit** `feat(panel): serve build at /panel + docs`.

---

## Notas
- Tests: solo lógica pura (api, status) con Vitest (~5). La UI se valida visualmente (build OK + abrir /panel).
- 21st.dev: el sidebar se trae con el builder en Task 3; el fallback garantiza código completo si no.
- Auth real (login portal Atiko) = fuera de v1. Kanban con drag = v1.1.
- Multi-cliente: el selector existe; v1 genera todo bajo clientId "atiko" (ajustar al integrar clientes reales).
