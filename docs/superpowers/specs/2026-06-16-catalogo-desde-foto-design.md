# Hash IA · Chat — Sub-proyecto #5a: Catálogo desde foto (diseño)

**Fecha:** 2026-06-16
**Producto:** Hash IA · Chat (familia Ventas)
**Alcance:** poblar el catálogo fotografiando un menú / lista de precios → Gemini visión extrae productos → preview editable → crear en bulk.

## Contexto

El catálogo (`gastos/src/catalog`: `createProduct`, tabla `products` con nombre/precio_base/variantes/extras/stock/categoria) hoy se llena a mano (panel y app `ProductosView`, que vive dentro del módulo Chat). El backend ya hace OCR de facturas con Gemini visión (`ocr/gemini.js`, OpenAI-compat). Este sub-proyecto agrega cargar productos por foto.

> **#5 se decompuso en dos:** **5a foto** (este spec) y **5b voz con K.A.L.Y.** (tool `agregar_producto`, queda para después). Se hace 5a primero por ser el "killer" del onboarding (foto del menú → catálogo lleno).

## Objetivo

Que el dueño fotografíe su menú/lista y, tras un **preview editable**, cree varios productos de una. Nunca se auto-crea: siempre pasa por el preview.

## Decisiones (del usuario)
1. **Foto primero**, voz después.
2. v1 extrae **solo nombre + precio** (las variantes/tamaños/extras desde la foto quedan FUERA de v1; el dueño los agrega editando el producto).
3. **Preview obligatorio**: lista editable (nombre + precio) con checkboxes; el dueño corrige/desmarca; recién al confirmar se crea. No auto-crear.

## Alcance
**Dentro:** función de visión `extraerProductos`; `crearProductosBulk`; endpoints `POST /api/app/catalog/extraer` y `POST /api/app/products/bulk`; botón "Desde foto" + preview en `ProductosView`; tests.
**Fuera:** variantes/extras/stock desde la foto; voz K.A.L.Y. (5b); carga por foto desde el panel web (solo la app por ahora).

## Diseño

### `gastos/src/catalog/extraer.js` — `extraerProductos(imageBase64, mimeType, { http })`
- Llama a Gemini visión (OpenAI-compat, mismo patrón que `ocr/gemini.js`: `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, modelo `GEMINI_VISION_MODEL` o `gemini-2.5-flash`, `Authorization: Bearer GEMINI_API_KEY`, content con `image_url` data-uri + `response_format json_object`).
- Prompt: "Eres un asistente que lee un MENÚ o LISTA DE PRECIOS. Extrae los productos con su precio. Devuelve SOLO JSON `{ "productos": [{ "nombre": "<str>", "precio": <entero CLP> }] }`. Ignora títulos/secciones/teléfonos. Si un precio no se ve, usa 0."
- `http` inyectable (default `fetch`) para tests, como hace el resto del OCR.
- Parsea (tolerante a ```json fences) y **normaliza**: `nombre` recortado (≤120), `precio` entero ≥0; descarta items sin nombre; cap defensivo (≤100 productos). Devuelve `{ productos: [{ nombre, precio }] }`.

### `gastos/src/catalog/repo.js` — `crearProductosBulk(db, companyId, productos)`
- Para cada `{ nombre, precio }` válido (nombre no vacío): `createProduct(db, companyId, { nombre, precio_base: precio, tipo: 'producto' })`.
- Devuelve `{ creados: <n>, productos: [<creados>] }`. Cap defensivo (≤100). Scoped por `companyId`.

### Endpoints (`gastos/src/app/router.js`, token empleado)
- `POST /api/app/catalog/extraer` `{ imageBase64, mimeType }` → llama `extraerProductos` → `{ productos }`. **No crea nada.** 400 si falta imagen; 502 `ocr_falla` si la visión falla.
- `POST /api/app/products/bulk` `{ productos: [{ nombre, precio }] }` → `crearProductosBulk` → 201 `{ creados, productos }`. 400 si la lista viene vacía.

### App — `gastos-app/src/gastos/ProductosView.jsx`
- Botón **"📷 Desde foto"** (arriba, junto a "+ Nuevo"). Al tocarlo, abre la captura (reusa `EvidenceIntake` maxEvidence=1 o el `showNativeCapture`, igual que la captura de factura) → obtiene `imageBase64` → `api.catalogExtraer(imageBase64, mime)` → entra a modo **preview**.
- **Preview**: estado con la lista `[{ nombre, precio, incluir }]` (todos `incluir=true`). Render: por fila un input de nombre, un input de precio y un checkbox. Botones: **"Crear N productos"** (cuenta los `incluir`) → `api.crearProductosBulk(seleccionados)` → vuelve a la lista del catálogo refrescada; y **"Cancelar"**.
- `api.js`: `catalogExtraer(imageBase64, mimeType)` → `POST /catalog/extraer`; `crearProductosBulk(productos)` → `POST /products/bulk`.

## Manejo de errores
- Sin imagen → 400. Visión falla → 502 `ocr_falla`; la app muestra "No pude leer la foto, intenta de nuevo".
- Preview sin ninguno marcado → botón deshabilitado.
- Tenant: todo scoped por `companyId`.
- Productos leídos con precio 0 o nombre raro → el dueño los corrige/desmarca en el preview (por eso es obligatorio).

## Testing (TDD)
- **Backend** `extraer.test.js`: `extraerProductos` con `http` mock que devuelve un choices/message/content JSON → parsea y normaliza (`{productos:[{nombre,precio}]}`, precios enteros, descarta sin nombre, tolera fences).
- **Backend** `catalog/repo`: `crearProductosBulk` crea N productos scoped (verifica con `listProducts`), ignora sin nombre.
- **Backend** endpoints (pg-mem + supertest): `/catalog/extraer` con `extraerProductos` inyectable mock → `{productos}`; `/products/bulk` crea y aparecen en `/products`; 400/401.
- **App** `ProductosView`: mock `api.catalogExtraer` devolviendo 2 productos → tras "Desde foto" + captura, aparece el preview con los 2; al "Crear" llama `api.crearProductosBulk` con los marcados.
- Suite verde + build.

## Inyección para tests
- `createAppRouter({ db, extraerProductos })` — el router acepta `extraerProductos` inyectable (default el real), como ya hace con `extractExpense`/`extractCartola`, para testear `/catalog/extraer` sin pegarle a Gemini.

## Siguiente paso
Aprobar → `writing-plans`. Luego 5b (voz K.A.L.Y. con tool `agregar_producto`) o #6.
