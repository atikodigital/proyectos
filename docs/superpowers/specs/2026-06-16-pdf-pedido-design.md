# Hash IA · Chat — Sub-proyecto #4: PDF del pedido (diseño)

**Fecha:** 2026-06-16
**Producto:** Hash IA · Chat (familia Ventas)
**Alcance:** generar un PDF de la cotización/pedido y poder descargarlo/abrirlo desde la app.

## Contexto

El pedido (`gastos/src/pedidos`: `createPedido`, `pedidoToText`, items, subtotal/IVA/envío/total, entrega/comuna/direccion, `companies.pedido_pie`) hoy se manda como **texto** por wa.me (`POST /api/app/pedido/from-catalog` → `{ pedido, text, waUrl }`). Este sub-proyecto agrega un **PDF** de la cotización.

## Objetivo

Que, tras generar un pedido, el dueño pueda obtener un **PDF lindo** de la cotización (mismos datos que el texto, mejor presentado) y descargarlo/abrirlo desde la app.

## Decisiones (del usuario)
1. Librería **`pdfkit`** (pura Node, liviana; sin navegador headless). El backend ya usa `exceljs` para Excel.
2. **Sin logo en v1** (header = nombre + datos del negocio = el `pie`). El logo es mejora futura.
3. v1 = **generar + descargar/abrir** el PDF desde la app. El **share-intent nativo** (compartir el PDF como adjunto a WhatsApp con un toque, vía @capacitor/share + filesystem) es **mejora siguiente**, NO va en v1. El texto por wa.me sigue igual.

## Alcance
**Dentro:** dependencia pdfkit; `buildPedidoPdf`; `getPedido` por id; endpoint `GET /api/app/pedido/:id/pdf`; botón "PDF" en la pantalla "Pedido listo" de `PedidoBuilder` (descarga/abre); tests.
**Fuera:** logo del negocio; share-intent nativo a WhatsApp; PDF para los pedidos del overlay/burbuja (solo el flujo del catálogo).

## Diseño

### `gastos/src/pedidos/pdf.js` — `buildPedidoPdf(pedido, opts)`
- Firma: `buildPedidoPdf(pedido, { pie })` → `Promise<Buffer>` (pdfkit escribe a un stream; se resuelve el Buffer en el evento `end`).
- Reusa los helpers de `repo.js`: `fmtCLP`, `nroCotizacion`.
- Layout (una página A4, márgenes ~40):
  - **Encabezado**: el `pie` (nombre + datos del negocio) en grande arriba; si no hay pie, "Cotización".
  - **N° cotización** `COT-XXXXXX` + fecha (`created_at` o hoy).
  - **Tabla de items**: columnas Descripción · Cant · P. Unit · Subtotal (una fila por item; `cantidad × precio_unitario`).
  - **Totales** (alineados a la derecha): Subtotal; IVA (solo si `impuesto > 0`); 🚚 Despacho (solo si `envio_costo > 0`, con la comuna); **Total** en negrita.
  - **Entrega**: "Retiro en tienda" o "Despacho a `<comuna>`" + dirección si hay.
  - **Cliente**: `contact_name` · `contact_phone` si hay.
  - **Pie de página**: "¿Confirmamos? Responde y avanzamos."
- Texto plano, sin imágenes; CLP con `fmtCLP`. Pura respecto a la DB (recibe el `pedido` ya cargado).

### `gastos/src/pedidos/repo.js` — `getPedido(db, companyId, id)`
- `SELECT * FROM pedidos WHERE company_id = $1 AND id = $2` → fila o `null` (cross-tenant seguro). Exportar.

### Endpoint `GET /api/app/pedido/:id/pdf`
- `getPedido(db, req.auth.companyId, req.params.id)`; si no existe → 404 `no_existe`.
- `pie = getCompanyPie(...)` (o `getPedidoConfig().pie`); `buf = await buildPedidoPdf(ped, { pie })`.
- Responder con `Content-Type: application/pdf`, `Content-Disposition: inline; filename="cotizacion-<COT>.pdf"`, body = buffer.
- Guard de UUID no-válido → 404 (mismo patrón que las otras rutas `/:id`).

### App — `gastos-app/`
- `api.js`: `async pedidoPdfBlob(id)` → fetch autenticado a `/api/app/pedido/${id}/pdf`; si `!ok` → null; si ok → `await res.blob()` (igual patrón que `fotoUrl`). Y `pedidoPdfAbrir(id)`: obtiene el blob → `URL.createObjectURL(blob)` → `window.open(url, '_blank')` (fallback `location.href`).
- `PedidoBuilder.jsx`: en `generar()`, guardar el id: `setPedido({ id: r.pedido && r.pedido.id, text, waUrl })`. En la pantalla "Pedido listo", botón **"📄 PDF"** (junto a "Enviar por WhatsApp") que llama `api.pedidoPdfAbrir(pedido.id)`. Si no hay id, el botón no se muestra.

## Manejo de errores
- Pedido inexistente/cross-tenant → 404.
- PDF que falla al generar → 500 (el endpoint con try/catch como sus hermanas).
- App: si el blob viene null → mensaje "No pude abrir el PDF".

## Testing (TDD)
- **Backend** `pdf.test.js`: `buildPedidoPdf(pedidoFake, { pie: 'Atiko SpA' })` → Buffer cuyo inicio es `%PDF` (`buf.slice(0,4).toString() === '%PDF'`) y `buf.length > 500`. (El contenido textual de pdfkit va comprimido; se valida estructura, no strings.)
- **Backend** endpoint (pg-mem + supertest): crear un pedido (vía createPedido o from-catalog), `GET /api/app/pedido/:id/pdf` → 200, `content-type` `application/pdf`, body empieza con `%PDF`; pedido de otra empresa / id inexistente → 404; sin token → 401.
- **App** `PedidoBuilder.test.jsx`: tras generar (mock `from-catalog` que devuelve `{ pedido: { id: 'p9' }, text, waUrl }`), aparece el botón "📄 PDF"; al click llama `api.pedidoPdfAbrir('p9')` (mockeado).
- Suite verde + build.

## Dependencias
- Agregar `pdfkit` a `gastos/package.json` (`npm install pdfkit` dentro de `gastos/` del worktree).

## Siguiente paso
Aprobar → `writing-plans`. Luego #5 (poblar catálogo con K.A.L.Y./foto) o #6.
