# Diseño — Fase 4a · Cerebro del Planificador

**Fecha:** 2026-06-10
**Estado:** Diseño aprobado (pendiente plan de implementación)
**Proyecto:** atiko-agent · redes sociales (Fase 4a)
**Depende de:** Fase 1 (Publicador Meta, `services/social/publisher`). Las Fases 2-3 (generadores) alimentan content items pero no son dependencia de código.

---

## 1. Objetivo

Convertir "una pieza de contenido generada" (reel/historia/post) en "algo aprobado, programado y publicado solo a su hora". Es la **columna vertebral** del planificador: modelo de datos + máquina de estados + scheduler + API, conectado al Publicador de la Fase 1. Flujo: **generar → aprobar → programar → auto-publicar**.

## 2. Decisiones tomadas (brainstorming)

- **Flujo:** aprobar → programar → auto-publica (humano aprueba antes de que algo entre a la cola; anti-ban).
- **Multi-formato:** el modelo soporta `format: reel | story | post` desde el día 1 (aunque 4a solo publica reel y post-foto con lo que el Publicador ya hace; story/carrusel = Fase 4c).
- **Multi-red:** un content item tiene UNA `network` (facebook|instagram). Publicar a varias redes = varios items (multi-red real, futuro).
- **Interfaz:** panel web con calendario = Fase 4d. La 4a expone solo la **API** (la usa el panel y curl).
- **Scheduler:** CRON in-process (setInterval 60s) dentro de atiko-agent; la lógica vive en un `tick()` testeable.

## 3. Arquitectura

```
Generador (Fase 2/3: reel | futuro story/post)
   │  crea un CONTENT ITEM (status draft)
   ▼
content_items (Postgres atiko-db; memoria en dev/test)
   │  ciclo de vida (máquina de estados):
   │  draft → approved → scheduled → publishing → published
   │                                   └→ failed
   ▼
scheduler.tick()  (runner cada 60s)
   │  selecciona items status=scheduled con scheduledAt <= now
   │  → publishing → publica → published / failed
   ▼
Publicador Fase 1 (services/social/publisher.publish)  → FB / IG
```

## 4. Unidades de código

```
agent/
├── migrations/003_content_items.sql       ← tabla
├── services/content/
│   ├── status.js                          ← máquina de estados (transiciones válidas)
│   ├── content-store.js                   ← createMemoryContentStore / createPgContentStore
│   └── scheduler.js                       ← createScheduler({ store, publisher, now }) + startScheduler (runner)
└── routes/content.js                      ← API: crear, listar, aprobar, programar
```

Mismo patrón de inyección de dependencias y TDD de las fases 1-3. `now` y `publisher` inyectables → `tick()` testeable sin red ni reloj real.

## 5. Contratos de datos

**content item:**
```json
{
  "id": "uuid",
  "clientId": "casaluxe",
  "format": "reel | story | post",
  "network": "facebook | instagram",
  "mediaUrl": "/widget/reels/xxx.mp4",
  "caption": "texto del post",
  "hashtags": ["ventas", "pyme"],
  "status": "draft | approved | scheduled | publishing | published | failed",
  "scheduledAt": "2026-06-12T18:00:00Z | null",
  "publishedAt": "timestamp | null",
  "externalId": "id del post en la red | null",
  "error": "mensaje | null",
  "createdAt": "timestamp"
}
```

**Máquina de estados (`status.js`):** transiciones permitidas
- `draft → approved`
- `approved → scheduled` (requiere scheduledAt)
- `approved → draft` (volver a editar)
- `scheduled → approved` (desprogramar)
- `scheduled → publishing` (solo el scheduler)
- `publishing → published`
- `publishing → failed`
- `failed → scheduled` (reintentar)
Cualquier otra transición se rechaza con error claro.

**content-store interfaz:** `create(item)`, `get(id)`, `list({ clientId?, status? })`, `updateStatus(id, newStatus, patch?)` (valida la transición), `due(now)` (items `scheduled` con `scheduledAt <= now`).

**scheduler:** `createScheduler({ store, publisher, now })` → `tick()`:
1. `items = await store.due(now())`
2. por cada item: `updateStatus(id, "publishing")` → `publisher.publish({...})` → `updateStatus(id, "published", { publishedAt, externalId })` o `updateStatus(id, "failed", { error })`.
3. devuelve un resumen `{ published, failed }`.
`startScheduler(scheduler, { intervalMs = 60000 })` → `setInterval(tick)`; el runner captura errores para no morirse.

## 6. Mapeo formato → publicador (Fase 1)

`publisher.publish` (Fase 1) acepta `{ clientId, platform, message, imageUrl, videoUrl, caption }`.
- `format: reel` → `publish({ clientId, platform: network, videoUrl: mediaUrl, caption })`
- `format: post` (foto) → `publish({ clientId, platform: network, imageUrl: mediaUrl, caption })`
- `format: story` → **no soportado en 4a** → `tick()` marca `failed` con "stories llegan en Fase 4c". (El scheduler ya queda agnóstico para cuando 4c amplíe el publicador.)

## 7. API (`routes/content.js`)

- `POST /api/content` → crea item (status `draft`). Body: `{ clientId, format, network, mediaUrl, caption, hashtags? }`.
- `GET /api/content?clientId=&status=` → lista.
- `POST /api/content/:id/approve` → `draft → approved`.
- `POST /api/content/:id/schedule` → body `{ scheduledAt }` → `approved → scheduled`.
- `POST /api/content/:id/unschedule` → `scheduled → approved`.

El scheduler corre in-process al arrancar el server (si `DATABASE_URL` presente; en dev/memoria también, opcional por env `SCHEDULER_ENABLED`).

## 8. Manejo de errores / anti-ban

- Transiciones inválidas → error 400 claro (no se puede programar algo sin aprobar; el scheduler solo toca `scheduled`).
- Fallo de publicación → item a `failed` con `error`, **no bloquea** los demás (cada item en try/catch dentro de `tick()`).
- El humano **siempre** aprueba antes de programar — el scheduler nunca genera ni aprueba por su cuenta.

## 9. Testing

- `status.js`: transiciones válidas e inválidas.
- `content-store`: create/get/list/updateStatus (valida transición)/due (memoria; PG misma interfaz).
- `scheduler.tick()`: con store en memoria + publisher mock + `now` fijo → publica los vencidos, marca published/failed, ignora los no-vencidos y los no-`scheduled`; un fallo no detiene al resto.
- Integración: arrancar server, crear item por API, aprobar, programar en el pasado, correr `tick()` → publicado (con publisher mock o real en dev).

## 10. Fuera de alcance (otras sub-fases)

- 4b: generadores de **story** y **post/carrusel** (reel ya existe).
- 4c: publicadores de **Stories** y **carrusel** en Meta (endpoints nuevos).
- 4d: **panel web con calendario** (frontend), editar contenido, preview visual.
- Multi-red en un solo item, reintentos automáticos con backoff, zonas horarias avanzadas.

## 11. Próximo paso

Plan de implementación vía writing-plans: status → content-store → scheduler → API + arranque del runner.
