# Catálogo por voz con K.A.L.Y. (Hash IA · Chat #5b) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **WORKTREE GUARD (cada subagente):** trabaja SOLO en `C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112`. Toda ruta debe contener `.claude\worktrees\dazzling-driscoll-78a112`. NUNCA edites `...\atiko\gastos-app\...` (copia de `main`). Antes de commitear: `git rev-parse --show-toplevel && git branch --show-current` → toplevel termina en `dazzling-driscoll-78a112`, branch `claude/dazzling-driscoll-78a112`. `git add <archivos específicos>`, nunca `git add -A` (hay trabajo paralelo "varas" en la rama). READ los archivos actuales antes de editar.

**Goal:** Que K.A.L.Y. cree y ajuste productos del catálogo por voz (agregar, editar precio, editar stock, listar).

**Architecture:** Frontend-only. Las tools de KALY viven en `gastos-app/src/gastos/kaly/tools.js` (`TOOL_DECLARATIONS` + `executeTool`) y llaman métodos que YA existen en `api.js` (`createProduct`, `updateProduct`, `listProducts`, todos scoped por empresa en el backend). Se agregan 4 declaraciones + 4 ramas + 1 helper de búsqueda, más un bloque al prompt de sistema. Sin cambios de backend ni de `api.js`.

**Tech Stack:** React/Capacitor app, jest + React Testing Library. TDD. Spec: `docs/superpowers/specs/2026-06-16-catalogo-por-voz-kaly-design.md`.

---

## Task 1: 4 tools de catálogo en KALY + prompt

**Files:**
- Modify: `gastos-app/src/gastos/kaly/tools.js`
- Modify: `gastos-app/src/gastos/kaly/prompt.js`
- Test: `gastos-app/tests/gastos/kaly-tools.test.js` (modificar el mock + el conteo + agregar tests)

### Paso 1: Escribe el test que falla

READ `gastos-app/tests/gastos/kaly-tools.test.js` primero. Aplica estos 3 cambios:

(a) Agrega `listProducts`, `createProduct`, `updateProduct` al mock de `api`:
```js
jest.mock('../../src/gastos/api', () => ({
  api: {
    agentPrefs: jest.fn(),
    listExpenses: jest.fn(),
    pagarExpense: jest.fn(),
    annulExpense: jest.fn(),
    resumenWhatsapp: jest.fn(),
    createManualExpense: jest.fn(),
    listProducts: jest.fn(),
    createProduct: jest.fn(),
    updateProduct: jest.fn(),
  },
}));
```

(b) Cambia el test de conteo de 7 a 11 y agrega los 4 nombres nuevos:
```js
test('TOOL_DECLARATIONS has 11 entries', () => {
  expect(TOOL_DECLARATIONS).toHaveLength(11);
  const names = TOOL_DECLARATIONS.map((t) => t.name);
  expect(names).toContain('guardar_preferencias');
  expect(names).toContain('obtener_resumen');
  expect(names).toContain('listar_movimientos');
  expect(names).toContain('marcar_pagada');
  expect(names).toContain('anular_movimiento');
  expect(names).toContain('enviar_resumen_whatsapp');
  expect(names).toContain('crear_movimiento_manual');
  expect(names).toContain('agregar_producto');
  expect(names).toContain('editar_precio');
  expect(names).toContain('editar_stock');
  expect(names).toContain('listar_productos');
});
```

(c) APPEND al final del archivo (antes de nada que cierre el módulo; van como tests sueltos):
```js
// ── catálogo por voz (#5b) ────────────────────────────────────────────────────

test('agregar_producto crea con precio_base redondeado y tipo default producto', async () => {
  api.createProduct.mockResolvedValue({ id: 'p1', nombre: 'Torta', precio_base: 18000 });
  const result = await executeTool('agregar_producto', { nombre: 'Torta', precio: 18000.4 });
  expect(api.createProduct).toHaveBeenCalledWith({ nombre: 'Torta', precio_base: 18000, tipo: 'producto' });
  expect(result).toEqual({ ok: true, nombre: 'Torta', precio: 18000 });
});

test('agregar_producto respeta tipo servicio', async () => {
  api.createProduct.mockResolvedValue({ id: 'p2', nombre: 'Asesoría', precio_base: 50000 });
  await executeTool('agregar_producto', { nombre: 'Asesoría', precio: 50000, tipo: 'servicio' });
  expect(api.createProduct).toHaveBeenCalledWith({ nombre: 'Asesoría', precio_base: 50000, tipo: 'servicio' });
});

test('editar_precio busca por nombre parcial y llama updateProduct con precio_base', async () => {
  api.listProducts.mockResolvedValue([
    { id: 'p1', nombre: 'Café cortado', precio_base: 1500 },
    { id: 'p2', nombre: 'Torta', precio_base: 18000 },
  ]);
  api.updateProduct.mockResolvedValue({ id: 'p1', nombre: 'Café cortado', precio_base: 2000 });
  const result = await executeTool('editar_precio', { nombre: 'café', nuevo_precio: 2000 });
  expect(api.listProducts).toHaveBeenCalledWith(true);
  expect(api.updateProduct).toHaveBeenCalledWith('p1', { precio_base: 2000 });
  expect(result).toEqual({ ok: true, nombre: 'Café cortado', precio: 2000 });
});

test('editar_precio devuelve no_encontrado si el nombre no calza', async () => {
  api.listProducts.mockResolvedValue([{ id: 'p2', nombre: 'Torta', precio_base: 18000 }]);
  const result = await executeTool('editar_precio', { nombre: 'pizza', nuevo_precio: 9000 });
  expect(api.updateProduct).not.toHaveBeenCalled();
  expect(result.error).toBe('no_encontrado');
});

test('editar_stock encuentra por nombre y llama updateProduct con stock', async () => {
  api.listProducts.mockResolvedValue([{ id: 'p3', nombre: 'Empanada', precio_base: 2500, stock: 5 }]);
  api.updateProduct.mockResolvedValue({ id: 'p3', nombre: 'Empanada', precio_base: 2500, stock: 20 });
  const result = await executeTool('editar_stock', { nombre: 'empanada', stock: 20 });
  expect(api.updateProduct).toHaveBeenCalledWith('p3', { stock: 20 });
  expect(result).toEqual({ ok: true, nombre: 'Empanada', stock: 20 });
});

test('listar_productos mapea nombre/precio/stock/activo y respeta limite', async () => {
  api.listProducts.mockResolvedValue([
    { id: 'p1', nombre: 'Torta', precio_base: 18000, stock: 3, activo: true },
    { id: 'p2', nombre: 'Café', precio_base: 1500, stock: null, activo: true },
    { id: 'p3', nombre: 'Jugo', precio_base: 2000, stock: 10, activo: false },
  ]);
  const result = await executeTool('listar_productos', { limite: 2 });
  expect(api.listProducts).toHaveBeenCalledWith(true);
  expect(result.productos).toHaveLength(2);
  expect(result.productos[0]).toEqual({ nombre: 'Torta', precio: 18000, stock: 3, activo: true });
});
```

### Paso 2: Corre y verifica FAIL
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos-app" && npx jest tests/gastos/kaly-tools.test.js
```
Esperado: FAIL (conteo 7≠11, tools nuevas devuelven `tool_desconocida`).

### Paso 3: Implementa

(a) En `gastos-app/src/gastos/kaly/tools.js`, agrega las 4 declaraciones al final del array `TOOL_DECLARATIONS` (antes del `]` de cierre, tras `crear_movimiento_manual`):
```js
  ,
  { name: 'agregar_producto', description: 'Crea un producto nuevo en el catálogo de ventas. Confirma DESPUÉS de crearlo.', parameters: { type: 'OBJECT', properties: { nombre: { type: 'STRING', description: 'Nombre del producto' }, precio: { type: 'NUMBER', description: 'Precio en pesos chilenos enteros' }, tipo: { type: 'STRING', enum: ['producto', 'servicio'], description: 'por defecto producto' } }, required: ['nombre', 'precio'] } },
  { name: 'editar_precio', description: 'Cambia el precio de un producto que YA existe en el catálogo.', parameters: { type: 'OBJECT', properties: { nombre: { type: 'STRING', description: 'nombre o parte del nombre del producto' }, nuevo_precio: { type: 'NUMBER', description: 'nuevo precio en CLP entero' } }, required: ['nombre', 'nuevo_precio'] } },
  { name: 'editar_stock', description: 'Fija el stock disponible de un producto que YA existe.', parameters: { type: 'OBJECT', properties: { nombre: { type: 'STRING', description: 'nombre o parte del nombre del producto' }, stock: { type: 'NUMBER', description: 'unidades disponibles' } }, required: ['nombre', 'stock'] } },
  { name: 'listar_productos', description: 'Lista los productos del catálogo con su precio y stock.', parameters: { type: 'OBJECT', properties: { limite: { type: 'NUMBER' } } } }
```

(b) Agrega el helper `buscarProducto` justo después de `buscarMovimiento`:
```js
function buscarProducto(rows, nombre) {
  const q = String(nombre || '').toLowerCase();
  return rows.find((r) => String(r.nombre || '').toLowerCase().includes(q)) || null;
}
```

(c) Agrega las 4 ramas dentro de `executeTool`, justo antes de `return { error: 'tool_desconocida' };`:
```js
    if (name === 'agregar_producto') {
      const r = await api.createProduct({ nombre: args.nombre, precio_base: Math.max(0, Math.round(Number(args.precio) || 0)), tipo: args.tipo === 'servicio' ? 'servicio' : 'producto' });
      return { ok: true, nombre: r.nombre, precio: r.precio_base };
    }
    if (name === 'editar_precio' || name === 'editar_stock') {
      const rows = await api.listProducts(true);
      const prod = buscarProducto(rows, args.nombre);
      if (!prod) return { error: 'no_encontrado', detalle: 'No encontré ese producto en el catálogo.' };
      if (name === 'editar_precio') {
        const r = await api.updateProduct(prod.id, { precio_base: Math.max(0, Math.round(Number(args.nuevo_precio) || 0)) });
        return { ok: true, nombre: prod.nombre, precio: r.precio_base };
      }
      const r = await api.updateProduct(prod.id, { stock: Math.max(0, Math.round(Number(args.stock) || 0)) });
      return { ok: true, nombre: prod.nombre, stock: r.stock };
    }
    if (name === 'listar_productos') {
      const rows = await api.listProducts(true);
      return { productos: rows.slice(0, args.limite || 10).map((p) => ({ nombre: p.nombre, precio: p.precio_base, stock: p.stock, activo: p.activo })) };
    }
```

(d) En `gastos-app/src/gastos/kaly/prompt.js`, dentro de `buildSystemPrompt`, inserta un bloque de catálogo. Pon esta sección justo ANTES de `\n\n${resumenBloque}` (es decir, después de la línea `- Pago Banco: Cargo a Proveedores, Abono a Banco.` y su cierre de sección 9):
```js

## 10. Gestión del Catálogo de Productos por Voz (Ventas)
Puedes administrar el catálogo de productos/servicios del negocio por voz con estas herramientas:
- \`agregar_producto\`: crea un producto nuevo (ej. "agrega torta de chocolate a 18 mil").
- \`editar_precio\`: cambia el precio de uno existente (ej. "súbele el precio al café a 2000").
- \`editar_stock\`: fija el stock disponible (ej. "ponle 20 de stock a la empanada").
- \`listar_productos\`: dile al dueño qué productos tiene y a qué precio.
Reglas:
- Los precios son en pesos chilenos ENTEROS. Interpreta el lenguaje natural ("18 mil" → 18000, "dos lucas" → 2000, "mil quinientos" → 1500).
- ACTÚA primero y CONFIRMA después en una frase (ej. "Listo, agregué Torta de chocolate a $18.000").
- No inventes productos ni precios. Si \`editar_precio\` o \`editar_stock\` devuelve no_encontrado, dile al dueño que no lo encontraste y pídele el nombre exacto.
- NO existe borrar producto por voz; si lo piden, indica que eso se hace a mano en la pantalla de Productos.
```
(Concatena este string dentro del template literal en ese punto. Mantén los backticks escapados como `\`` igual que el resto del archivo ya hace con los nombres de herramientas.)

### Paso 4: Corre y verifica PASS
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos-app" && npx jest tests/gastos/kaly-tools.test.js
```
Esperado: PASS (todos, incluidos los 6 nuevos y el conteo 11).

### Paso 5: GUARDA y commit
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112" && git rev-parse --show-toplevel && git branch --show-current && git add gastos-app/src/gastos/kaly/tools.js gastos-app/src/gastos/kaly/prompt.js gastos-app/tests/gastos/kaly-tools.test.js && git commit -m "feat(kaly): catálogo por voz — agregar/editar precio/editar stock/listar productos"
```

---

## Task 2: Verificación final (suite app + build)

- [ ] **Step 1: Suite completa app**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos-app" && npx jest
```
Esperado: TODO verde (no se rompió ningún test existente, incl. KalyAgent).

- [ ] **Step 2: Build**
```
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos-app" && npm run build
```
Esperado: build OK.

(No hay commit en esta tarea; es solo verificación.)

---

## Notas de despliegue (con el usuario después)
- **Solo app** (frontend). Sin deploy de backend. Rebuild APK (→ v3.6/versionCode 36) + `upload-apk-wt.js`.

## Self-review (hecho)
- **Cobertura del spec:** 4 tools (agregar/editar_precio/editar_stock/listar) ✅(T1); actúa-y-confirma vía prompt ✅(T1.d); búsqueda por nombre parcial con `buscarProducto` ✅; no_encontrado ✅; precio/stock normalizado a entero ≥0 ✅; mapeo precio→precio_base ✅; sin backend ni api.js ✅. Tests de cada tool + conteo ✅. Verificación suite+build ✅(T2).
- **Sin placeholders:** código completo (declaraciones, helper, ramas, prompt, tests).
- **Consistencia:** `precio`(tool) → `precio_base`(api) en agregar y editar_precio; `editar_precio`/`editar_stock` comparten la búsqueda; `listar_productos` devuelve `precio` = `precio_base`. Los nombres de tool en las declaraciones, en `executeTool`, en el prompt y en los tests coinciden exactamente.
