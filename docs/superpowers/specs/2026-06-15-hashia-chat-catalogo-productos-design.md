# Hash IA · Chat — Sub-proyecto #1: Catálogo de productos (diseño)

**Fecha:** 2026-06-15
**Producto:** Hash IA · Chat (familia Ventas/CRM)
**Sub-proyecto:** #1 de 6 — Catálogo de productos (el cimiento)

## Contexto

Hash IA · Chat va a permitir crear **pedidos/cotizaciones dentro del chat** eligiendo productos de un **catálogo predefinido** (estilo "WhatsApp commerce"). Hoy el flujo de pedido (`gastos/src/pedidos`) adivina los productos y precios de la conversación o los deja en 0, porque **no existe un catálogo**. Este sub-proyecto construye ese catálogo: el modelo de datos + el panel para administrarlo. Todo lo demás (crear pedido desde el catálogo, delivery, PDF, KALY, onboarding) son sub-proyectos posteriores que lo consumen.

## Objetivo

Que un negocio pueda **definir sus productos y servicios** (con foto, precio, variantes, extras, stock) desde el **panel web** y desde la **app**, y que esos datos queden disponibles por API para que el sub-proyecto #2 arme pedidos. Multi-tenant: cada catálogo es de su empresa (`company_id`).

## Alcance

**Dentro:**
- Tabla `products` + módulo repo (CRUD, normalización) scoped por empresa.
- Endpoints en `/api/app` (token empleado) y `/api/panel` (token dueño), ambos acotados por `companyId`.
- Foto por producto (reusando el almacenamiento de fotos de factura).
- Pantalla "Productos" en panel web y en app: listado (ordenable, activo/pausado) + formulario (tipo, variantes, extras, stock).
- Tests TDD con pg-mem (repo + routers).

**Fuera (otros sub-proyectos):**
- Crear pedido desde el catálogo en el chat (#2).
- Config de delivery/envío (#3).
- PDF del pedido (#4).
- Poblar catálogo por voz K.A.L.Y. / foto (#5).
- Onboarding de clientes actuales (#6).
- **Descuento automático de stock** al confirmar pedido (depende de #2; aquí el stock es manual / informativo).

## Modelo de datos

Tabla nueva `products` (una fila por producto o servicio):

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `company_id` | uuid | scope multi-tenant (FK lógica a `companies`) |
| `tipo` | text | `'producto'` \| `'servicio'` (default `'producto'`) |
| `nombre` | text NOT NULL | |
| `descripcion` | text | opcional |
| `categoria` | text | opcional (texto libre) |
| `unidad` | text | servicio: `'hora'\|'sesion'\|'unidad'\|'m2'\|'fijo'`; producto: `'unidad'` por defecto |
| `foto_path` | text | opcional; archivo en UPLOADS_DIR |
| `precio_base` | integer NOT NULL | CLP, ≥ 0 (default 0) |
| `stock` | integer | NULL = no controla stock; sólo `producto`; en `servicio` siempre NULL |
| `variantes` | jsonb NOT NULL | grupos; default `'[]'` (ver forma abajo) |
| `extras` | jsonb NOT NULL | default `'[]'` |
| `orden` | integer NOT NULL | default 0 (para ordenar la lista) |
| `activo` | boolean NOT NULL | default true (pausar = false, borrado suave) |
| `created_at` / `updated_at` | timestamptz | |

**`variantes`** = lista de **grupos**, en cada grupo el cliente **elige una** opción y el `delta` se suma al precio:
```json
[
  { "id": "g1", "nombre": "Tamaño", "opciones": [
      { "id": "o1", "nombre": "10 personas", "delta": 0 },
      { "id": "o2", "nombre": "15 personas", "delta": 8000 },
      { "id": "o3", "nombre": "25 personas", "delta": 22000 } ] },
  { "id": "g2", "nombre": "Sabor", "opciones": [
      { "id": "o4", "nombre": "Chocolate", "delta": 0 },
      { "id": "o5", "nombre": "Red velvet", "delta": 3000 } ] }
]
```

**`extras`** = opcionales que se **suman** (multi-selección):
```json
[ { "id": "e1", "nombre": "Dedicatoria", "precio": 2000 },
  { "id": "e2", "nombre": "Velas", "precio": 1500 } ]
```

**Precio de una selección** (lo usará #2; lo definimos aquí para que el modelo sea coherente):
```
precio_linea = precio_base
             + Σ delta(opción elegida por cada grupo)
             + Σ precio(extras elegidos)
```
Si `variantes` está vacío, el precio es `precio_base`. El **"desde $X"** del listado = `precio_base + Σ menor delta de cada grupo`.

### Reglas de normalización (puras, testeables)

- `nombre` obligatorio, recortado; si vacío → error de validación.
- `tipo` ∈ {producto, servicio}; cualquier otro → `'producto'`.
- `precio_base`, `delta`, `precio` (extras): enteros; se redondean y se acotan (delta puede ser negativo, ej. "Niño −$2.000"; `precio_base`/`extras.precio` ≥ 0).
- `stock`: entero ≥ 0 o NULL; si `tipo='servicio'` → forzar NULL.
- `unidad`: si `servicio` y no viene, default `'sesion'`; si `producto`, `'unidad'`.
- `variantes`: arreglo de grupos; límites defensivos (máx ~8 grupos, ~40 opciones/grupo); cada grupo y opción recibe `id` (se genera si falta).
- `extras`: arreglo; límite defensivo (~40); cada uno con `id`.
- `orden`: entero (default 0).
- IDs de grupos/opciones/extras: `crypto.randomUUID()` corto si no vienen, para poder referenciarlos desde un pedido (#2) de forma estable.

## Componentes

### `gastos/src/catalog/repo.js`
Sigue el patrón de `gastos/src/pedidos/repo.js` (tabla creada de forma idempotente con `ensureProductsTable(db)` — `CREATE TABLE IF NOT EXISTS` + índices `(company_id)`, `(company_id, orden)`).

Funciones (todas acotadas por `company_id`):
- `normalizeProduct(data)` — **pura**, aplica las reglas de arriba.
- `desdePrice(product)` — **pura**, calcula el "desde $X" para el listado.
- `priceForSelection(product, selection)` — **pura**, calcula `precio_linea` (lo usará #2; se incluye y testea aquí).
- `listProducts(db, companyId, { incluirPausados })` — ordena por `orden, nombre`.
- `getProduct(db, companyId, id)` — NULL si no existe o es de otra empresa.
- `createProduct(db, companyId, data)` → producto creado.
- `updateProduct(db, companyId, id, data)` → NULL si no existe (cross-tenant seguro).
- `setActivo(db, companyId, id, activo)`.
- `reordenar(db, companyId, [{ id, orden }])` — set de posiciones.

### Fotos — reusar `gastos/src/expenses/storage.js`
`storeImage`/`readImage` ya guardan en `UPLOADS_DIR` con basename anti-traversal. Las fotos de producto usan key `product-<id>`; se guarda `foto_path` en la fila. Endpoint `GET .../products/:id/foto` devuelve el blob (auth + tenant), igual que las fotos de factura.

### API — endpoints (montados en AMBOS routers)
Para no duplicar lógica, los handlers son delgados y llaman al repo; `companyId = req.auth.companyId`. Se montan **idénticos** bajo `/api/app/products` (token empleado, en `src/app/router.js`) y `/api/panel/products` (token dueño, en `src/panel/router.js`):

- `GET /products?incluirPausados=1` → lista.
- `GET /products/:id` → uno (404 cross-tenant).
- `POST /products` → 201 creado.
- `PATCH /products/:id` → actualizado (404 si no existe).
- `PATCH /products/:id/activo` `{ activo }` → pausar/reactivar.
- `PATCH /products/orden` `{ orden: [{ id, orden }] }` → reordenar.
- `GET /products/:id/foto` → imagen.
- `POST /products/:id/foto` → sube/reemplaza la foto (reusa storage).

### UI
- **Panel web** (`gastos/public/panel/index.html`): nueva pestaña **"Productos"** — listado a la izquierda (foto, nombre, "desde $X · stock", activo/pausado, arrastrar para ordenar) + formulario a la derecha (tipo Producto/Servicio, foto, categoría, stock, precio base, grupos de variantes dinámicos con "+ Agregar grupo/opción", extras dinámicos, Guardar/Pausar). Vanilla JS contra `/api/panel/products`, mismo estilo negro/dorado.
- **App** (`gastos-app/src/gastos/`): pantalla **`ProductosView.jsx`** con el mismo listado + formulario, contra `/api/app/products`. Accesible desde el menú/configuración de la app (es una pantalla de setup, no de uso diario). La ubicación exacta en la navegación se decide en la implementación.

## Manejo de errores
- Validación → 400 con `{ error: 'validacion', detalle }` (nombre faltante, precio inválido).
- Recurso de otra empresa o inexistente → 404 (nunca filtrar datos cross-tenant).
- Sin token / token de otro kind → 401 / 403 (middleware existente `requireAuth`/`requireKind`).
- Foto inexistente → 404.

## Testing (TDD, pg-mem, sin Docker)
- `gastos/tests/catalog/repo.test.js`: normalización (tipo/variantes/extras/stock servicio→NULL/ids generados), `desdePrice`, `priceForSelection` (base + deltas + extras, deltas negativos), CRUD acotado por empresa, cross-tenant devuelve NULL/404, reordenar.
- `gastos/tests/app/products.test.js` y `gastos/tests/panel/products.test.js`: auth requerida, scope por empresa, 201/200/404, foto (storage inyectable como en el resto), `incluirPausados`.
- Mantener verde la suite completa (hoy 179).

## Decisiones cerradas (del brainstorming)
1. Modelo de producto: **con variantes + extras** (no simple).
2. Variantes: **varios grupos** ("elige uno" por grupo, el delta suma).
3. Extras: opcionales, se suman.
4. **Producto / Servicio**: el servicio se cobra por unidad y no lleva stock.
5. **Stock**: opcional y manual en este sub-proyecto (auto-descuento queda para cuando exista #2).
6. **Orden**: campo `orden`, lista ordenable.
7. Administrable desde **app y panel** (misma API, doble montaje).
8. Persistencia: **jsonb embebido** (1 tabla), consistente con `pedidos.items`/`raw_ocr`.

## Siguiente paso
Tras aprobar este spec → `writing-plans` para el plan de implementación del Catálogo. Luego sub-proyecto #2 (crear pedido desde el catálogo dentro del chat).
