# Hash IA · Chat — Sub-proyecto #3: Delivery / envío (zonas de comunas)

**Fecha:** 2026-06-16
**Producto:** Hash IA · Chat (familia Ventas)
**Alcance:** costo de despacho en el pedido, configurable por **zonas de comunas** (oficiales de Chile) + envío gratis sobre un monto.

## Contexto

El pedido (sub-proyecto #2: `gastos/src/pedidos` + `POST /api/app/pedido/from-catalog`) ya tiene `entrega` (retiro|despacho) + `direccion` (texto), e IVA configurable (`companies.pedido_iva_incluido`, endpoints `pedido-config`). Pero el **despacho NO suma costo**. Este sub-proyecto agrega el costo de envío.

## Objetivo

Que el negocio configure sus **zonas de despacho** (grupos de comunas con un costo) y, al crear un pedido con despacho, se elija la **comuna del cliente** → se resuelve la zona y su costo → se suma al total y se muestra en el texto del pedido.

## Decisiones (del usuario)
1. Modelo **zonas de comunas** (no plano suelto, no matcheo por texto): cada zona = `{ nombre, costo, comunas[] }`; el plano es simplemente **una zona**.
2. **Comunas oficiales de Chile por región** (dataset incluido): se eligen de una lista oficial, agrupadas por región, con buscador.
3. **Envío gratis sobre un monto** (opcional, global).
4. En el pedido, el dueño **elige la comuna a mano** (dropdown/buscador) → resuelve zona→costo automáticamente (evita adivinar comuna desde la dirección).
5. Reusar el patrón de la config de IVA (`pedido-config`).

## Alcance

**Dentro:** dataset de regiones/comunas; config de zonas + gratis_desde; función pura de costo de envío; suma en `from-catalog` + línea en `pedidoToText`; columnas en `pedidos`; selector de comuna en `PedidoBuilder` + total en vivo; armador de zonas en el panel Ajustes; tests.
**Fuera:** geolocalización/matcheo automático comuna↔dirección; tarifas por peso/distancia; integración con couriers. (Futuro.)

## Diseño

### Dataset de comunas — `gastos/src/pedidos/comunas-chile.js`
Exporta `REGIONES_COMUNAS`: arreglo de `{ region: '<nombre región>', comunas: ['<comuna>', …] }` con las **16 regiones** y sus comunas (División Político-Administrativa de Chile, ~346 comunas). Helper `TODAS_LAS_COMUNAS` (set/array plano) y `comunaExiste(nombre)` (case/acento-insensible). Se sirve a app y panel por endpoint (sin duplicar el dataset):
- `GET /api/app/comunas` y `GET /api/panel/comunas` → `REGIONES_COMUNAS`.

### Config de delivery — extender `pedido-config`
- Columnas nuevas en `companies` (ALTER idempotente en `ensurePedidosTable`): `delivery_zonas jsonb NOT NULL DEFAULT '[]'`, `delivery_gratis_desde integer` (nullable).
- `getPedidoConfig` ahora devuelve `{ pie, iva_incluido, delivery: { zonas, gratis_desde } }`; `setPedidoConfig` acepta `delivery` (set parcial). `zonas` normalizadas: `[{ id, nombre, costo(int≥0), comunas: [string] }]` (límite defensivo de zonas/comunas; ids generados).
- Endpoints `GET/PATCH /api/app/pedido-config` y `/api/panel/pedido-config` ya devuelven/aceptan la config; pasan a incluir `delivery`.

### Cálculo del envío — `costoEnvio(delivery, comuna, subtotal)` (PURO, en `gastos/src/pedidos/repo.js`)
- Busca la zona cuyo `comunas` contiene `comuna` (case/acento-insensible).
- Si no hay zona → `{ ok: false }` (no se despacha a esa comuna).
- Si `delivery.gratis_desde` y `subtotal >= gratis_desde` → `{ ok: true, costo: 0, gratis: true, zona }`.
- Si no → `{ ok: true, costo: zona.costo, gratis: false, zona }`.

### Pedido — `from-catalog` + `createPedido` + `pedidoToText`
- `pedidos` gana columnas (ALTER idempotente): `comuna text`, `envio_costo integer NOT NULL DEFAULT 0`, `envio_zona text`.
- `createPedido(db, companyId, d)`: acepta `comuna`, `envio_costo`, `envio_zona`; el **total** = subtotal de productos + impuesto + `envio_costo`.
- `POST /api/app/pedido/from-catalog`: si `entrega === 'despacho'` y viene `comuna`:
  - `cfg = getPedidoConfig`; `subtotalProductos = Σ items`; `r = costoEnvio(cfg.delivery, comuna, subtotalProductos)`.
  - Si `!r.ok` → 400 `{ error: 'sin_despacho_comuna' }` (la app avisa).
  - `envio_costo = r.costo`, `envio_zona = r.zona.nombre`; se pasa a `createPedido` con `comuna`.
- `pedidoToText`: si hay despacho con comuna, línea **"🚚 Despacho a <comuna>: <Gratis|$X>"** (en vez del "📦 Despacho a domicilio" genérico cuando hay comuna). El total ya incluye el envío.

### App — `PedidoBuilder` + `cart.js`
- `PedidoBuilder`: al elegir **Despacho**, además de la dirección, un **selector de comuna** (buscador, agrupado por región — carga `api.comunas()`); al elegir comuna, calcula el envío con un espejo `costoEnvioLocal(delivery, comuna, subtotal)` en `cart.js` y lo muestra en el total en vivo ("Envío: $X / Gratis / no disponible"). Carga `delivery` desde `api.getPedidoConfig()`.
- `cart.js`: `costoEnvioLocal(delivery, comuna, subtotal)` (espejo de `costoEnvio`, mismo contrato) + `cartTotalConEnvio(...)` o el total se compone en el builder. El servidor sigue siendo autoritativo al generar.
- `api.js`: `comunas()` → `GET /api/app/comunas`. El payload de `from-catalog` agrega `comuna`.

### Panel — Ajustes: armador de zonas
- En `gastos/public/panel/index.html` (sección Ajustes), bloque **"Zonas de despacho"**: lista de zonas (nombre, costo, nº comunas); agregar zona (nombre + costo + multi-select de comunas desde `GET /api/panel/comunas`, agrupadas por región); campo **"Envío gratis desde $___"**. Guarda con `PATCH /api/panel/pedido-config` (`delivery`).

## Manejo de errores
- Comuna sin zona → 400 `sin_despacho_comuna`; la app muestra "No tienes envío a esa comuna" y deja seguir con retiro o costo 0.
- Sin comuna en un despacho → envío 0 (compatibilidad; el dueño puede dejar dirección sin comuna).
- Tenant: todo scoped por `companyId`.

## Testing (TDD)
- **Backend** `comunas.test.js`: el dataset tiene 16 regiones, `comunaExiste('Providencia')` true e insensible a acentos/mayúsculas; cantidad de comunas razonable (>300).
- **Backend** `delivery-costo.test.js`: `costoEnvio` (comuna en zona → costo; gratis sobre X → 0; comuna sin zona → ok:false).
- **Backend** `pedido-config` ampliado: get/set `delivery` (zonas + gratis_desde), default `{zonas:[], gratis_desde:null}`.
- **Backend** `from-catalog` ampliado: despacho con comuna en zona suma el envío al total + `envio_zona`/`comuna` guardados; comuna sin zona → 400; gratis sobre X → envío 0; `pedidoToText` muestra la línea.
- **Backend** endpoint `GET /comunas` (app+panel) devuelve el dataset.
- **App** `cart.js`: `costoEnvioLocal` espejo (mismos casos).
- **App** `PedidoBuilder`: elegir despacho + comuna en zona → el total sube por el envío; comuna sin zona → muestra aviso.
- Mantener la suite verde + build.

## Siguiente paso
Aprobar → `writing-plans`. Luego #4 (PDF del pedido).
