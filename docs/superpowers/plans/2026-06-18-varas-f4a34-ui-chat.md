# VARAS — F4a-3/4: UI del chat (app + panel) — Plan

**Fecha:** 2026-06-18
**Repo:** `HASH IA\` (canónico, rama master)
**Spec:** `docs/superpowers/specs/2026-06-16-varas-f4-conversacional-design.md` §3.5
**Precondición:** F4a-1 (cerebro+tools) y F4a-2 (Gemini+acciones+endpoints) HECHAS y verdes (386 tests).
Endpoints ya existen: `POST /api/app/varas/chat` y `/api/app/varas/accion` (app) y los equivalentes en panel (`/api/panel/varas/*`, requireKind('user')).
Respuesta de `/varas/chat`: `{ reply, accionPropuesta? }` donde `accionPropuesta = { tipo, args, descripcion }`.
`/varas/accion` body `{ tipo, args }` → `{ ok, ... }`.

## Objetivo
Que el dueño escriba a VARAS (texto) desde la app y el panel, vea las respuestas en burbujas,
y cuando VARAS proponga una acción aparezca un botón **Confirmar** que llama `/varas/accion`.

---

## Task 1 — App: api.js métodos VARAS chat
**Archivo:** `gastos-app/src/gastos/api.js`
Agregar bajo la sección "VARAS — asientos manuales":
```js
  // VARAS — chat conversacional
  varasChat(messages) { return req('/api/app/varas/chat', { method: 'POST', body: { messages } }); },
  varasAccion(tipo, args) { return req('/api/app/varas/accion', { method: 'POST', body: { tipo, args } }); },
```
**Test:** en el archivo de tests de api de la app (buscar `gastos-app/src/gastos/__tests__` o `*.test.js`),
agregar 2 casos con `fetch` mockeado: `varasChat([{role:'user',text:'hola'}])` hace POST a `/api/app/varas/chat`
con el body correcto y retorna `{reply}`; `varasAccion('marcar_pagado',{descripcion:'x'})` POST a `/api/app/varas/accion`.
Si no hay test de api previo, crear `gastos-app/src/gastos/__tests__/api.varas.test.js` siguiendo el patrón de mock de fetch del repo.
TDD: test → falla → implementa → verde. Commit `feat(varas-f4): api.js varasChat/varasAccion (app)`.

## Task 2 — App: componente VarasChat + pestaña en el hub
**Archivos:** crear `gastos-app/src/gastos/VarasChat.jsx`; modificar `gastos-app/src/gastos/ContabilidadView.jsx`.
- `VarasChat.jsx`: componente de chat.
  - Estado: `mensajes` (array `{role:'user'|'varas', text}`), `input`, `busy`, `accion` (la accionPropuesta pendiente o null).
  - Mensaje de bienvenida inicial de VARAS (p.ej. "Soy VARAS, tu controlador financiero. Pregúntame por tus saldos, deudas, flujo o consumo de insumos.").
  - Enviar: agrega la burbuja del usuario, llama `api.varasChat(historialParaApi)` donde historial = mensajes mapeados a `{role, text}` (role 'varas' → 'assistant' para la API; revisar qué espera el cerebro: el cerebro espera `{role, text}` con role 'user'/'assistant' — usar 'assistant' para VARAS). Al volver: agrega burbuja VARAS con `reply`; si viene `accionPropuesta`, set `accion`.
  - Burbujas: usuario alineado a la derecha (fondo ORO suave), VARAS a la izquierda. Auto-scroll al fondo.
  - Si `accion`: tarjeta con `accion.descripcion` + botón **Confirmar** (llama `api.varasAccion(accion.tipo, accion.args)`, al ok agrega burbuja VARAS "✓ Hecho." y limpia `accion`) + botón **Cancelar** (limpia `accion`).
  - Manejo de error: burbuja "No pude procesar eso, intenta de nuevo."
  - Reusa `ORO = '#C9A24B'`.
- `ContabilidadView.jsx`: agregar `{ id: 'varas', label: 'VARAS' }` como **primer** tab en `TABS`, render `<VarasChat />` cuando `tab === 'varas'`. Ajustar el `useEffect` para que `varas` (como `concil`/`manual`) haga `setData(null); return;` (no carga reportes).
**Test:** `gastos-app/src/gastos/__tests__/VarasChat.test.jsx` (RTL + jsdom). Mockear `./api`:
`varasChat` resuelve `{reply:'Tu saldo en banco es $100.000.'}` en un caso y `{reply:'Voy a marcar pagado.', accionPropuesta:{tipo:'marcar_pagado',args:{descripcion:'Proveedor X'},descripcion:'Marcar pagada la cuenta de Proveedor X'}}` en otro.
Casos: (a) escribe y envía → aparece la burbuja del usuario y luego el reply de VARAS; (b) cuando hay accionPropuesta aparece el botón "Confirmar"; al hacer click llama `varasAccion` con el tipo correcto y muestra confirmación.
TDD. Commit `feat(varas-f4): chat de VARAS en la app (pestaña VARAS + confirmar acción)`.

## Task 3 — Panel: api + UI chat VARAS
**Archivos:** `gastos/public/panel/api.js` (o donde el panel define sus llamadas — revisar `lib.js`), `gastos/public/panel/lib.js`, `gastos/public/panel/index.html`.
- Añadir helpers `varasChat(messages)` y `varasAccion(tipo,args)` apuntando a `/api/panel/varas/chat` y `/api/panel/varas/accion` (revisar cómo el panel hace fetch con token — seguir el patrón existente de otras llamadas panel).
- En la pestaña **Contabilidad** del panel, agregar una sub-sección/atajo "VARAS" con: un contenedor de mensajes, un input + botón Enviar, y el manejo de `accionPropuesta` con botón Confirmar. Seguir el estilo vanilla-JS del panel (funciones que construyen HTML + listeners, como `conciliacionHtml`/`diarioTableHtml`).
- Mantener verde la suite de panel (jsdom). Agregar test(s) en la carpeta de tests del panel (buscar `gastos/tests/panel` o `*.test.js` del panel) que cubran: el helper hace fetch a la ruta correcta; render del chat agrega burbuja y muestra Confirmar ante accionPropuesta (si el patrón de tests del panel lo permite; si es muy DOM-pesado, al menos cubrir los helpers de api y la función que arma el HTML del chat).
TDD donde sea testeable. Commit `feat(varas-f4): chat de VARAS en el panel web`.

## Task 4 — Cierre
- `cd gastos && npx jest` → toda la suite backend verde.
- `cd gastos-app && npx jest` (o el runner de la app) → verde.
- Suite del panel verde.
- `cd gastos-app && npm run build` → build OK.
- Subir `APP_VERSION` en `gastos-app/src/gastos/version.js` (de v3.11 → v3.12) y `versionCode`/etiqueta del APK si corresponde (build.gradle versionName se queda; el visible es version.js).
- Commit `chore(varas-f4): cierre F4a-3/4 (suites verdes + build + version bump)`.

## Notas
- Multi-tenant: los endpoints ya scopean por empresa vía JWT; la UI no maneja company_id.
- Inyectabilidad: en tests se mockea `./api` (app) o `fetch` (panel); nunca red real.
- No romper lo existente: additivo (nueva pestaña + métodos). No tocar KALY, reportes, manual, auxiliares.
