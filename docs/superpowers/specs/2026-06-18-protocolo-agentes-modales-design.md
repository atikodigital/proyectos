# Protocolo de interacción de agentes IA (modales + captura) — Diseño

**Fecha:** 2026-06-18
**Producto:** app `gastos-app` de Hash IA (React + Capacitor). Repo `HASH IA`, branch `master`.
**Alcance:** un protocolo UNIFICADO y reutilizable para que los agentes IA (KALY voz, VARAS contador por chat) interactúen con el usuario de dos formas estandarizadas:
- **(A) Pedir información** → muestra los affordances de **captura de pantalla / foto / subir archivo**.
- **(B) Crear / sugerir / modificar datos** → presenta la **propuesta en una ventana emergente** editable (Confirmar / Editar / Cancelar).

## Decisiones (del usuario, vía brainstorming)
1. **No** todo lo del agente es modal: la charla casual de KALY sigue por voz. El protocolo se dispara SOLO en (A) pedir info y (B) proponer acción.
2. **(A) y (B) son protocolos separados.** El modal de propuesta (B) **no** lleva barra de adjuntos; la captura (A) aparece solo cuando el agente pide información.
3. **Agentes en esta entrega:** KALY **y** VARAS, ambos sobre los mismos componentes reutilizables.
4. **Modal de propuesta:** Confirmar / **Editar** / Cancelar (el usuario puede corregir los datos propuestos antes de confirmar).

## Contexto (ya existente)
- `gastos-app/src/components/EvidenceIntake.jsx` — componente de captura (pantalla/foto/archivo) → entrega imagen(es) base64 vía `onChange`. Se reusa para (A).
- KALY: `kaly/KalyAgent.jsx` (orquesta la sesión Gemini Live; `onToolCall` → `executeTool(name, args, ctx)` de `kaly/tools.js` → `sendToolResponse`). `kaly/tools.js` declara tools y las ejecuta llamando a `api`.
  - **Tools de ESCRITURA (van a B):** `crear_movimiento_manual`, `agregar_producto`, `editar_precio`, `editar_stock`, `recordar`, `marcar_pagada`, `anular_movimiento`, `enviar_resumen_whatsapp`, `guardar_preferencias`.
  - **Tools de LECTURA (no cambian):** `obtener_resumen`, `listar_movimientos`, `listar_productos`.
- VARAS: `VarasChat.jsx` / `VarasVoice.jsx`; acciones de escritura vía `api.varasAccion(tipo, args)` / `api.varasTool`.
- `api.js` ya tiene los endpoints reales (createManualExpense, createProduct, updateProduct, kalyRecordar, pagarExpense, annulExpense, resumenWhatsapp, agentPrefs, etc.) y la captura→OCR (`createExpense`, `catalogExtraer`, `matchCartola`).

## Diseño

### Pieza central — `AgentInteractionProvider` + `useAgentInteraction` (el "bus")
Un contexto React montado alto en la app (en `GastosApp`) que renderiza los dos overlays y expone dos métodos que devuelven **promesas**:
- `proponer(propuesta) → Promise<datosConfirmados | null>` — abre `AgentProposalModal`; resuelve con los datos (posiblemente editados) si el usuario confirma, o `null` si cancela.
- `pedirEvidencia({ motivo }) → Promise<{ imageBase64, mimeType } | null>` — abre un overlay con `EvidenceIntake`; resuelve con la imagen capturada o `null` si cancela.
- El provider mantiene una cola/estado de "interacción activa"; solo una a la vez (las demás esperan). Mientras hay una interacción abierta, emite una señal para **pausar la voz de KALY** (callback `onAbrir`/`onCerrar` o un flag que `KalyAgent` observa con `setMuted`).

**Forma de la propuesta** (normalizada, para no necesitar un form por tipo):
```
{
  titulo: string,                 // "Crear producto", "Marcar gasto como pagado", ...
  accion: string,                 // id de la acción (p. ej. 'crearProducto') — informativo
  campos: [                       // editables; el modal arma inputs según tipo
    { key: string, label: string, valor: any, tipo: 'texto'|'numero'|'opciones', opciones?: string[] }
  ],
  nota?: string                   // texto aclaratorio opcional
}
```
`datosConfirmados` = `{ [campo.key]: valorEditado }`.

### `AgentProposalModal` (caso B) — genérico y editable
- Overlay centrado (patrón `fixed inset-0`), título, `nota`, y un input por cada `campo` según su `tipo` (`texto`→input/textarea, `numero`→input number, `opciones`→select).
- Botones: **Cancelar** (resuelve `null`), **Confirmar** (resuelve el objeto con los valores actuales de los campos). "Editar" no es un botón aparte: los campos ya son editables; "Confirmar" usa lo que esté escrito.
- Accesible: `role="dialog"`, foco inicial, cerrar con Esc = cancelar.
- **Sin** barra de captura/adjuntos.

### Captura (caso A) — overlay con `EvidenceIntake`
- Overlay simple con el `motivo` ("KALY te pide: la boleta") + `EvidenceIntake` (pantalla/foto/archivo) + Cancelar.
- Al capturar, resuelve `{ imageBase64, mimeType }`; el código que pidió la evidencia decide qué hacer (OCR/createExpense/matchCartola/etc.).

### Integración KALY (`kaly/tools.js` + `KalyAgent.jsx`)
- `KalyAgent` obtiene `{ proponer, pedirEvidencia }` de `useAgentInteraction()` y los pasa en el `ctx` de `executeTool`.
- `executeTool(name, args, ctx)`: para cada tool de **escritura**, en vez de llamar a `api` directo:
  1. arma la `propuesta` (mapea `args` → `campos`).
  2. `const datos = await ctx.proponer(propuesta);`
  3. si `datos` → llama al `api.*` real con `datos`; devuelve a KALY "listo, confirmado".
  4. si `null` → devuelve "el usuario canceló"; KALY lo dice por voz.
- Tools de **lectura** quedan igual.
- Pedido de documento: si KALY necesita una boleta/cartola, la tool usa `ctx.pedirEvidencia({motivo})` → con la imagen llama al flujo correspondiente (`api.createExpense`, etc.).
  - (Para esto se agrega una tool `pedir_documento({ motivo, destino })` declarada a KALY, mapeada a `pedirEvidencia` + el handler de `destino` — gasto/cartola.)

### Integración VARAS (`VarasChat.jsx` / `varas`)
- Antes de ejecutar una acción de escritura (`api.varasAccion(tipo, args)`), VARAS arma una `propuesta` y `await proponer(...)`; solo si se confirma, ejecuta. Los pedidos de documento usan `pedirEvidencia`.

### Data flow (caso B, ejemplo "agregar producto" por voz)
1. KALY (Live) llama tool `agregar_producto({nombre:'Empanada', precio:1500})`.
2. `executeTool` arma propuesta `{titulo:'Crear producto', campos:[nombre, precio, tipo]}` → `proponer`.
3. El provider pausa la voz, abre `AgentProposalModal`.
4. El usuario corrige precio a 1600 → Confirmar → resuelve `{nombre, precio:1600, tipo}`.
5. `executeTool` llama `api.createProduct({...})`; devuelve a KALY "producto creado a $1.600"; KALY lo confirma por voz; la voz se reanuda.

### Manejo de errores / bordes
- Si `api.*` falla tras confirmar, se le informa al agente (string de error) y este lo comunica.
- Solo una interacción a la vez; si el agente dispara otra mientras hay una abierta, espera (cola).
- Cancelar siempre es seguro (no ejecuta nada).
- Multi-tenant/seguridad: sin cambios de backend salvo (si hiciera falta) una tool nueva; las acciones reales ya son endpoints autenticados existentes.

### Testing (TDD, app jest+RTL)
- `AgentProposalModal`: renderiza los campos según tipo; editar un campo y Confirmar resuelve con el valor editado; Cancelar resuelve `null`.
- `AgentInteractionProvider`/`useAgentInteraction`: `proponer` abre el modal y su promesa resuelve al confirmar/cancelar; `pedirEvidencia` abre el overlay de captura y resuelve con la imagen/null; una sola interacción a la vez.
- Captura overlay: muestra el motivo + `EvidenceIntake`; capturar resuelve la imagen.
- Wiring KALY: una tool de escritura (p. ej. `agregar_producto`) pasa por `proponer` y solo llama a `api.createProduct` si se confirma (mock de `proponer` y de `api`). Una tool de lectura NO abre modal.
- Wiring VARAS: una acción de escritura pasa por `proponer` antes de ejecutar.
- Suite app verde + build. (Backend: sin cambios, salvo eventual tool nueva → su test.)

## Fuera de alcance (YAGNI)
- Que TODA respuesta del agente sea modal.
- Adjuntos dentro del modal de propuesta.
- Tipos de campo más allá de texto/número/opciones.
- Aplicar a otros agentes fuera de KALY/VARAS (el bus queda listo para reusarse después).

## Orden sugerido (para el plan)
Componentes reutilizables (modal + captura + provider/bus) → wiring KALY → wiring VARAS → suite/build. Cada parte es testeable por separado.

## Siguiente paso
Aprobar → `writing-plans`.
