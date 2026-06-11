# Diseño — Fase 4d · Panel web (estilo 21st.dev)

**Fecha:** 2026-06-11
**Estado:** Diseño aprobado (validado visualmente con el companion)
**Proyecto:** atiko-agent · redes sociales (Fase 4d)
**Depende de:** APIs ya existentes — Planificador 4a (`/api/content`), motor de reels (`/api/reels/generate`), imágenes (`/api/posts/generate`).

## 1. Objetivo

La **cara visible** de la máquina: un panel web donde José/clientes **ven, crean, editan, aprueban y programan** contenido, con calendario. Consume las APIs que ya existen — no añade lógica de backend, solo la orquesta desde una UI premium.

## 2. Decisiones (brainstorming + companion visual)

- **Layout HÍBRIDO** (validado): sidebar colapsable con clientes + área que alterna **Calendario / Tablero / Lista**.
- **Look & feel premium con 21st.dev**: componentes React de 21st (sidebar dashboard colapsable confirmado disponible) + Tailwind + shadcn/ui.
- **Estados con color**: 🔵 programado · 🟡 por aprobar (draft/approved) · 🟢 publicado · 🔴 fallido.

## 3. Stack y arquitectura

- **App nueva** en carpeta `panel/` (separada de `agent/`): **Vite + React + TypeScript + Tailwind + shadcn/ui + componentes 21st.dev**.
- **Build estático** → servido por el agente Express en `/panel` (`express.static`). Mismo dominio → sin CORS extra.
- **Datos**: la SPA llama a la API del agente (`/api/content`, `/api/reels/generate`, `/api/posts/generate`). Cero estado propio en el cliente más allá de la UI.
- **Capa de datos del cliente**: un módulo `panel/src/api.ts` con funciones tipadas (listContent, createContent, approve, schedule, generateReel, generatePost) — única puerta a la API.

## 4. Vistas (v1)

```
Sidebar: logo Atiko · CLIENTES (lista) · VISTAS (Calendario/Tablero/Lista) · + Crear
Topbar:  tabs de vista + botón "Crear contenido"
Main:
  · Calendario — semana, cada content item como bloque en su scheduledAt, color por estado
  · Tablero (Kanban) — columnas Borrador/Aprobado/Programado/Publicado (drag para aprobar)
  · Lista — tabla con filtros por estado/cliente
Panel de detalle (drawer/modal): preview (video o imagen) + editar caption + Aprobar + Programar (date/time) + ver error si failed
Crear: form { tema, formato(reel|post|carousel|story), red } → genera (reel/posts API) → crea content item (draft) → aparece en el panel
```

## 5. Flujo de datos

1. **Crear**: form → `POST /api/reels/generate` o `/api/posts/generate` → obtiene mediaUrl/caption → `POST /api/content` (draft).
2. **Aprobar**: `POST /api/content/:id/approve`.
3. **Programar**: date/time picker → `POST /api/content/:id/schedule {scheduledAt}`.
4. El scheduler (4a) publica solo; el panel refleja el estado (polling cada ~30s o refetch al enfocar).

## 6. Componentes (unidades, archivos enfocados)

```
panel/
├── src/
│   ├── api.ts                 ← cliente tipado de la API del agente
│   ├── App.tsx                ← shell: layout híbrido (sidebar + topbar + router de vistas)
│   ├── components/
│   │   ├── Sidebar.tsx        ← 21st sidebar colapsable (clientes + vistas)
│   │   ├── CalendarView.tsx   ← vista semana
│   │   ├── BoardView.tsx      ← kanban por estado
│   │   ├── ListView.tsx       ← tabla
│   │   ├── ContentCard.tsx    ← tarjeta de pieza (color por estado, hora, formato)
│   │   ├── ContentDetail.tsx  ← drawer preview + aprobar + programar
│   │   └── CreateDialog.tsx   ← form de creación + estado de "generando..."
│   └── lib/status.ts          ← colores/labels por estado (espejo de la máquina de estados)
└── (vite + tailwind + shadcn config)
```

## 7. Alcance v1 / fuera de alcance

- **v1**: scaffold + sidebar + Lista + Calendario + ContentDetail (aprobar/programar) + CreateDialog. Cliente único primero (Atiko); selector multi-cliente cableado pero simple.
- **Fuera**: Kanban con drag avanzado (puede ser v1.1), auth real (v1 protegido por estar en el VPS / token simple — integrar con login Atiko luego), edición visual de escenas, analytics.

## 8. Auth (nota)

v1 asume acceso confiable (panel tras el login del portal Atiko o token `ADMIN_API_TOKEN`). La integración con el login real del portal Atiko es trabajo aparte.

## 9. Testing

Frontend: pruebas ligeras de `api.ts` (funciones de fetch con mock) y de `lib/status.ts`. El resto se valida visualmente (es UI). El backend ya está cubierto (92/92).

## 10. Próximo paso

writing-plans: scaffold Vite+Tailwind+shadcn → api.ts → shell + Sidebar (21st) → ListView → CreateDialog → CalendarView → ContentDetail → servir en `/panel`.
