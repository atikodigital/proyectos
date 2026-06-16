# Chat v2 — Productos dentro de Chat + responder (diseño)

**Fecha:** 2026-06-16
**Producto:** Hash IA (app `gastos-app`) — módulo Chat (familia Ventas)
**Alcance:** mover el catálogo "Productos" DENTRO del módulo Chat, y volver la conversación más "chat" (redactar respuesta → WhatsApp + crear pedido inline). Solo frontend.

## Contexto

Hoy la app tiene 6 pestañas (Captura · Movimientos · Transaccional · **Chat** · **Productos** · Match). `ChatView.jsx` es una bandeja: lista de conversaciones (captura por notificaciones, read-only) → al abrir una, muestra los mensajes + botón "🧾 Crear pedido" que abre `PedidoBuilder` (sub-proyecto #2). `ProductosView.jsx` es el catálogo (sub-proyecto #1), hoy en su propia pestaña.

## Constraint técnico (decidido, ver decomposición)
El Chat es read-only porque **enviar de vuelta** a WhatsApp/Messenger/IG normal no se puede 100% in-app sin la **API oficial** (omnicanal multi-tenant, App Review) o accesibilidad (descartada). Lo que SÍ se hace ahora: redactar la respuesta en la app y **abrir WhatsApp con el texto** (wa.me) para que el usuario la envíe con un toque. **Audio, descargar archivos y envío/recepción 100% in-app quedan FUERA** (dependen del App Review).

## Objetivo

Chat module unificado: un selector "Conversaciones | Productos", y una conversación donde ves los mensajes, **redactas una respuesta que se envía por WhatsApp**, y creas un pedido del catálogo inline.

## Decisiones (del usuario)
1. **Mover Productos a Chat**: sacar la pestaña "Productos" del menú inferior (quedan 5 tabs) y meterla dentro de Chat con un selector.
2. **Conversación con respuesta**: caja para redactar → "Responder por WhatsApp" (abre WhatsApp con el texto) + mostrar la respuesta en el hilo (lado "yo"). Crear pedido inline (ya existe).
3. **Sin audio, sin archivos, sin envío in-app** (fuera de alcance, requiere API oficial).
4. Solo frontend; sin backend nuevo.

## Diseño

### `GastosApp.jsx` — quitar la pestaña Productos
- Quitar el botón `data-tab` **Productos** del `<nav>` inferior (quedan: Captura · Movimientos · Transaccional · Chat · Match).
- Quitar la rama de render `tab === 'productos' ? <ProductosView /> : …`.
- Quitar el `import ProductosView` (se usa ahora dentro de `ChatView`).

### `ChatView.jsx` — selector + conversación con respuesta
- **Import** `ProductosView` y los helpers de wa.me.
- **Estado nuevo** `vista` (`'conversaciones' | 'productos'`, default `'conversaciones'`).
- **Selector** arriba (segment de 2 botones "Conversaciones | Productos"); con `productos` seleccionado → renderiza `<ProductosView />`; con `conversaciones` → la lista actual de conversaciones. (El selector se ve en la lista; al entrar a una conversación se oculta, hay botón ←.)
- **`Conversacion`** (al abrir un chat):
  - Mantiene la lista de mensajes capturados.
  - **Caja de respuesta** abajo (sobre/junto al botón Crear pedido): input "Escribe una respuesta…" + botón **"Responder por WhatsApp"**. Al enviar:
    - Construye la URL wa.me: si `conv.contact` parece teléfono chileno (solo dígitos, ≥8), `https://wa.me/<56xxxxxxxxx>?text=<reply>`; si no, `https://wa.me/?text=<reply>` (abre WhatsApp para elegir chat). Helper local `waLinkLocal(text, contact)`.
    - Abre la URL (`window.open(url, '_blank')` con fallback `location.href`).
    - Agrega la respuesta al hilo local como mensaje propio `{ text, mine: true }` (optimista, solo UI — el envío real ocurre en WhatsApp; no se persiste).
    - Limpia el input.
  - Mantiene "🧾 Crear pedido" → `PedidoBuilder` (sin cambios).
- Render del hilo: los mensajes capturados a la izquierda; los `mine:true` a la derecha (alineados, color dorado) para que se vea como conversación.

### Errores / bordes
- Sin teléfono utilizable → wa.me sin número (abre WhatsApp, el usuario elige el chat). No es error.
- `window.open` bloqueado → fallback `location.href`.
- Respuesta vacía → botón deshabilitado.

## Testing (jest + RTL)
- `ChatView`: (a) el selector "Conversaciones | Productos" está presente; al hacer click en "Productos" se renderiza `ProductosView` (mockear `api.listProducts`); (b) la conversación muestra la caja "Escribe una respuesta…"; escribir + "Responder por WhatsApp" llama `window.open` con una URL `wa.me` que contiene el texto codificado, y la respuesta aparece en el hilo como propia. (Mock `window.open`, `api.chatConversaciones`, `api.chatMensajes`.)
- `GastosApp`: el nav ya NO tiene `data-tab="productos"`; el render de Chat sigue ok. Ajustar el test existente de GastosApp si asume 6 tabs.
- Mantener la suite app verde + build.

## Fuera de alcance (futuro, API oficial / omnicanal)
- Envío y recepción 100% in-app, audio nativo, descargar archivos/adjuntos. Eso es el SaaS omnicanal multi-tenant (App Review de Meta), no este sub-proyecto.

## Siguiente paso
Aprobar → `writing-plans`. Luego deploy de TODO junto (KALY + Chat v2): rebuild APK.
