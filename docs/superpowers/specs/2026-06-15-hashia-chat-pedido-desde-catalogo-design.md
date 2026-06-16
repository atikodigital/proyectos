# Hash IA · Chat — Sub-proyecto #2: Crear pedido desde el catálogo (diseño)

**Fecha:** 2026-06-15
**Producto:** Hash IA · Chat (familia Ventas/CRM)
**Sub-proyecto:** #2 de 6 — Crear pedido desde el catálogo dentro del chat

## Contexto

El sub-proyecto #1 (Catálogo de productos) ya está hecho: tabla `products` con tipo/variantes/extras/stock y las funciones puras `priceForSelection(product, {opciones, extras})` y `desdePrice` en `gastos/src/catalog/repo.js`. Hoy, en la bandeja "Chat" (`gastos-app/src/gastos/ChatView.jsx`), el botón "Crear pedido" usa la IA (`pedidos/suggest.js` → `suggestOrder`) para **adivinar** el pedido del texto de la conversación. Este sub-proyecto lo reemplaza por **selección real del catálogo**: el usuario arma el pedido eligiendo productos, con precios exactos.

## Objetivo

Que dentro de una conversación del Chat, el usuario arme un pedido eligiendo productos del catálogo (una opción por grupo de variantes + extras + cantidad), vea el total, elija retiro/despacho, y genere el texto del pedido para enviarlo por WhatsApp — con el **precio calculado en el servidor** desde el catálogo, y el **IVA según una configuración previa del negocio**.

## Decisiones (del brainstorming)
1. **Solo catálogo** en el Chat: el botón "Crear pedido" abre el catálogo y reemplaza la detección por IA (la IA queda para el sub-proyecto #5, donde pre-llenará el carrito).
2. **IVA configurable por empresa** (una sola vez, no por pedido): interruptor "Mis precios ya incluyen IVA". ON (default) → total = suma directa, sin IVA aparte. OFF → se agrega 19% y se muestra la línea de IVA.
3. **El precio lo calcula el servidor** (autoritativo) desde el catálogo; el cliente solo muestra una vista previa.
4. `pedidos/suggest.js` y el endpoint `/overlay/pedido/suggest` **quedan intactos** (los usa la burbuja del overlay). Solo cambia el flujo del Chat.

## Alcance

**Dentro:**
- Config de IVA por empresa (`companies.pedido_iva_incluido`) + endpoints + toggle en Ajustes.
- Helper puro `describeSelection(product, selection)` (descripción de la línea).
- Endpoint `POST /api/app/pedido/from-catalog` que arma el pedido desde selecciones del catálogo.
- UI en la app: armador de pedido (catálogo → selector de producto → carrito → entrega → generar → enviar por WhatsApp), reemplazando el flujo de IA en `ChatView`.
- Tests TDD (backend pg-mem + app RTL).

**Fuera (otros sub-proyectos):**
- Costo de delivery / zonas de envío (#3).
- PDF del pedido (#4).
- Pre-llenar el carrito con IA/voz K.A.L.Y. (#5).
- Descuento automático de stock (depende de confirmar pedidos; futuro).

## Configuración de IVA por empresa

- Columna nueva `companies.pedido_iva_incluido boolean NOT NULL DEFAULT true` (ALTER idempotente).
- En `gastos/src/pedidos/repo.js`: extender la config de pedido (hoy `getCompanyPie`/`setCompanyPie`) con `getPedidoConfig(db, companyId)` → `{ pie, iva_incluido }` y `setPedidoConfig(db, companyId, { pie, iva_incluido })`. Las funciones `getCompanyPie`/`setCompanyPie` se mantienen (las usa el overlay).
- Endpoints `GET/PATCH /api/app/pedido-config` y `GET/PATCH /api/panel/pedido-config` (scoped por `companyId`) → leen/escriben `{ pie, iva_incluido }`. Los viejos `GET/PATCH /pedido-pie` se mantienen por compatibilidad.
- `impuesto_pct` del pedido = `iva_incluido ? 0 : 19`.

## Backend — armar el pedido

### `gastos/src/catalog/repo.js` — `describeSelection(product, selection)` (PURO)
Construye la descripción de una línea a partir del producto + la selección:
- Producto base: `nombre`.
- Por cada grupo de variantes con opción elegida: agrega `" (" + nombres de opciones elegidas join ", " + ")"`. Ej: `Torta de chocolate (15 personas, Red velvet)`.
- Extras elegidos: agrega `" + " + nombres join ", "`. Ej: `... + Velas, Dedicatoria`.
- Devuelve string acotado (≤ 200 chars, igual que `normalizeItems` de pedidos).

### `POST /api/app/pedido/from-catalog`
Body:
```json
{
  "channel": "whatsapp",
  "contact": { "name": "...", "phone": "..." },
  "lineas": [
    { "productId": "<uuid>", "opciones": { "<grupoId>": "<opcionId>" }, "extras": ["<extraId>"], "cantidad": 1 }
  ],
  "entrega": "retiro|despacho|null",
  "direccion": "<o null>",
  "nota": "<o null>"
}
```
Lógica (scoped por `req.auth.companyId`):
1. Por cada `linea`: `getProduct(companyId, productId)`. Si no existe → se omite esa línea (y si quedan 0 líneas válidas → 400 `sin_lineas`).
2. `precio_unitario = priceForSelection(product, { opciones, extras })`; `descripcion = describeSelection(product, { opciones, extras })`; `cantidad = max(1, entero)`.
3. `cfg = getPedidoConfig(db, companyId)`; `impuesto_pct = cfg.iva_incluido ? 0 : 19`.
4. `pedido = createPedido(db, companyId, { channel, contact_name, contact_phone, items, impuesto_pct, entrega, direccion, nota })` (reusa `pedidos/repo.js`; `createPedido` ya computa subtotal/impuesto/total y `pedidoToText` solo muestra la línea de IVA si `impuesto>0`).
5. `text = pedidoToText(pedido, { pie: cfg.pie })`; `waUrl = waLink(text, contact.phone)`.
6. Devuelve `{ pedido, text, waUrl }`.

Errores: sin líneas válidas → 400; sin auth → 401/403 (middleware existente).

## App — armador de pedido (`gastos-app/`)

Componentes nuevos en `gastos-app/src/gastos/pedido/`:
- **`cart.js`** (PURO): `lineLabel(product, sel)` (espejo de `describeSelection` para la vista previa), `linePrice(product, sel)` (espejo de `priceForSelection`), `cartTotal(lineas, { iva_incluido })`. Reusan la misma lógica de precio del backend (el backend sigue siendo autoritativo).
- **`ProductSelector.jsx`**: dado un producto, elige una opción por grupo (radio, **preselecciona la primera opción de cada grupo** para que siempre haya un precio válido), marca extras (checkbox), cantidad (− N +, mínimo 1), muestra `linePrice × cantidad` en vivo; botón "Agregar al carrito" → devuelve `{ productId, opciones, extras, cantidad }`.
- **`PedidoBuilder.jsx`**: orquesta. Al abrir: `api.listProducts()` + `api.getPedidoConfig()` (para el IVA del total en vivo). Estados: lista de catálogo → (tap producto) `ProductSelector` → carrito (líneas + total) → entrega (retiro/despacho + dirección) → "Generar pedido" (`api.pedidoFromCatalog(payload)`) → muestra `text` en un textarea editable + "Enviar por WhatsApp" (`waUrl`).
- **`ChatView.jsx`**: en `Conversacion`, el botón "Crear pedido" abre `PedidoBuilder` (pasándole `channel` y `contact`) en vez de llamar a `suggestOrder`. El resto del Chat (lista de conversaciones, captura) no cambia.
- **`api.js`**: `pedidoFromCatalog(payload)`, `getPedidoConfig()`, `setPedidoConfig(cfg)` (este último para el toggle).

### Toggle de IVA en Ajustes
- **Panel web** (`gastos/public/panel/index.html`, sección Ajustes): checkbox "Mis precios ya incluyen IVA" → `PATCH /api/panel/pedido-config`.
- (La app lee la config para la vista previa; el toggle vive en el panel para no recargar la pantalla de pedido. Si más adelante se quiere en la app, es aditivo.)

## Manejo de errores
- Producto inexistente en una línea → se omite; 0 líneas válidas → 400 `sin_lineas`.
- Generar pedido sin conexión / error servidor → mensaje claro en la app, no rompe el carrito.
- Tenant: todo scoped por `companyId`; nunca se arma con un producto de otra empresa (getProduct devuelve null cross-tenant).

## Testing (TDD, pg-mem + RTL)
- **Backend** `gastos/tests/catalog/describe.test.js`: `describeSelection` (producto simple, con variantes, con extras, con ambos).
- **Backend** `gastos/tests/pedidos/from-catalog.test.js` (pg-mem): siembra empresa+empleado+productos; postea selección → verifica items (descripción + precio_unitario = priceForSelection), total, `impuesto_pct` según `iva_incluido` (ON=0, OFF=19), entrega/dirección, scope por empresa, producto inexistente omitido, 400 sin líneas, `waUrl`.
- **Backend** `gastos/tests/pedidos/pedido-config.test.js`: get/set `pedido_iva_incluido` + `pie`, default true, scoped.
- **App** `gastos-app/tests/gastos/cart.test.js`: `linePrice`/`lineLabel`/`cartTotal` (con y sin IVA).
- **App** `gastos-app/tests/gastos/PedidoBuilder.test.jsx` (RTL, api mockeada): elegir producto → cambiar opción sube el precio → agregar al carrito → total correcto → "Generar pedido" llama `api.pedidoFromCatalog` con el payload esperado.

## Componentes y límites (isolation)
- `describeSelection` (puro, en catalog) ↔ `priceForSelection` (ya existe): juntos definen "cómo se ve y cuánto cuesta una línea". El endpoint `from-catalog` los orquesta + `pedidos/repo` (persistencia/texto). La app espeja la lógica de precio en `cart.js` solo para la vista previa. Cada archivo tiene una responsabilidad clara y se testea aislado.

## Siguiente paso
Tras aprobar este spec → `writing-plans` para el plan de implementación. Luego sub-proyecto #3 (config de delivery/envío con costo).
