# Atiko Gastos — Diseño

**Fecha:** 2026-06-09
**Estado:** Aprobado (brainstorming) — pendiente plan de implementación
**Tipo:** Producto nuevo de la agencia (multi-tenant, para vender a pymes)

---

## 1. Resumen

Bot/servicio de **rendición de gastos y facturas** para pymes. Un empleado captura una
boleta/factura (foto, screenshot de galería o **captura de pantalla** de un recibo digital), el
sistema la lee con OCR especializado, extrae los campos, el empleado confirma/corrige y el gasto
queda registrado. El dueño/contador consume los gastos por **panel web** (con descarga de Excel
filtrable) y por **mensaje de WhatsApp** a su propio teléfono.

Es un **servicio 100% aparte** del agente de ventas KAI (no comparte código), multi-tenant desde
el diseño, montado sobre la infra que ya existe (VPS Hostinger, pm2, Caddy, Docker/Postgres).

### Decisiones clave (del brainstorming)
- **Objetivo:** producto para vender a varias pymes (multi-tenant desde el día uno).
- **Arquitectura:** servicio 100% aparte (backend propio, DB propia, número propio por cliente).
- **Flujo central:** captura + **confirma** (el empleado valida lo que leyó el OCR; evita errores).
- **Salida al dueño:** panel web (con Excel filtrable por columnas) **+** mensaje de WhatsApp.
- **Identificación multi-tenant:** número de WhatsApp por cliente (cada cliente conecta SU número
  Business a la Cloud API; el tenant se reconoce por `phone_number_id`). En la app, por login.
- **Categorías:** set fijo chileno (Combustible, Comida/Representación, Insumos, Transporte,
  Alojamiento, Servicios, Otros). Personalizables = fase 2.
- **OCR:** especializado desde el día uno → **Document AI + Gemini Flash** (híbrido).
- **Canales de captura:** **App (Capacitor/Android) + WhatsApp**, ambos al mismo motor OCR.
- **Hogar de la app:** app nueva propia de gastos (reusa los plugins/componentes de Matico como
  base), **NO** dentro de Matico.
- **Plataforma de la app:** **Android primero**; iOS en fase 2.

---

## 2. Arquitectura

Nuevo servicio **`atiko-gastos`**, espejo de cómo está montado `atiko-agent`:

- **Backend:** Node/Express, app pm2 `atiko-gastos`, detrás de Caddy en
  `gastos.atikodigital.cl` → `reverse_proxy localhost:3100`.
- **DB propia:** contenedor Docker nuevo `atiko-gastos-db` (postgres:16, `127.0.0.1:5434:5432`),
  base `atiko_gastos`. Aislada del CRM (`atiko-db`/`atiko_crm`).
- **OCR:** Google Document AI (Expense/Invoice parser) + Gemini Flash visión.
- **WhatsApp:** Cloud API multi-número (tenant por `phone_number_id`).
- **App:** Capacitor/Android nueva, reusa los plugins de captura de Matico.
- **Deploy:** `deploy-gastos.js` gemelo de `deploy-agent.js` (SFTP → `/root/atiko-gastos`,
  npm install, pm2 restart). Cero código compartido con KAI.

```
                 ┌─────────────────────────┐
   App Android ──┤                         │
  (foto/galería/ │   Backend atiko-gastos  │── Postgres atiko-gastos-db
   captura pant.)│   (Node/Express, pm2)   │
                 │                         │── Document AI + Gemini (OCR)
  WhatsApp   ────┤   - OCR híbrido         │
 (por cliente)   │   - API app             │
                 │   - Webhook WhatsApp    │
  Panel web  ────┤   - API panel + Excel   │
  (dueño)        │   - Resumen al dueño    │
                 └─────────────────────────┘
```

---

## 3. Canales de captura

Ambos canales producen el mismo registro de gasto y pasan por el mismo pipeline OCR.

### 3.1 App Atiko Gastos (Capacitor/Android)
App nueva, marca propia, reusando como base los plugins/componentes de Matico:
- `MaticoScreenCapturePlugin` / `MaticoScreenCaptureService` / `MaticoScreenCaptureStore`
  (captura nativa de pantalla vía MediaProjection, burbuja flotante, cola) → se renombran a la
  marca de gastos.
- `screenCaptureBridge.js` (puente JS↔nativo).
- `EvidenceIntake.jsx` (cámara / galería múltiple / captura de pantalla web / captura nativa),
  incluyendo `processDocumentImage()` (grises + contraste + umbral, reescala a 1800px) que
  preprocesa la imagen **antes** de subirla para mejorar la lectura de Document AI.

Flujo en la app:
1. Empleado inicia sesión (identifica empresa + empleado; no requiere whitelist de teléfono).
2. Captura: foto física / screenshot de galería / **captura de pantalla** (recibo digital tipo
   Uber, email, boleta electrónica) / captura nativa con burbuja.
3. Preprocesado local (`processDocumentImage`).
4. Sube la(s) imagen(es) al backend → OCR → **pantalla de confirmar/editar** (mejor UX que el
   texto de WhatsApp) → guardado.
5. Vista "Mis gastos" (historial del propio empleado).

> La captura **nativa de pantalla** (MediaProjection) es Android. Cámara/galería son
> multiplataforma. MVP = Android.

### 3.2 WhatsApp (número por cliente)
1. El empleado manda la foto al número WhatsApp de su empresa.
2. Webhook identifica **tenant** por `phone_number_id` y **empleado** por su teléfono (whitelist).
   No autorizado → "No estás registrado, pídele a tu jefe que te agregue".
3. Descarga la imagen (Graph API) → preprocesado → OCR.
4. El bot responde lo que entendió: *"🧾 Boleta · Copec · $25.000 · 12/06 · Combustible · IVA
   $3.992. ¿Correcto? Responde SÍ para guardar, o dime qué corregir (ej: 'monto 30000' o
   'categoría comida')."*
5. **SÍ** → confirmado. **Corrección** en lenguaje natural → Gemini la interpreta, actualiza y
   re-confirma. **No** → descartado.

---

## 4. Pipeline OCR (híbrido, compartido)

1. Imagen preprocesada (la app lo hace local; en WhatsApp lo hace el backend reusando la misma
   lógica de `processDocumentImage`).
2. **Document AI** (Expense/Invoice parser): total, fecha, proveedor, impuesto, líneas.
3. **Gemini Flash** (visión + texto): lo chileno que Document AI no clava — tipo de documento
   (boleta/factura/otro), RUT emisor, split neto/IVA si falta, **categoría** (del set fijo CL),
   glosa.
4. Se mezclan ambas salidas en un registro estructurado con `confianza`. Se guarda como
   `pendiente_confirmacion`.
5. Tras confirmar (app o WhatsApp) → `confirmado` y se encola para el resumen al dueño.

Aritmética monetaria en el **backend** (no se confía al LLM): montos en CLP enteros (bigint),
IVA 19% por defecto, `total = neto + iva` validado.

---

## 5. Salida al dueño (dos vías)

### 5.1 Panel web — `gastos.atikodigital.cl`
Branded Atiko (negro/dorado, estilo el CRM), login propio (JWT). El dueño ve **solo su empresa**:
- Tabla: fecha · empleado · proveedor · RUT · tipo doc · categoría · neto · IVA · total · estado · foto.
- **Filtros por columna** (rango de fecha, empleado, categoría, tipo doc, proveedor, estado).
- Fila de totales (Σ neto/IVA/total y por categoría).
- **Descargar Excel respetando los filtros activos** (`exceljs`).
- Gestión de empleados (alta/baja; credenciales de app + teléfono WhatsApp autorizado).
- Ajustes de empresa (WhatsApp del dueño, frecuencia de resumen).

### 5.2 WhatsApp al dueño (su propio teléfono)
- **Programado** (diario/semanal/mensual según config): total del período + desglose por categoría.
- **A demanda:** el dueño escribe "resumen mes" al bot → total + desglose al instante.

---

## 6. Modelo de datos (`atiko_gastos`)

- **`companies`** (tenants): id, nombre, rut, `wa_phone_number_id`, `wa_token` (cifrado),
  owner_nombre, **owner_whatsapp** (E.164), resumen_frecuencia (diario|semanal|mensual),
  created_at.
- **`employees`** (whitelist + login app): id, company_id, nombre, **phone** (E.164, WhatsApp),
  email/usuario + password_hash (login app), rol (empleado|admin), activo, created_at.
- **`expenses`**: id, company_id, employee_id, `wa_message_id` (dedup), foto_path, **canal**
  (app|whatsapp), **tipo_documento** (boleta|factura|otro), **rut_emisor**, proveedor, fecha,
  **neto**, **iva**, **total** (bigint CLP), moneda, **categoria** (set fijo CL), glosa,
  **estado** (pendiente_confirmacion|confirmado|rechazado), raw_ocr (jsonb), confianza,
  created_at, confirmed_at.
- **`users`** (login del panel): id, company_id, email, password_hash, rol
  (atiko_admin|owner).

Categorías fijas (CL): Combustible, Comida/Representación, Insumos, Transporte, Alojamiento,
Servicios, Otros.

---

## 7. Seguridad / multi-tenant

- **Auth propia** (JWT + bcrypt), separada del portal/CRM. Roles: `atiko_admin` (Atiko, ve todo),
  `owner` (su empresa), empleado (app).
- **Tenant:** por login (app y panel) o por `phone_number_id` (WhatsApp).
- **Tokens WhatsApp** por tenant, cifrados.
- **Fotos** de boletas en el VPS, acceso gateado por login.
- **Onboarding de un cliente:** Atiko da de alta la empresa en el panel (nombre, RUT, conecta el
  número WhatsApp Business del cliente a la Cloud API, registra dueño + empleados). Cubierto por
  el playbook de onboarding omnicanal.

---

## 8. Deploy

- `deploy-gastos.js` (SFTP → `/root/atiko-gastos`, npm install, pm2 restart `atiko-gastos`).
- Bloque Caddy `gastos.atikodigital.cl` → `reverse_proxy localhost:3100`.
- Contenedor Postgres `atiko-gastos-db` (compose propio, puerto host 5434).
- Webhook WhatsApp: `https://gastos.atikodigital.cl/api/whatsapp/webhook` + verify token.
- App: build Capacitor/Android (APK), distribución directa al cliente (fuera de Play Store en MVP).

---

## 9. Fases

### Fase 1 (MVP)
- App Android (foto / galería / captura de pantalla / captura nativa) + WhatsApp.
- OCR híbrido (Document AI + Gemini).
- Flujo captura + confirma.
- Panel web + Excel filtrable.
- Resumen al dueño (programado + a demanda).
- Validación con **1 cliente real**.

### Fase 2
- App iOS.
- Categorías personalizables por cliente.
- Flujo de aprobación por un jefe.
- Integración contable (SII / Nubox / etc.).
- Planes / cobro (productización comercial).

### Fuera de alcance (YAGNI ahora)
- Aprobación por jefe, categorías custom, integraciones contables, iOS, planes de cobro,
  publicación en Play Store.

---

## 10. Riesgos / pendientes

- **Document AI:** requiere proyecto GCP con la API habilitada + billing (ya en marcha por Gemini).
  El Expense parser está entrenado en recibos genéricos; el RUT chileno y el tipo boleta/factura
  los cubre Gemini. Validar precisión con boletas reales chilenas.
- **Números de WhatsApp:** cada cliente conecta SU número (no se gasta el cupo de Meta de Atiko).
  Para abrir al público (responder a cualquiera) Meta puede exigir revisión/verificación.
- **Captura nativa de pantalla:** Android-only (MediaProjection). iOS usa ReplayKit (fase 2).
- **App fuera de Play Store** en MVP → instalación por APK; revisar permisos sensibles
  (SYSTEM_ALERT_WINDOW, FOREGROUND_SERVICE_MEDIA_PROJECTION).
