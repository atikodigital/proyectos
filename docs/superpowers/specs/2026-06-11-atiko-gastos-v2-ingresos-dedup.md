# Atiko Gastos v2 — Ingresos, Flujo de Caja, Anti-duplicados y WhatsApp

**Fecha:** 2026-06-11
**Estado:** Aprobado (pendiente revisión del spec por el usuario)
**Base:** extiende `2026-06-09-atiko-gastos-design.md` (MVP de gastos ya en producción).

## Contexto

El MVP captura **solo gastos** (boletas/facturas) vía app y WhatsApp, los pasa por OCR
(Document AI + Gemini), los categoriza a cuentas SII y los muestra en un panel web con
exportación a Excel. Ya está desplegado en el VPS (`atiko-gastos`, puerto 3100,
`gastos.atikodigital.cl`) con login de empleado funcionando.

Esta v2 convierte el producto de "rendición de gastos" a **control de flujo de caja**:
suma **ingresos**, evita **duplicados** (clave para no pagar dos veces), y entrega
**resúmenes por WhatsApp** reutilizando el número que ya tiene Atiko.

## Objetivos

1. Registrar **ingresos** (comprobantes de transferencia/depósito) además de gastos.
2. **Clasificación asistida por IA**: el OCR propone gasto/ingreso, el usuario confirma.
3. **Anti-duplicados**: detectar si una factura/boleta o un comprobante ya fue registrado,
   para no pagar/registrar dos veces. Bloquear con override del dueño.
4. **Estado de pago** por movimiento (base para un futuro módulo de pagos).
5. **Panel + Excel** con vista de gastos/ingresos/saldo y todo el detalle.
6. **WhatsApp**: enviar el resumen al WhatsApp del dueño desde el número de Atiko.
7. **Fechas contables**: guardar fecha de emisión y de carga; contabilizar por la de
   emisión; permitir filtro por período (mes/año).
8. **Cobranzas**: guardar quién envió la imagen por WhatsApp (nombre + número) y el
   pagador/origen leído del comprobante, para cruzar qué cliente pagó.
9. Onboarding de la empresa real **matikoapp**.

## No-objetivos (YAGNI)

- Módulo de pagos/conciliación bancaria automático (solo dejamos el campo `estado_pago`).
- Multi-moneda (todo CLP).
- Plantillas de WhatsApp en este alcance: para producción se hará aparte; aquí se usa la
  ventana de 24h para pruebas.
- Cambiar el modelo multi-tenant: cada cliente sigue usando su propio número; Atiko es la
  excepción que reusa el suyo.

## Modelo de datos

Se extiende la tabla `expenses` (un solo registro por movimiento, con un campo `tipo`).
Nuevos campos:

| Campo | Tipo | Descripción |
|---|---|---|
| `tipo` | text | `gasto` \| `ingreso`. Default `gasto`. |
| `nro_operacion` | text, nullable | N° de operación/código de transacción (transferencias). |
| `image_hash` | text, nullable | Huella (SHA-256) del archivo de imagen para dedup exacto. |
| `estado_pago` | text | `registrada` \| `pagada`. Default `registrada`. Solo aplica a gastos. |
| `dedup_override` | boolean | `true` si se forzó el registro pese a ser duplicado. Default `false`. |
| `wa_sender_name` | text, nullable | Nombre de perfil de WhatsApp de **quien envió** la imagen (solo canal WhatsApp). |
| `wa_sender_phone` | text, nullable | Número de WhatsApp de quien envió la imagen (solo canal WhatsApp). |

El campo existente `proveedor` actúa como **contraparte**: en un gasto es el
proveedor/comercio; en un ingreso es el **pagador/origen** leído del comprobante (de quién
viene la transferencia/depósito). Es un dato distinto de `wa_sender_*` (quién mandó la foto):
en cobranzas suele coincidir, pero no siempre (un empleado puede reenviar el pago de un
cliente).

Campos ya existentes que se reutilizan para la clave de duplicado: `rut_proveedor`,
`folio`, `monto`, `fecha`, `proveedor`, `company_id`.

### Fechas y período contable

Se distinguen dos fechas, **ambas se guardan**:

| Campo | Significado | Uso |
|---|---|---|
| `fecha` (existente) | **Fecha de emisión** del documento (la que dice la boleta/factura/comprobante), leída por OCR | **Fecha contable**: ordena, filtra y agrupa para el período tributario |
| `created_at` (existente) | Fecha/hora de **carga** (cuándo se sacó/subió la foto) | Auditoría, "cuándo se registró realmente" |

La contabilidad **siempre manda por `fecha` (emisión)**, no por `created_at`. Si el OCR no
logra leer la fecha de emisión, la app pide al usuario que la confirme/ingrese antes de
guardar (no se asume la fecha de carga como contable).

**Período contable:** el panel y el Excel permiten filtrar por **mes/año** (ej. junio 2026)
derivado de `fecha`. El cierre mensual con el contador se hace eligiendo el período y
descargando ese Excel.

## Componentes y flujo

### 1. Clasificación gasto/ingreso (OCR)
- `src/ocr/extract.js` agrega al resultado un campo `tipo` con la sugerencia de la IA.
- Heurística: documento tributario con folio/RUT emisor → `gasto`; comprobante de
  transferencia/depósito (banco, "transferencia exitosa", monto + destinatario, sin folio
  tributario) → `ingreso`. Gemini decide con un prompt explícito que devuelve `tipo`.
- La app muestra la sugerencia; el empleado confirma o la cambia con un toque antes de
  guardar. El `tipo` final viaja en el `confirm`/`PATCH`.
- El OCR extrae **toda** la información disponible de la imagen. Para ingresos, además del
  monto/fecha, intenta leer el **pagador/origen** (de quién viene la transferencia/depósito)
  y el `nro_operacion`; eso queda en `proveedor` (contraparte) y `nro_operacion`.

### 1b. Identidad del remitente por WhatsApp (cobranzas)
- En el canal WhatsApp, el webhook ya recibe del payload el **nombre de perfil** y el
  **número** de quien envía (`contacts[].profile.name`, `contacts[].wa_id`). Se guardan en
  `wa_sender_name` / `wa_sender_phone` en cada movimiento que entra por WhatsApp.
- Sirve para **cobranzas**: cruzar qué cliente reportó/realizó el pago. Especialmente útil en
  transferencias, depósitos y pagos en efectivo (donde el comprobante puede no traer todos
  los datos).
- En el canal **app**, el remitente es el empleado logueado (ya identificado por
  `employee_id`); `wa_sender_*` quedan nulos.

### 2. Detección de duplicados — `src/expenses/dedup.js` (nuevo)
Función pura `findDuplicate(db, companyId, candidate)` que aplica 3 capas y devuelve el
movimiento existente + el nivel, o `null`:

- **Capa 1 — documento (fuerte):**
  - Gasto: match exacto por `company_id + rut_proveedor + folio` (cuando ambos existen).
  - Ingreso: match exacto por `company_id + nro_operacion` (cuando existe).
- **Capa 2 — imagen (fuerte):** match por `company_id + image_hash`.
- **Capa 3 — probable (suave):** mismo `company_id + monto + fecha + proveedor`.

`fuerte` (capa 1 o 2) → la app **avisa y bloquea**; solo se registra si el dueño manda
`override: true`. `suave` (capa 3) → la app muestra alerta pero permite guardar.

### 3. Intake con dedup — `src/expenses/intake.js`
- Calcula `image_hash` al recibir la imagen.
- Tras el OCR y antes de confirmar, llama a `findDuplicate`. Si hay duplicado fuerte y no
  viene `override`, responde `409 { duplicado: 'fuerte', existente: {...} }`.
- La app, al recibir 409 fuerte, muestra el aviso con fecha + persona y ofrece el botón
  "registrar igual" (que reenvía con `override: true`; el `dedup_override` queda en `true`).

### 4. Panel web — `public/panel` + `src/panel`
- Filtro **Tipo: Todos / Gastos / Ingresos** sobre la tabla existente.
- Filtro **Período contable: mes/año** (derivado de `fecha` de emisión), además del rango
  desde-hasta ya existente.
- Tarjeta de **saldo**: `Σ ingresos − Σ gastos`, con totales de cada lado, para el período
  seleccionado.
- Columna **Tipo** y **Estado** visibles; cada fila muestra `fecha` (emisión) y, en el
  detalle, la fecha de carga.
- Para ingresos, el detalle muestra **pagador/origen** (`proveedor`) y **quién lo envió por
  WhatsApp** (`wa_sender_name` + `wa_sender_phone`) → vista de cobranzas.
- Acción para marcar un gasto como **pagado** (`estado_pago = pagada`).

### 5. Excel — `src/panel/excel.js`
- Agrega columnas **Tipo**, **Estado**, **Fecha emisión**, **Fecha carga**, **Pagador/Origen**
  y **Enviado por (WhatsApp)**; incluye gastos e ingresos; respeta los filtros (tipo +
  período). El período elegido se usa para el cierre mensual.

### 6. WhatsApp resumen — `src/whatsapp` + `src/expenses/summary.js`
- Endpoint en el panel: `POST /api/panel/whatsapp/resumen` (auth dueño) → arma el resumen
  (total gastos, total ingresos, saldo, periodo) y lo envía al `owner_whatsapp` de la
  empresa usando `wa_phone_number_id` + `wa_token` guardados en la empresa.
- **Restricción WhatsApp:** el envío proactivo solo llega dentro de la ventana de 24h
  (tras un mensaje entrante del dueño) o con plantilla aprobada. Para pruebas se usa la
  ventana de 24h; el endpoint devuelve el estado real de la API de WhatsApp (entregado o
  error de ventana) sin simular éxito.
- **Atiko reusa su número** (+56 9 2713 0792): se guardan en la empresa `matikoapp` el
  `wa_phone_number_id` y `wa_token` de ese número (leídos del `.env` de `atiko-agent`). El
  envío es **solo saliente** vía Graph API; el webhook entrante de ese número sigue siendo
  de KAI y no se toca.

### 7. Onboarding `matikoapp`
- Empresa `matikoapp`, dueño "Jose Olguín", `owner_whatsapp = +56993300435`,
  `wa_phone_number_id`/`wa_token` del número de Atiko. Script reutilizable
  (`scripts/create-company.js` o ampliación de `set-company-wa.js`).

## Manejo de errores

- OCR sin `tipo` claro → default `gasto`, el usuario corrige.
- Duplicado fuerte sin override → `409` con el movimiento existente (fecha + persona).
- Envío WhatsApp fuera de ventana / sin plantilla → el endpoint devuelve el error de la API
  tal cual, con un mensaje claro al dueño ("abre la ventana escribiendo al número o usa
  plantilla"). Nunca se reporta "enviado" si la API no lo confirmó.
- Hash de imagen faltante (p. ej. payload sin imagen) → se omite capa 2, no rompe el flujo.

## Testing

- `dedup.js`: unit tests de las 3 capas (match y no-match) con pg-mem.
- `intake.js`: 409 en duplicado fuerte; registro con `override`; alerta suave no bloquea.
- `extract.js`: clasificación `tipo` y extracción de pagador/origen + `nro_operacion`
  (mock de Gemini devolviendo gasto/ingreso).
- webhook WhatsApp: guarda `wa_sender_name`/`wa_sender_phone` del payload en el movimiento.
- `excel.js`: columnas Tipo/Estado y filas de ambos tipos.
- Panel: filtro por tipo, filtro por período (mes/año sobre `fecha` de emisión) y cálculo
  de saldo del período.
- WhatsApp resumen: arma el texto correcto; el envío usa el cliente inyectable (mock) y
  propaga el error de ventana.

## Despliegue

- Migración aditiva (nuevas columnas con default) vía `migrate.js`; segura sobre la tabla
  existente.
- Redeploy de `atiko-gastos` (`deploy-gastos.js`) y rebuild del APK con la pantalla de
  confirmación de tipo + manejo del 409.
- Alta de `matikoapp` y carga de credenciales del número de Atiko.
