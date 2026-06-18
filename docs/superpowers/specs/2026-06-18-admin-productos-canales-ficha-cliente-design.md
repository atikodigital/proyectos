# Spec — Productos, canales, burbuja y ficha de cliente en el Admin

**Fecha:** 2026-06-18
**Estado:** Aprobado (diseño) — pendiente plan de implementación
**Ámbito:** Panel de administración de Atiko (`/admin`) de Hash IA.

---

## 1. Contexto y problema

El panel admin (`gastos/public/admin/index.html` + `gastos/src/admin/`) hoy permite: crear clientes, asignarles un **plan** (`free`/`basico`/`pyme`/`empresa`), cambiar el plan, ver empleados y movimientos del mes, y crear/resetear el login del dueño.

Falta que el administrador pueda:
1. Asignar a cada cliente los **productos/módulos** que contrató (Hash IA, CRM, Chat/Agente omnicanal, Pedidos), pudiéndolos **agregar y eliminar**.
2. Para Chat/CRM, marcar los **canales** activos (WhatsApp, Messenger, Instagram, Email, Telegram, Web, Voz).
3. Configurar la **burbuja flotante de captura** (producto Hash IA): si está activa y **a qué apps se ancla**.
4. Ver una **ficha read-only con toda la información del cliente** (datos de empresa y dueño, teléfonos, empleados, facturas/movimientos, pedidos, resumen del mes y conciliación).

## 2. Objetivos
- Gestión de productos/canales/burbuja por cliente desde el admin (agregar y eliminar).
- Ficha de cliente de solo lectura que consolide su información.
- Mantener el patrón y estilo del código existente (migraciones perezosas, `requireKind('admin')`, repo + router + HTML estático con `fetch`).

## 3. No objetivos (YAGNI)
- No se construye el CRM, el Chat ni Pedidos en sí; solo se **marca** qué productos/canales tiene el cliente.
- La ficha es **read-only**: no edita datos de la empresa ni de empleados (lo editable sigue siendo plan, productos/canales/burbuja y login, que ya existían o se agregan aquí).
- No se gestiona facturación/cobranza de la agencia.
- No se conectan los canales (tokens, OAuth de Meta, etc.); eso lo cubre el flujo de despliegue omnicanal aparte.

---

## 4. Modelo de datos

Se agregan columnas a `companies` con **migración perezosa** (mismo patrón que `ensurePlan` en `gastos/src/admin/repo.js`):

| Columna | Tipo | Default | Descripción |
|---|---|---|---|
| `plan` | text | `'free'` | (existente) nivel/precio. Coexiste. |
| `productos` | `jsonb` | `'[]'` | Array (subconjunto de `PRODUCTOS`). |
| `canales` | `jsonb` | `'[]'` | Array (subconjunto de `CANALES`; aplica si tiene `chat` o `crm`). |
| `burbuja_activa` | boolean | `false` | Burbuja flotante de captura activada (producto `hashia`). |
| `burbuja_apps` | `jsonb` | `'[]'` | Array de apps a las que se ancla la burbuja. |

> **Nota de tipo:** se usa `jsonb` (no `text[]`) para los arrays, por consistencia con el resto del esquema (`delivery_zonas jsonb`, `conciliaciones.partidas jsonb`) y para que pg-mem (tests) los maneje sin fricción. Se guardan con `$n::jsonb` vía `JSON.stringify`.

**Catálogos (constantes en el backend, fuente de verdad):**
- `PRODUCTOS = ['hashia', 'crm', 'chat', 'pedidos']`
- `CANALES = ['whatsapp', 'messenger', 'instagram', 'email', 'telegram', 'web', 'voz']`
- `BURBUJA_APPS_SUGERIDAS = ['whatsapp', 'uber', 'rappi', 'pedidosya', 'mercadopago', 'banco', 'galeria', 'gmail']` — sugerencias para la UI; `burbuja_apps` admite además **texto libre** (cualquier string), por lo que NO se valida contra este catálogo.

**Validación:** al guardar, `productos` y `canales` se filtran a los valores conocidos de `PRODUCTOS`/`CANALES` (se descartan claves desconocidas). `burbuja_apps` se acepta tal cual (lista de strings no vacíos, normalizados a minúsculas/trim). `burbuja_activa` se coacciona a booleano.

**Migración:** función `ensureProductos(db)` (idempotente, `WeakSet` como `ensurePlan`) que ejecuta los `ALTER TABLE companies ADD COLUMN IF NOT EXISTS ...`. Se invoca al inicio de cada operación admin que lea/escriba estos campos.

---

## 5. Backend (`gastos/src/admin/`)

### 5.1 `repo.js`
- `ensureProductos(db)` — nueva migración perezosa.
- `setProductos(db, companyId, { productos, canales, burbuja_activa, burbuja_apps })` — valida/normaliza y hace `UPDATE companies SET ...`; devuelve la fila actualizada. Acepta actualizaciones parciales (solo los campos presentes).
- `crearCliente(db, d)` — extiende para aceptar `productos`, `canales`, `burbuja_activa`, `burbuja_apps` (opcionales) y persistirlos al crear.
- `listClientesConStats(...)` — agrega `productos`, `canales`, `burbuja_activa` a cada fila (para mostrar pills en la lista).
- `getFichaCliente(db, companyId, year, month)` — **nuevo**; consolida read-only:
  - **empresa:** `nombre`, `rut`, `giro`, dirección si existe, `owner_nombre`, `owner_whatsapp`, `wa_phone_number_id`, `onboarded_at`, `created_at`, `plan`, `productos`, `canales`, `burbuja_activa`, `burbuja_apps`.
  - **empleados:** vía `companies/repo.listEmployees` → `nombre`, `phone`, `usuario`, `rol`, `activo` (nunca `password_hash`).
  - **movimientos:** últimos 20 vía `expenses/query.listExpenses` → proveedor, tipo, monto/total, fecha, estado, estado_pago.
  - **pedidos:** si `productos` incluye `pedidos`, últimos 10 pedidos vía nuevo `pedidos/repo.listPedidos`; si no, omitir el bloque.
  - **resumen:** `expenses/summary.cashflowSummary` (ingresos/gastos/saldo) del período.
  - **conciliacion:** `match/repo.getUltima(db, companyId, 'bancaria')` → `{ cuadrado, sca, sba }` o `null`.

### 5.2 `router.js` (todo bajo `requireAuth, requireKind('admin')`)
- `POST /clientes` — extiende el body para aceptar `productos`, `canales`, `burbuja_activa`, `burbuja_apps`.
- `PATCH /clientes/:id/productos` — body `{ productos?, canales?, burbuja_activa?, burbuja_apps? }` → `setProductos`. Devuelve la fila actualizada. 404 si no existe.
- `GET /clientes/:id` — devuelve `getFichaCliente`. 404 si no existe.
- `GET /clientes` — ya existe; ahora incluye `productos`/`canales`/`burbuja_activa` por fila.

---

## 6. UI Admin (`gastos/public/admin/index.html`)

Mantiene el estilo actual (dark + dorado, `fetch` a `/api/admin`, sin framework).

- **Nuevo cliente:** además de los campos actuales, checkboxes de **Productos** (4). Si se marca `chat` o `crm`, se muestran checkboxes de **Canales** (7). Si se marca `hashia`, se muestra la **Burbuja**: switch *activa* + checklist de `BURBUJA_APPS_SUGERIDAS` + input de texto libre para agregar otra app.
- **Lista de clientes:** nueva columna **Productos** con pills (`HASH`·`CRM`·`CHAT`·`PED`) y un indicador de canales/burbuja. Botón **"Ver ficha"** por fila.
- **Editar productos:** desde la fila (modal o expandible) se pueden agregar/quitar productos, canales y apps de burbuja → `PATCH /clientes/:id/productos`.
- **Modal "Ficha del cliente":** llama a `GET /clientes/:id` y muestra los bloques read-only: Empresa+Dueño (con teléfonos), Productos/Canales/Burbuja, Empleados, Movimientos recientes, Pedidos (si aplica), Resumen del mes + Conciliación.

---

## 7. Pruebas (TDD)

**Repo (`gastos/tests/admin/...`):**
- `ensureProductos` agrega las columnas y es idempotente.
- `setProductos` filtra productos/canales desconocidos, normaliza `burbuja_apps`, coacciona `burbuja_activa`, y permite actualización parcial.
- `crearCliente` persiste productos/canales/burbuja cuando vienen en el body.
- `getFichaCliente` consolida empresa, empleados (sin password), movimientos, resumen, conciliación; omite pedidos si el cliente no tiene el módulo.
- `listClientesConStats` incluye productos/canales/burbuja.

**Router (supertest, igual que tests admin/panel existentes):**
- `PATCH /clientes/:id/productos` requiere admin; aplica cambios; 404 inexistente.
- `GET /clientes/:id` requiere admin; devuelve la ficha; 404 inexistente.
- Aislamiento por `requireKind('admin')` (un token no-admin es rechazado).

---

## 8. Seguridad y alcance
- Todos los endpoints nuevos bajo `requireKind('admin')`.
- La ficha nunca expone `password_hash` ni el `wa_token` cifrado (solo el `wa_phone_number_id`/número visible).
- Cambios acotados a `gastos/src/admin/` y `gastos/public/admin/index.html`; sin tablas nuevas ni refactor fuera de alcance.

## 9. Riesgos / consideraciones
- `jsonb` para los arrays: guardar con `$n::jsonb` (vía `JSON.stringify`) y leer como array JS, igual que `delivery_zonas`/`conciliaciones`.
- La migración perezosa corre en caliente sobre `companies`; al ser `ADD COLUMN IF NOT EXISTS` es segura e idempotente.
- `getFichaCliente` hace varias consultas; mantener N de movimientos acotado (ej. 20) para que sea liviano.

## 10. Decisiones tomadas (de la fase de brainstorming)
- 4 productos: Hash IA, CRM, Chat, Pedidos.
- Productos **coexisten** con el `plan` existente.
- Ficha **read-only** que incluye: datos empresa+dueño, teléfonos, empleados, facturas/movimientos, pedidos y resumen+conciliación.
- Canales aplican a Chat/CRM: WhatsApp, Messenger, Instagram, Email, Telegram, Web, Voz.
- Burbuja flotante (Hash IA): activa + lista de apps a anclar (catálogo sugerido + texto libre).
