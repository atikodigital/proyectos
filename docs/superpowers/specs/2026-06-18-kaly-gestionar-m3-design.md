# M3 — Gestionar (reconciliación de memoria) de KALY — Diseño

**Fecha:** 2026-06-18
**Producto:** K.A.L.Y. (agente de voz de Hash IA, app `gastos-app`). Repo `HASH IA`, branch `master`.
**Alcance:** tercer sub-proyecto de la memoria agéntica de KALY. **M3 = GESTIONAR:** mantener la memoria limpia y al día reconciliando cada hecho nuevo contra los existentes — deduplicar (semántico) y resolver contradicciones (reemplazar el dato viejo por el nuevo).

> Serie (pedida por el usuario, en secuencia): M2 aprender auto ✅ desplegado → **M3 gestionar** (este) → M5 proactividad. M1 (memoria del cliente) + M4 (personalidad) hechos y desplegados.

## Contexto (ya existente)

- Tabla `kaly_memory` (`id uuid, company_id uuid, tipo negocio|dueño|preferencia|hecho, contenido text, origen kaly|dueño|auto, activo bool, created/updated_at`). Soft-delete via `activo=false`.
- `gastos/src/agent/memory.js`: `normalizeMemoria`/`formatMemoriaBlock` (puros) + `crearMemoria(db, companyId, {tipo, contenido, origen})` / `listMemorias(db, companyId, {limite=50})` (activo=true, recencia) / `borrarMemoria(db, companyId, id)` (soft-delete).
- `gastos/src/agent/aprender.js` (M2): `extraerHechos({transcripcion, memoriaActual, http})` (Gemini, ya dedup contra memoria por primer-pass) y `aprenderDeConversacion(db, companyId, {transcripcion, http, extraer})` (al cerrar conversación, dedup SOLO por texto exacto normalizado + `crearMemoria` origen `auto`).
- `POST /api/app/kaly/memoria` (router app): hoy llama `crearMemoria` directo. Lo usan: la tool `recordar` (KALY en vivo) y el guardado manual del dueño (pantalla `MemoriaKalyView`).
- Recall: `buildAgentContext` (context.js) trae `listMemorias` (todas, tope 50) al prompt. Con <50 hechos (escala pyme) ya están todas presentes → la búsqueda semántica no aporta todavía.
- Gemini integrado OpenAI-compat (`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, Bearer `GEMINI_API_KEY`), patrón `http` inyectable + `parseJsonLoose` (ver `catalog/extraer.js`, `agent/aprender.js`).

## Decisiones (del usuario, vía brainstorming)
1. **Tecnología:** LLM-juez al guardar (no embeddings/pgvector). Simple, testeable con http-mock, ideal a escala pyme. `pg-mem` no soporta pgvector → esta vía lo evita por completo.
2. **Alcance:** solo reconciliación (dedupe semántico + contradicciones). Decay/olvido y búsqueda semántica se posponen (YAGNI a escala pyme; el dueño ya puede borrar a mano).
3. **Contradicción:** reemplazo automático — archiva el viejo (`activo=false`, recuperable) y guarda el nuevo. Duplicado → no inserta.
4. **Dónde:** gateway único — las 3 vías de escritura (auto, recordar en vivo, dueño manual) pasan por la misma función de reconciliación.

## Diseño

### Módulo nuevo — `gastos/src/agent/gestionar.js`
Sin cambios de esquema (reusa `kaly_memory`; el "reemplazo" es el soft-delete existente).

- `juzgarHecho({ hechoNuevo, existentes, http })`: Gemini OpenAI-compat (calca `extraerHechos`: axios `http` inyectable, Bearer `GEMINI_API_KEY`, modelo texto `GEMINI_TEXT_MODEL` o `gemini-2.5-flash`, `parseJsonLoose`). Prompt: recibe `hechoNuevo.contenido` + las memorias `existentes` **numeradas 1..N** (solo `contenido`). Devuelve SOLO JSON `{ "accion": "insertar"|"duplicado"|"reemplaza", "indice": <n 1-based o null> }`:
  - `insertar`: genuinamente nuevo, sin conflicto (indice null).
  - `duplicado`: significa lo mismo que el #indice (aunque redactado distinto, ej. "cierra domingos" ≈ "no atiende los domingos").
  - `reemplaza`: contradice al #indice — mismo atributo, valor distinto (ej. horario cambió).
  - Normaliza la salida: accion fuera del set o indice inválido (fuera de 1..N) → trata como `insertar`.

- `reconciliar(db, companyId, hechoNuevo, { http, juzgar } = {})`: **el gateway único.**
  1. `const n = normalizeMemoria(hechoNuevo)`; si `!n` → return `null`.
  2. `const existentes = await listMemorias(db, companyId)` (fresco cada llamada → dentro de un batch, el hecho 2 ve al hecho 1 ya insertado).
  3. Si `existentes.length === 0` → `crearMemoria(db, companyId, n con origen)` → return `{ accion: 'insertar', memoria }`.
  4. `const juzgarFn = juzgar || juzgarHecho`; `let veredicto; try { veredicto = await juzgarFn({ hechoNuevo: n, existentes, http }); } catch { veredicto = { accion: 'insertar' }; }` (degradación suave: si el juez falla → inserta, nunca se pierde info).
  5. Actúa según `veredicto.accion` + `existentes[indice-1]`:
     - `duplicado` (indice válido) → no inserta → return `{ accion: 'duplicado', memoria: existentes[indice-1] }`.
     - `reemplaza` (indice válido) → `borrarMemoria(db, companyId, existentes[indice-1].id)` + `crearMemoria(...)` → return `{ accion: 'reemplaza', memoria: nueva, reemplazoId: existentes[indice-1].id }`.
     - cualquier otro (incl. indice null/ inválido) → `crearMemoria(...)` → return `{ accion: 'insertar', memoria: nueva }`.
  - El `origen` del hecho nuevo se respeta (lo pasa quien llama: `auto`/`kaly`/`dueño`).

### Integración — las 3 vías por el gateway
- **`aprenderDeConversacion`** (aprender.js, M2): reemplaza el dedupe-por-texto (`normTxt` Set) por: para cada hecho extraído, `await reconciliar(db, companyId, { ...hecho, origen: 'auto' }, { http, juzgar })`. `creados` = cantidad con accion `insertar` o `reemplaza`. `extraerHechos` sigue igual (primer filtro). `juzgar` se inyecta (default `juzgarHecho`).
- **`POST /api/app/kaly/memoria`** (router app): usa `reconciliar(db, req.auth.companyId, { ...(req.body), origen }, { http, juzgar: _juzgarHecho })` en vez de `crearMemoria` directo. `origen` = `req.body.origen || 'dueño'` (igual que hoy). Devuelve `{ accion, memoria }` (200). El front refresca la lista.
- **Inyección:** `juzgarHecho` se agrega a `createAppRouter({ ..., juzgarHecho })` con default real (`const _juzgarHecho = juzgarHecho || require('../agent/gestionar').juzgarHecho`), igual que `extraerHechos`. El endpoint `/kaly/aprender` pasa `juzgar: _juzgarHecho` a `aprenderDeConversacion`.

### App
Sin cambios de UI obligatorios. La pantalla `MemoriaKalyView` ya lista/agrega/borra; al reemplazar, el viejo sale de la lista (queda `activo=false`). El POST ahora devuelve `{ accion, memoria }`; el front ya refresca la lista tras guardar, así que funciona sin tocar nada. (Opcional menor, fuera de alcance: toast "Ya lo sabía"/"Actualicé ese dato" según `accion`.)

### Data flow (guardar un hecho)
1. Entra un hecho (auto / recordar / dueño) → `reconciliar`.
2. Lista existentes → si hay, `juzgarHecho` (Gemini) decide insertar/duplicado/reemplaza.
3. Actúa sobre `kaly_memory` (insert / skip / soft-delete viejo + insert).
4. La próxima sesión recall trae la memoria ya reconciliada.

### Manejo de errores / privacidad / multi-tenant
- Juez falla/timeout → inserta igual (degradación suave). Nunca se pierde un hecho.
- Todo scoped por `company_id` (listMemorias/crearMemoria/borrarMemoria ya lo son).
- No se persiste transcripción ni prompts; solo el hecho resultante.
- Sin migración de DB, sin pgvector → testing 100% con pg-mem + http-mock.

### Testing (TDD)
- `juzgarHecho` (http mock): parsea JSON del juez (insertar/duplicado/reemplaza + indice); normaliza accion/indice inválidos → insertar.
- `reconciliar` (pg-mem + http mock): sin existentes → inserta; juez 'insertar' → crea fila; 'duplicado' → NO crea fila (lista igual); 'reemplaza' → archiva el viejo (activo=false) + crea el nuevo; juez lanza error → inserta; scoped por empresa; respeta `origen`.
- `aprenderDeConversacion` (actualizado): rutea por `reconciliar` (inyectable), `creados` cuenta insertar+reemplaza; sigue respetando `esSustancial=false`.
- `POST /api/app/kaly/memoria` (actualizado): reconciliar inyectable; auth/scoped; devuelve accion.
- Suite backend + app verdes + build.

## Fuera de M3
- Decay/olvido (use_count/last_used_at/archivado automático) y búsqueda semántica con embeddings/pgvector → futuro, solo si un cliente acumula cientos de hechos.
- Proactividad (KALY sugiere/recuerda sola) → M5.

## Siguiente paso
Aprobar → `writing-plans`.
