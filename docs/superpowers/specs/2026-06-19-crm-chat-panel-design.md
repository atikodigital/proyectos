# CRM-chat del panel web (v1) — Diseño

**Fecha:** 2026-06-19
**Producto:** panel web del dueño de Hash IA (`gastos.atikodigital.cl/panel`), pestaña **CRM**. Repo `HASH IA`, branch `master`.
**Alcance:** construir un **CRM-chat de 3 paneles** (lista de conversaciones · hilo · ficha del contacto) inspirado en una referencia tipo Closr CRM, en la pestaña CRM del panel (hoy un placeholder). **Sub-proyecto 1 de 2** — la versión para la app móvil (gastos-app) es un sub-proyecto aparte que reusa el backend.

> ⚠️ El panel `gastos/public/panel/index.html` es **el archivo que Antigravity más edita**. El usuario confirmó que pausó el panel (se movió a `landing/`) → seguro editar; commitear y avisar al terminar.

## Contexto (ya existente)
- Pestaña CRM del panel (`#crmSection` en index.html) = placeholder "Módulo CRM completo — Próximamente". El dashboard tiene una mini-card `#crmChatsList`.
- Backend chat (`gastos/src/chat/repo.js`): tabla `chat_mensajes` (`id, seq, company_id, channel [whatsapp|messenger|instagram|telegram], contact [nombre/teléfono], contact_key, text, direccion [in|out], source, created_at`). Endpoints: `GET /chat/conversaciones`, `GET /chat/conversacion?channel&contact`, `POST /chat/ingest`.
- Pedido desde conversación: `POST /overlay/pedido/suggest` (`suggestOrder(convo)` lee el chat y propone ítems) — ya existe. `api.js` (app): `pedidoDesdeConversacion`.
- Salida a canales: **solo WhatsApp** — `gastos/src/whatsapp/client.js` `sendText({to, body, token, phoneNumberId})` (Graph API). La config WhatsApp de la empresa se obtiene con `getCompanyWa` (wa_phone_number_id, wa_token, owner_whatsapp). NO hay salida para Messenger/IG/Telegram.
- Protocolo de agentes (app React): `AgentInteractionProvider` (proponer/pedirEvidencia) + `EvidenceIntake`. **El panel es HTML estático y NO puede usar esos componentes React** → se replica el MISMO patrón en vanilla.

## Decisiones (del usuario, vía brainstorming)
1. **Orden:** panel web primero; app después (sub-proyecto aparte, reusa backend).
2. **Ficha del contacto:** datos derivados de lo que tenemos + tabla `contactos` NUEVA editable (email, ubicación, notas). Sin campos inventados (idiomas/cargo/local-time).
3. **Conversación:** ver **y responder**.
4. **Responder:** por **WhatsApp** ya (envía si el chat es WhatsApp y la empresa lo tiene configurado, se guarda `out`); Messenger/IG/Telegram quedan **ver-solo** con aviso.
5. En la ficha, **agregar acciones de crear pedido + captura** (screenshot/foto/archivo) con el mismo patrón del protocolo de KALY para tomar pedidos.

## Diseño

### Layout — 3 paneles en `#crmSection` (greenfield)
Grid de 3 columnas (lista | hilo | ficha) dentro del área de contenido del panel, estética actual (oscuro + dorado, glass), responsive del panel (en anchos chicos del panel, la ficha puede colapsar — pero el v1 apunta a desktop).

**Izquierda — lista de conversaciones:**
- Buscador de conversaciones (filtra por nombre/contacto, client-side).
- Lista desde `GET /chat/conversaciones`: por cada conversación, avatar con iniciales, nombre/contacto, ícono del canal, preview del último mensaje, hora. Item activo resaltado. Al hacer click → carga hilo + ficha.
- **Recorte realista:** sin tabs All/Unread/Draft/Archived (no llevamos ese estado). Solo lista + búsqueda.

**Centro — hilo de conversación:**
- Header: nombre/contacto + canal.
- `GET /chat/conversacion?channel&contact` → burbujas: `in` a la izquierda, `out` a la derecha, con separadores de fecha (agrupar por día). Scroll al final.
- **Caja de respuesta** abajo: input + botón Enviar.
  - Si `channel==='whatsapp'` Y la empresa tiene WhatsApp configurado Y el contacto es un teléfono enviable → habilitada; al enviar llama `POST /chat/responder` → manda por WhatsApp + guarda `direccion='out'` + refresca el hilo.
  - Si no → caja deshabilitada con texto "Responder disponible solo por WhatsApp (configúralo en Ajustes)" / "Responde desde el canal".

**Derecha — ficha del contacto:**
- Avatar (iniciales) + nombre/contacto + canal.
- **Fila de acciones:** **Pedido** (crear pedido) y **Captura** (adjuntar). (Se omiten Email/Task/Meeting de la imagen — sin backing.)
- **Contact Details (lectura, derivado):** Teléfono (si el contacto es número), Canal, **Primer contacto** (min `created_at`), **Último contacto** (max `created_at`), **N° de mensajes**.
- **Editables (tabla `contactos`):** Email, Ubicación, Notas → al editar, `PATCH /chat/contacto`.

### Crear pedido + captura (patrón del protocolo, en vanilla)
- **Pedido:** botón → modal "Nuevo pedido" sembrado con `POST /overlay/pedido/suggest` (los ítems que `suggestOrder` deduce de la conversación), editable (cantidades/ítems), con total. Confirmar → crea el pedido (reusa el flujo de pedido existente). Mismo patrón "propuesta editable Confirmar/Cancelar" que KALY.
- **Captura:** dentro de ese modal, botones de **captura de pantalla / foto / subir archivo** (input `<input type="file" accept="image/*" capture>` vanilla → base64) para adjuntar la imagen del pedido como respaldo/referencia (v1: se adjunta como referencia; no OCR).
- **En el panel** todo esto es **vanilla** (modal + file input) replicando el patrón; **la app** (sub-proyecto 2) reusará los componentes React reales (`AgentProposalModal`/`EvidenceCaptureOverlay`/`pedirEvidencia`).

### Backend (gastos/)
- **Tabla `contactos`** (idempotente en migrate): `id uuid PK, company_id uuid, channel text, contact_key text, email text, ubicacion text, notas text, updated_at`. Único por `(company_id, channel, contact_key)`. Repo `chat/contactos-repo.js`: `getContacto(db, companyId, channel, contact)` (devuelve `{}` si no hay), `upsertContacto(db, companyId, channel, contact, {email, ubicacion, notas})`. No se toca `chat_mensajes`.
- `GET /api/app/chat/contacto?channel&contact` → ficha: `{ nombre, channel, telefono, primerContacto, ultimoContacto, nMensajes }` (derivado de chat_mensajes) + `{ email, ubicacion, notas }` (de contactos). Scoped por `req.auth.companyId`.
- `PATCH /api/app/chat/contacto` `{channel, contact, email?, ubicacion?, notas?}` → upsert (scoped).
- `POST /api/app/chat/responder` `{channel, contact, text}` → si `channel!=='whatsapp'` → 400 `canal_no_soportado`; si la empresa no tiene WhatsApp configurado → 400 `whatsapp_no_configurado`; si ok → `sendText` (inyectable) al teléfono del contacto + `addMensaje(direccion:'out', source:'panel')` + devuelve el mensaje. `sendText` inyectable para testear.
- Crear pedido: reusa `POST /overlay/pedido/suggest` (sin cambios).
- También montar los endpoints CRM en el router del **panel** (`/api/panel/...`) si el panel usa un prefijo distinto — verificar cómo el panel hace fetch (probablemente reusa `/api/app` con token de empleado, o `/api/panel`). Seguir el patrón existente del panel (`apiFetch` en index.html).

### Data flow (resumen)
1. Abrir CRM → lista (`/chat/conversaciones`). 2. Click conversación → hilo (`/chat/conversacion`) + ficha (`/chat/contacto`). 3. Editar ficha → `PATCH /chat/contacto`. 4. Responder (WhatsApp) → `POST /chat/responder` → refresca hilo. 5. Pedido → modal (suggest) + captura → crea pedido.

### Manejo de errores / multi-tenant
- Todo scoped por `company_id` (empleado autenticado).
- Responder a canal sin salida → error claro, no rompe.
- Captura/upload falla → no bloquea el pedido.
- WhatsApp send falla (token vencido) → mensaje de error, no se guarda `out`.

### Testing
- Backend (jest+pg-mem): `contactos-repo` (get vacío→{}, upsert, scoped); `GET /chat/contacto` (deriva primer/último/nMensajes + merge editable; auth/scoped); `PATCH /chat/contacto` (guarda, scoped); `POST /chat/responder` (whatsapp ok con sendText mock + guarda out; canal_no_soportado; whatsapp_no_configurado; auth). Suite backend verde.
- Panel: HTML estático → **verificación visual en Chrome** (3 paneles, lista→hilo→ficha, responder WhatsApp, modal pedido+captura, ficha editable). Sin tests automáticos del panel.
- Build app NO aplica (sub-proyecto 1 es panel + backend).

## Fuera del v1
- Responder Messenger/IG/Telegram (omnicanal multi-tenant).
- Tabs Unread/Draft/Archived; idiomas/cargo/local-time/comm-preferences; Email/Task/Meeting.
- OCR de la captura para autocompletar el pedido.
- La app móvil (sub-proyecto 2, spec aparte).

## Siguiente paso
Aprobar → `writing-plans`.
