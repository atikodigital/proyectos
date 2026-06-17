# Onboarding de clientes (wizard híbrido) — Hash IA · Chat #6 — Diseño

**Fecha:** 2026-06-17
**Producto:** Hash IA (app `gastos-app`, backend `gastos`). Repo `HASH IA`, branch `master`.
**Alcance:** un wizard de primer-arranque que deja al cliente con su **negocio configurado y catálogo cargado**, listo para vender. Sirve tanto para clientes nuevos como para activar a los existentes.

## Contexto

Hash IA ya tiene casi todas las piezas; falta el **flujo guiado** que las una para un cliente que recién parte:
- Catálogo: `catalog/repo.js` (`createProduct`, `crearProductosBulk`), `catalog/extraer.js` (`extraerProductos` por foto, 5a), tools de KALY por voz (5b), `ProductosView` en la app.
- Config de ventas: `pedidos/repo.js` `getPedidoConfig`/`setPedidoConfig` (IVA `pedido_iva_incluido`, `delivery` zonas/gratis_desde), dataset de comunas.
- Empresa: `companies/repo.js` (`nombre`, `rut`, `giro`, `owner_nombre`, `owner_whatsapp`, flag `onboarded`/`onboarded_at`, `updateCompany`, `setGiro`).
- KALY (agente de voz) y su onboarding de preferencias personales (nombre/trato) ya existen — esto es distinto: es el onboarding **del negocio**.

## Decisiones (del usuario)
1. **Audiencia: las dos** — primer-arranque para nuevos Y activación para existentes; lo corre el cliente (o el equipo).
2. **Mecanismo: wizard híbrido** — esqueleto de pasos tocables + aceleradores por foto (5a) y voz KALY (5b) en el paso del catálogo.
3. **Pasos v1: completo, incluyendo despacho** ("1 y 2 juntos").

## Diseño

### Disparo y estado
- Al entrar a la app, si `companies.onboarded_at` está vacío → se muestra el `OnboardingWizard`.
- Botón **"Saltar por ahora"** siempre disponible; mientras no se complete, queda un acceso **"Configurar mi negocio"** para retomar.
- **Persistencia incremental:** cada paso guarda en el backend al instante. El wizard, al abrir, lee `getCompany` + `listProducts` + `getPedidoConfig` y deriva en qué paso retomar. Salir no pierde lo hecho.
- Al terminar el último paso → marca `onboarded` (`onboarded_at`).

### Pasos (5)
1. **Tu negocio:** nombre del negocio, rubro (giro), WhatsApp del dueño. → `PATCH /api/app/company` (nuevo endpoint app que reusa `updateCompany`/`setGiro`).
2. **Tu catálogo:** cargar productos con tres opciones (reusa `ProductosView`):
   - **📷 Desde foto** → `catalogExtraer` + preview + `crearProductosBulk`.
   - **🎙️ Con KALY (voz)** → arranca KALY con las tools de catálogo (5b: `agregar_producto`…).
   - **✍️ A mano** → `createProduct`.
   Muestra el contador "N productos cargados". Mínimo sugerido 1 para avanzar (no bloqueante: se puede saltar).
3. **IVA:** toggle "mis precios ya incluyen IVA" (sí = no se suma; no = se agrega 19%). → `setPedidoConfig({ pedido_iva_incluido })`.
4. **Despacho (simple):** "¿Haces delivery?" sí/no. Si sí: **costo plano** + "gratis desde $X" (opcional). → `setPedidoConfig({ delivery: { zonas:[{ id:'general', nombre:'Despacho', costo, comunas:[] }], gratis_desde } })`. Las **zonas por comuna avanzadas** quedan para el panel web (fuera de la app v1).
5. **¡Listo!:** resumen ("Tienes N productos · IVA incluido/agrega · despacho $X o sin despacho"), marca `onboarded`, y CTAs: **Ir al Chat** y **Crear pedido de prueba** (abre el `PedidoBuilder` con el catálogo recién cargado).

### Componentes
- **App:** `gastos-app/src/gastos/onboarding/OnboardingWizard.jsx` (orquesta los pasos + barra de progreso) y subcomponentes por paso (`PasoNegocio`, `PasoCatalogo` —reusa la UI de carga de `ProductosView`—, `PasoIva`, `PasoDespacho`, `PasoListo`). Montado en `GastosApp` con guarda de primer-arranque. `api.js`: `getCompany`, `updateCompany` (si faltan).
- **Backend:** `PATCH /api/app/company` (campos `nombre`, `giro`, `owner_whatsapp`; reusa `companies/repo` `updateCompany`+`setGiro`) y marcar onboarded (`POST /api/app/onboarding/complete` o `onboarded:true` en el mismo PATCH). El resto (catálogo, pedido-config) ya está montado en `/api/app`.
- **Pura:** `onboarding/status.js` `onboardingStatus(company, productos, config)` → `{ pasoActual, completos:{negocio,catalogo,iva,despacho}, onboarded }` (deriva el progreso; testeable sin DB).

### Data flow
1. App abre → `GET` company/productos/config → `onboardingStatus` decide mostrar wizard y en qué paso.
2. Cada paso hace su `PATCH/POST` y avanza.
3. Paso 5 marca onboarded → el wizard no vuelve a aparecer; CTA abre Chat o PedidoBuilder.

## Manejo de errores
- Cada paso es independiente; si un guardado falla, muestra aviso y permite reintentar sin perder los otros pasos.
- "Saltar por ahora" siempre disponible; no marca onboarded, solo cierra el wizard (reaparece el acceso para retomar).
- Catálogo vacío al llegar al paso 5: se permite terminar igual (se puede cargar después), con un aviso suave.

## Testing (TDD)
- `onboarding/status.js`: `onboardingStatus` deriva `pasoActual`/`completos` para combinaciones (sin datos, con productos, con config, onboarded).
- Backend `PATCH /api/app/company` (pg-mem + supertest): actualiza nombre/giro/owner_whatsapp scoped por empresa; marca onboarded; 401 sin token.
- App `OnboardingWizard` (RTL, KALY/catálogo/endpoints mockeados): avanza por los pasos, cada paso llama el endpoint correcto, el paso 5 marca onboarded y los CTAs disparan navegar al Chat / abrir PedidoBuilder.
- Suite verde + build.

## Fuera de v1
- Zonas de despacho por comuna en la app (se hacen en el panel web).
- Import masivo de catálogo desde Excel/CSV.
- Onboarding corrido por el equipo desde el panel (el mismo wizard/endpoints sirven; se expone después).
- Enganche directo desde la landing `hash.atikodigital.cl` (la landing lleva a descargar la app; el onboarding vive dentro de la app).

## Siguiente paso
Aprobar → `writing-plans`.
