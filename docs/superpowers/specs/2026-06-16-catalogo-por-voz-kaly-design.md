# Hash IA · Chat — Sub-proyecto #5b: Catálogo por voz con K.A.L.Y. (diseño)

**Fecha:** 2026-06-16
**Producto:** Hash IA · Chat (familia Ventas) + K.A.L.Y. (agente de voz global)
**Alcance:** poblar y mantener el catálogo hablándole a K.A.L.Y. ("agrega torta de chocolate a 18 mil", "súbele el precio al café a 2000", "ponle 20 de stock a la empanada", "qué productos tengo").

## Contexto

K.A.L.Y. es un agente Gemini Live (WebSocket BidiGenerateContent v1alpha) que vive como strip global arriba de todos los módulos de la app. Sus tools son **100% del lado de la app**: `gastos-app/src/gastos/kaly/tools.js` exporta `TOOL_DECLARATIONS` (function declarations de Gemini) y `executeTool(name, args)`, que llama métodos de `api.*`. `KalyAgent.jsx` cablea `onToolCall → executeTool → session.sendToolResponse`. Hoy KALY ya gestiona la parte de Finanzas (resumen, listar/marcar/anular movimientos, `crear_movimiento_manual`).

El backend de catálogo y los métodos de API ya existen (sub-proyectos #1 y #5a): `api.listProducts(incluirPausados)`, `api.createProduct(data)`, `api.updateProduct(id, patch)` pegan a `/api/app/products*` (scoped por `company_id`). **Este sub-proyecto NO toca el backend ni `api.js`**: solo agrega tools a KALY.

> **#5 se decompuso en 5a (foto, ✅ hecho y desplegado v3.5) y 5b (voz, este).** 5a es el killer del onboarding masivo (foto del menú → catálogo lleno); 5b es para agregar/ajustar de a uno hablando, sin tocar la pantalla.

## Objetivo

Que el dueño cree y ajuste productos por voz mientras hace otra cosa, con la misma fluidez que ya tiene para registrar un movimiento manual con KALY.

## Decisiones (del usuario)
1. **4 tools en v1:** `agregar_producto`, `editar_precio`, `editar_stock`, `listar_productos` (opciones "3 Y 4" del brainstorming).
2. **Actúa y confirma después** en las 4 (igual que `crear_movimiento_manual`): KALY ejecuta de una y confirma el resultado por voz/texto. No repite-y-espera-sí.
3. **Disponibles globalmente** (KALY es un solo cerebro): se pueden invocar desde cualquier módulo.

## Diseño

### Tools (`gastos-app/src/gastos/kaly/tools.js`)

Se agregan 4 entradas a `TOOL_DECLARATIONS` (formato Gemini: `{ name, description, parameters: { type:'OBJECT', properties, required } }`):

1. **`agregar_producto`** — props: `nombre` (STRING), `precio` (NUMBER), `tipo` (STRING enum `producto`/`servicio`, descripción "por defecto producto"). required: `['nombre','precio']`. Descripción: "Crea un producto nuevo en el catálogo. Confirma DESPUÉS de crearlo."
2. **`editar_precio`** — props: `nombre` (STRING, "nombre o parte del nombre del producto"), `nuevo_precio` (NUMBER). required ambos. Descripción: "Cambia el precio de un producto que ya existe."
3. **`editar_stock`** — props: `nombre` (STRING), `stock` (NUMBER). required ambos. Descripción: "Fija el stock disponible de un producto que ya existe."
4. **`listar_productos`** — props: `limite` (NUMBER, opcional). Descripción: "Lista los productos del catálogo con su precio y stock."

Ramas nuevas en `executeTool(name, args)` (dentro del `try/catch` existente que devuelve `{error:'fallo_operacion', detalle}` ante excepción):

```
agregar_producto:
  const r = await api.createProduct({ nombre: args.nombre, precio_base: Math.max(0, Math.round(Number(args.precio)||0)), tipo: args.tipo === 'servicio' ? 'servicio' : 'producto' });
  return { ok: true, nombre: r.nombre, precio: r.precio_base };

editar_precio / editar_stock:
  const rows = await api.listProducts(true);
  const prod = buscarProducto(rows, args.nombre);
  if (!prod) return { error: 'no_encontrado', detalle: 'No encontré ese producto en el catálogo.' };
  // editar_precio:
  const r = await api.updateProduct(prod.id, { precio_base: Math.max(0, Math.round(Number(args.nuevo_precio)||0)) });
  return { ok: true, nombre: prod.nombre, precio: r.precio_base };
  // editar_stock:
  const r = await api.updateProduct(prod.id, { stock: Math.max(0, Math.round(Number(args.stock)||0)) });
  return { ok: true, nombre: prod.nombre, stock: r.stock };

listar_productos:
  const rows = await api.listProducts(true);
  return { productos: rows.slice(0, args.limite || 10).map((p) => ({ nombre: p.nombre, precio: p.precio_base, stock: p.stock, activo: p.activo })) };
```

**`buscarProducto(rows, nombre)`** (helper puro, espejo de `buscarMovimiento`): devuelve el primer `r` cuyo `r.nombre` (minúsculas) *incluye* `nombre` (minúsculas), o `null`. v1: gana la primera coincidencia; no desambigua múltiples.

### Prompt (`gastos-app/src/gastos/kaly/prompt.js`)

Agregar un bloque a la instrucción de sistema de KALY: puede gestionar el catálogo de productos por voz con las tools `agregar_producto`, `editar_precio`, `editar_stock`, `listar_productos`; los precios son en pesos chilenos enteros (interpretar "18 mil" → 18000, "dos lucas" → 2000); **confirmar DESPUÉS** de ejecutar; no inventar productos; si una edición no encuentra el producto, decírselo al dueño y pedir el nombre exacto.

### Componentes / data flow
- Sin cambios en `KalyAgent.jsx`, `live.js`, `api.js` ni backend. El cableado `onToolCall → executeTool(name, args) → sendToolResponse(id, name, response)` ya existe y es genérico.
- Scoping multi-tenant: lo garantiza el backend vía el token del empleado; las tools no pasan `company_id`.

## Manejo de errores
- Excepción de red/API → `{error:'fallo_operacion', detalle}` (catch existente). KALY lo lee y se disculpa.
- Producto no encontrado en editar_precio/editar_stock → `{error:'no_encontrado', detalle}`. KALY pide el nombre exacto.
- Precio/stock no numérico o negativo → se normaliza a entero ≥0 (`Math.max(0, Math.round(...))`).

## Testing (TDD)
- `gastos-app/tests/gastos/kaly/tools.test.js` (mock de `api`):
  - `agregar_producto` llama `api.createProduct` con `precio_base` = precio redondeado y `tipo` default `producto` (y `servicio` cuando se pide); devuelve `{ok, nombre, precio}`.
  - `editar_precio` lista, encuentra por nombre parcial, llama `api.updateProduct(id, {precio_base})`, devuelve `{ok, nombre, precio}`.
  - `editar_stock` análogo con `{stock}`.
  - caso `no_encontrado` cuando el nombre no calza.
  - `listar_productos` mapea la lista a `{nombre, precio, stock, activo}` respetando `limite`.
- Suite app verde + `npm run build` OK.

## Fuera de v1
- Variantes/extras/unidad por voz (se editan a mano o quedan en el producto base).
- **Borrar** producto por voz (por seguridad; se hace a mano en ProductosView).
- Desambiguar cuando varios productos calzan con el nombre (v1 toma el primero).
- Cambios de backend (no hay).

## Siguiente paso
Aprobar → `writing-plans`. Luego #6 (onboarding de clientes actuales de gastos.atikodigital.cl). Despliegue de #5b = solo APK (frontend), sin backend.
