# M2 — Aprender automático de KALY — Diseño

**Fecha:** 2026-06-18
**Producto:** K.A.L.Y. (agente de voz de Hash IA, app `gastos-app`). Repo `HASH IA`, branch `master`.
**Alcance:** segunda fase de la memoria agéntica de KALY. **M2 = aprender AUTOMÁTICO:** al cerrar una conversación sustancial, un LLM lee la transcripción + la memoria actual y guarda los hechos nuevos del negocio/dueño, sin que KALY tenga que acordarse de llamar la tool `recordar`.

> Orden de los sub-proyectos restantes (pedido por el usuario, en secuencia): **M2** (este) → M3 (gestionar: dedupe semántico/contradicciones/olvido) → M5 (proactividad). M1 (memoria del cliente) + M4 (personalidad) ya están hechos.

## Contexto (ya existente, de M1)

- Tabla `kaly_memory` (`id, company_id, tipo negocio|dueño|preferencia|hecho, contenido, origen, activo, timestamps`).
- `gastos/src/agent/memory.js`: `normalizeMemoria`/`formatMemoriaBlock` (puros) + `crearMemoria(db, companyId, {tipo, contenido, origen})` / `listMemorias(db, companyId, {limite})` / `borrarMemoria`. `crearMemoria` acepta `origen` y normaliza.
- KALY ya aprende EN VIVO con la tool `recordar` (origen `kaly`); el dueño agrega a mano (origen `dueño`). M2 agrega un tercer origen: **`auto`**.
- KALY es Gemini Live (voz). `gastos-app/src/gastos/kaly/live.js` ya entrega `onUserTranscript` y `onAgentTranscript` (texto de lo que dice el usuario y KALY). `KalyAgent.jsx` cablea la sesión.
- Extracción con Gemini ya integrada (OpenAI-compat) en `ocr/gemini.js`, `catalog/extraer.js` (axios, `parseJsonLoose`, `http` inyectable). M2 calca ese patrón.

## Decisiones (del usuario, vía brainstorming)
1. **Disparador:** al **cerrar la conversación**, solo si fue **sustancial** (≥4 turnos). No gastar una llamada LLM en charlas triviales.
2. **Dedupe:** **pasarle la memoria actual al extractor** (el LLM devuelve solo lo NUEVO) + un dedupe por texto como red de seguridad. El dedupe semántico/contradicciones queda 100% para M3.
3. Umbral "sustancial" = **≥4 turnos**. La **transcripción NO se persiste** (solo se usa para extraer y se descarta — privacidad).

## Diseño

### Backend — `gastos/src/agent/aprender.js`
- `esSustancial(transcripcion)` (puro): `true` si la transcripción tiene ≥4 turnos (array de `{role, text}`) con texto real. Evita la llamada LLM en charlas vacías/triviales.
- `extraerHechos({ transcripcion, memoriaActual, http })`: llama a Gemini (OpenAI-compat, modelo texto `GEMINI_TEXT_MODEL` o `gemini-2.5-flash`; calca `ocr/gemini.js`: axios `http` inyectable, `Authorization: Bearer GEMINI_API_KEY`, `parseJsonLoose`). Prompt: *"Lee esta conversación entre el dueño de una pyme y KALY (su asistente). Extrae SOLO hechos DURADEROS del negocio o del dueño (horarios, productos/servicios, ubicación, preferencias, datos del dueño) que NO estén ya en la memoria actual. Nada de chit-chat, saludos ni cosas del momento. Devuelve SOLO JSON `{ "hechos": [{ "tipo": "negocio|dueño|preferencia|hecho", "contenido": "<frase corta>" }] }`. Si no hay nada nuevo, `hechos: []`."* Recibe `memoriaActual` (los contenidos existentes, formateados) para no repetir. Normaliza cada hecho (`normalizeMemoria`), descarta inválidos. Devuelve `[{tipo, contenido}]`.
- `aprenderDeConversacion(db, companyId, { transcripcion, http })`: si `!esSustancial` → `{ creados: 0, skip: true }`. Si sí: `const mem = await listMemorias(db, companyId)`; `const nuevos = await extraerHechos({ transcripcion, memoriaActual: mem, http })`; **dedupe por texto** (descarta los `contenido` casi-idénticos a uno existente — normalizado lowercase/trim, red de seguridad); por cada hecho restante `crearMemoria(db, companyId, { ...hecho, origen: 'auto' })`. Devuelve `{ creados, hechos }`.

### Endpoint — `gastos/src/app/router.js`
- `POST /api/app/kaly/aprender` `{ transcripcion: [{role, text}] }` (auth empleado, scoped por `req.auth.companyId`) → `aprenderDeConversacion`. Inyecta `extraerHechos` real (igual que `extractExpense`/`extraerProductos` se inyectan en `createAppRouter`, para testear sin pegarle a Gemini). Devuelve `{ creados }`.

### App — `gastos-app/src/gastos/kaly/KalyAgent.jsx`
- Acumula los turnos de la conversación en un array `{ role: 'user'|'kaly', text }` desde `onUserTranscript`/`onAgentTranscript` de `live.js`.
- Al cerrar la sesión (`onClose` o al apagar KALY), si hay ≥4 turnos, llama `api.kalyAprender({ transcripcion })` **fire-and-forget** (no bloquea ni espera; los errores se ignoran). Limpia el buffer.
- `api.js`: `kalyAprender(payload)` → `POST /api/app/kaly/aprender`.

### Data flow
1. Durante la charla, `KalyAgent` acumula turnos (in/out transcripts).
2. Al cerrar → si ≥4 turnos → `POST /kaly/aprender { transcripcion }`.
3. Backend: `esSustancial` → `listMemorias` → `extraerHechos` (Gemini, recibe la memoria actual) → dedupe texto → `crearMemoria(origen:'auto')`.
4. Los hechos nuevos aparecen en la próxima sesión (recall de M1) y en la pantalla "Memoria de KALY".

### Manejo de errores / privacidad / multi-tenant
- Extracción falla o timeout → no pasa nada (la conversación ya terminó); se loguea. Degradación suave.
- La **transcripción NO se guarda** en DB: se usa para extraer y se descarta. Solo persisten los hechos extraídos.
- Todo scoped por `company_id`.
- `origen='auto'` distingue lo aprendido solo de `kaly` (tool en vivo) y `dueño` (manual).

### Testing (TDD)
- `esSustancial` (puro): ≥4 turnos con texto → true; menos/triviales → false.
- `extraerHechos` (http mock): parsea el JSON de Gemini, normaliza, descarta inválidos; arma el prompt con `memoriaActual`.
- `aprenderDeConversacion` (pg-mem + http mock): crea hechos con `origen='auto'`; respeta `esSustancial=false` (no llama, 0 creados); dedupe descarta los casi-idénticos a memoria existente; scoped por empresa.
- Endpoint `POST /api/app/kaly/aprender` (auth 401; scoped; `extraerHechos` inyectable mock).
- App: `KalyAgent` llama `api.kalyAprender` al cerrar cuando hay ≥4 turnos (mock); no llama si <4.
- Suites verdes + build.

## Fuera de M2 (M3/M5)
- Dedupe semántico profundo, resolución de contradicciones, olvido/decay, búsqueda semántica (embeddings) → M3.
- Proactividad (KALY sugiere/recuerda sola) → M5.
- Persistir transcripciones / auditoría → no se hace (privacidad).

## Siguiente paso
Aprobar → `writing-plans`.
