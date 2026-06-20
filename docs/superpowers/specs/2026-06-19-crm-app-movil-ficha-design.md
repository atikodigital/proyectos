# CRM en la app móvil — ficha de cliente en la conversación (diseño)

**Fecha:** 2026-06-19
**Sub-proyecto 2 de 2** del CRM-chat (el 1 = panel web, ya desplegado).
**Repo:** `C:\Users\josea\Desktop\proyectos\paginas web\atiko\HASH IA\` (branch `master`, Antigravity en paralelo → `git add` específico).

## Objetivo

Al abrir una conversación en la app (APK), además del hilo y "Responder", mostrar la **ficha del cliente** (los mismos datos que en el panel web están en la columna derecha) con las acciones **Crear pedido** y **Captura**, siguiendo el protocolo de KALY. Adaptado a móvil como **panel deslizable desde la barra superior** (decisión del usuario).

## Alcance

Reusar lo que ya existe en `gastos-app/`: `ChatView.jsx` (hilo + responder + Crear pedido), `pedido/PedidoBuilder.jsx` (pedido por catálogo) y `components/EvidenceIntake.jsx` (foto/galería/captura de pantalla nativa). NO se reescriben — se integran.

Backend: montar en el **router de la app** (`/api/app`, `requireKind('employee')`, `req.auth.companyId` disponible) las 2 rutas de ficha que hoy solo existen en el panel, reusando los mismos módulos.

## Componentes y data flow

### Backend (`gastos/src/app/router.js`)
- Importar `contactosRepo` (`../chat/contactos-repo`) y `{ fichaDerivada }` (`../chat/ficha`) — `chatRepo` ya está importado.
- `GET /chat/contacto?channel&contact` → `fichaDerivada(listMensajes(...))` + merge con `contactosRepo.getContacto(db, companyId, channel, contact)`. Respuesta: `{ nombre, channel, telefono, nMensajes, primerContacto, ultimoContacto, email, ubicacion, notas }` (espejo del panel).
- `PATCH /chat/contacto` body `{ channel, contact, email?, ubicacion?, notas? }` → `contactosRepo.upsertContacto(...)` → devuelve el contacto.
- Sin tablas nuevas (la tabla `contactos` ya existe vía `CONTACTOS_DDL`).

### App API (`gastos-app/src/gastos/api.js`)
- `chatContacto(channel, contact)` → `GET /api/app/chat/contacto?...`.
- `chatContactoGuardar({ channel, contact, email, ubicacion, notas })` → `PATCH /api/app/chat/contacto`.

### App UI (`gastos-app/src/gastos/ChatView.jsx`)
- En el componente `Conversacion`: la barra superior (hoy "← Nombre") gana un indicador tocable (flecha ▾). Al tocar el nombre → estado `fichaAbierta` togglea un **panel desplegable** (slide-down, sobre el hilo) con:
  - **Derivados (solo lectura):** teléfono, canal, primer contacto, último contacto, N° mensajes.
  - **Editables:** email, ubicación, notas → botón **Guardar** (`chatContactoGuardar`).
  - **Acciones:** **🧾 Crear pedido** (abre el `PedidoBuilder` ya existente, igual que el botón actual) y **📷 Captura** (abre `EvidenceIntake`).
  - Tocar la flecha / fuera → colapsa, vuelve el hilo a pantalla completa.
- La ficha carga con `chatContacto` al abrir el panel (lazy), con estado de carga y error visible.
- La evidencia capturada con `EvidenceIntake` queda en estado local de la conversación, disponible para adjuntar al pedido (igual que en el panel; el `PedidoBuilder` ya muestra evidencia adjunta).

## Fuera de alcance (v1, YAGNI)
- No se toca el "Responder por WhatsApp" actual de la app (sigue con `wa.me`, natural en celular).
- No se envía la imagen al cliente por Cloud API desde la app (en el panel sí; en móvil la captura alimenta el pedido/KALY). Si se quiere, es un paso aparte.
- No se replica el layout de 3 columnas; es un único panel desplegable.

## Manejo de errores
- `chatContacto` falla → la ficha muestra "No se pudo cargar la ficha" (no deja stale).
- `chatContactoGuardar` falla → alerta "No se pudo guardar"; éxito → confirmación.
- Rutas backend scoped por `req.auth.companyId`; sin auth → 401 (middleware existente).

## Testing
- **Backend (pg-mem, TDD):** `tests/app/chat-contacto-route.test.js` — GET deriva+merge correcto y scoped; PATCH upserta y persiste; auth requerido.
- **App (jest + RTL):** test de `ChatView` Conversacion — la flecha abre/cierra el panel; al abrir carga datos (mock `api.chatContacto`); "Guardar" llama `api.chatContactoGuardar`; los botones Crear pedido / Captura están presentes.

## Notas de coordinación
- Antigravity edita `gastos-app` y el panel en paralelo → `git add` solo de: `gastos/src/app/router.js`, `gastos-app/src/gastos/api.js`, `gastos-app/src/gastos/ChatView.jsx`, y los archivos de test. Verificar branch+toplevel antes de commitear.
- Deploy app = bump `versionCode` en `android/app/build.gradle` + `vite build` + `npx cap sync android` + `gradlew assembleDebug` + `upload-apk-wt.js`. Deploy backend = `deploy-gastos-wt.js` (SFTP, sin build).
