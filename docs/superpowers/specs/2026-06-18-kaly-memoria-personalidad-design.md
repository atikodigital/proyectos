# Memoria de KALY (M1) + Personalidad configurable (M4) — Diseño

**Fecha:** 2026-06-18
**Producto:** K.A.L.Y. (agente de voz de Hash IA, en la app `gastos-app`). Repo `HASH IA`, branch `master`.
**Alcance:** primera fase del sistema de memoria agéntica de KALY. Cubre **M1** (memoria del cliente: almacén + recall + guardar en vivo + edición del dueño) y **M4** (personalidad: base global + override por cliente editado por Atiko). Es para la KALY **autenticada de la app** (que tiene `company_id`/`employee_id`); la KALY pública de la landing NO lleva memoria.

> El sistema completo (decompuesto en brainstorming) es: M1 almacén+recall · M2 aprender automático (extracción post-conversación) · M3 gestionar (dedupe/contradicciones/olvido) · M4 personalidad · M5 actuar (proactividad). Este spec = **M1 + M4**. M2/M3/M5 son fases siguientes.

## Contexto actual

- La "memoria" hoy es solo `agent_prefs` (jsonb en `employees`): `nombre`, `trato`, `onboarded_at`.
- El contexto de KALY se arma en `gastos/src/agent/context.js` (`buildAgentContext`): junta `agent_prefs` + `companies` + resumen financiero vivo (`cashflowSummary`) + pendientes de pago. Lo entrega el endpoint `POST /api/app/agent/session` como `{ token, model, context }`.
- La **personalidad está HARDCODEADA** en `gastos-app/src/gastos/kaly/prompt.js` (`buildSystemPrompt(context)`), una sola global.
- KALY ya tiene tools: `gastos-app/src/gastos/kaly/tools.js` (`TOOL_DECLARATIONS` + `executeTool`, function-calling de Gemini Live) y `api.js` con `agentSession`.
- Multi-tenant por `company_id`. Stack backend Node+Express+Postgres (jest+pg-mem); app React+Capacitor (jest+RTL).

## Decisiones (del usuario, vía brainstorming)
1. Empezar por **M1 + M4** juntos (las dos capas: memoria del cliente + personalidad).
2. **Aprender (v1):** KALY guarda en vivo con una tool `recordar` + el dueño ve/edita en una pantalla. (Extracción automática = M2, después.)
3. **Recordar (v1):** recuperación **simple** — inyectar todos los hechos activos (con tope) al prompt. Sin embeddings (semántico = M3).
4. **Personalidad:** base global + override por cliente, editado por **Atiko desde el admin**.
5. Tipos de hecho: `negocio | dueño | preferencia | hecho`. Pantalla del dueño en **Ajustes**. Override de persona en `companies.kaly_persona` (jsonb, simple).

## Diseño

### M1 — Memoria del cliente

**Tabla `kaly_memory`** (scoped por empresa):
```
id (uuid)            company_id (uuid, FK)
tipo (text)          negocio | dueño | preferencia | hecho
contenido (text)     el hecho en lenguaje natural, p.ej. "Cierra los domingos"
origen (text)        kaly | dueño      (quién lo guardó)
activo (boolean)     default true       (borrar = activo=false, no se pierde)
created_at, updated_at (timestamptz)
```
Se asegura con un ALTER/ensure idempotente al estilo del repo (como `ensureCompanyOnboarding`). El nombre/trato del empleado se queda en `agent_prefs` (no se duplica acá).

**Repo `gastos/src/agent/memory.js`:**
- `crearMemoria(db, companyId, { tipo, contenido, origen })` → inserta (normalizando: tipo válido o `hecho`, contenido recortado ≤500, activo=true).
- `listMemorias(db, companyId, { limite })` → activas, orden por recencia, tope (default 50).
- `borrarMemoria(db, companyId, id)` → `activo=false` (soft delete, scoped).
- `normalizeMemoria(input)` (puro): valida/recorta tipo+contenido.
- `formatMemoriaBlock(memorias)` (puro): arma el texto del bloque del prompt agrupando por tipo (devuelve '' si no hay).

**Aprender (en vivo):** tool `recordar` en `kaly/tools.js`:
- Declaración: `{ name: 'recordar', description: 'Guarda un dato importante del negocio o del dueño para recordarlo en el futuro', parameters: { tipo (enum), contenido (string, requerido) } }`.
- `executeTool('recordar', args)` → `api.kalyRecordar({ contenido, tipo })` → `POST /api/app/kaly/memoria`. Devuelve `{ ok, contenido }`.
- En el prompt de KALY se le instruye: usar `recordar` cuando el dueño diga algo que valga la pena recordar o pida explícitamente recordarlo; confirmar en una frase.

**Recordar (recall):** `buildAgentContext` agrega `memorias: await listMemorias(db, companyId)`. `prompt.js` inyecta `formatMemoriaBlock` como bloque **"## Lo que sé de este negocio"** (solo si hay).

**Gestionar (dueño):** pantalla **"Memoria de KALY"** en **Ajustes** de la app (`gastos-app`): lista de hechos (tipo + contenido), agregar (form: tipo + texto), borrar. Métodos `api.js`: `kalyMemorias()`, `kalyRecordar(m)`, `kalyBorrarMemoria(id)`. Endpoints `GET/POST/DELETE /api/app/kaly/memoria` (auth empleado, scoped por `req.auth.companyId`).

### M4 — Personalidad configurable

**Base global** (`gastos-app/src/gastos/kaly/persona-base.js`): se extrae de `prompt.js` la identidad núcleo (rol, tono, estilo, protocolos) a una función/estructura base. `prompt.js` pasa a COMPONER en vez de tener todo hardcodeado.

**Override por cliente:** columna `companies.kaly_persona` (jsonb) `{ nombre, tono, instrucciones }` (todos opcionales). Ensure idempotente. La edita **Atiko desde el admin**: `PATCH /api/admin/companies/:id/kaly-persona` (reusa el patrón del admin router) + un mini-form en el panel admin (`public/admin`).

**Composición** (`prompt.js` `buildSystemPrompt(context)`), en orden:
1. Persona base, con override aplicado (si `context.persona.nombre` → KALY usa ese nombre; `tono` ajusta el estilo; `instrucciones` se añaden).
2. Protocolos contables/de la app (lo que ya existe).
3. `## Lo que sé de este negocio` (memorias) — `context.memorias`.
4. Contexto vivo (resumen financiero, empresa) — ya existe.
5. Prefs del empleado (nombre/trato) — ya existe.

`buildAgentContext` agrega `persona: (company.kaly_persona) || {}` al contexto.

## Data flow
1. KALY inicia → `POST /api/app/agent/session` → `buildAgentContext` trae `{ ..., memorias, persona }`.
2. `prompt.js` compone el system prompt (persona override + memorias + contexto).
3. En la charla, KALY llama `recordar` → `POST /kaly/memoria` → hecho guardado (visible la próxima sesión y en Ajustes).
4. El dueño gestiona su memoria en Ajustes; Atiko ajusta la persona en el admin.

## Manejo de errores / multi-tenant
- Todo scoped por `company_id`; aislado por empresa.
- Si falla cargar memorias o persona → KALY funciona igual sin esos bloques (degradación suave; el contexto sigue armándose).
- Tope de hechos (~50) para no inflar el prompt ni el costo.
- Borrado = soft (`activo=false`), no se pierde nada.

## Testing (TDD)
- `normalizeMemoria` / `formatMemoriaBlock` (puros).
- `agent/memory.js` repo (pg-mem): crear/listar/borrar scoped por empresa; tope; soft-delete.
- Endpoints `/api/app/kaly/memoria` (GET/POST/DELETE; auth 401; scoped).
- Endpoint admin `/api/admin/companies/:id/kaly-persona` (auth admin; persiste).
- `buildAgentContext` ahora incluye `memorias` + `persona`.
- tool `recordar` en `executeTool` (mock api).
- `buildSystemPrompt` compone el bloque de memoria + aplica override de persona.
- App: pantalla "Memoria de KALY" en Ajustes (RTL: lista, agregar, borrar).
- Suites verdes + build.

## Fuera de M1/M4 (fases siguientes)
- M2: extracción automática de hechos al cerrar la conversación.
- M3: dedupe, actualización, contradicciones, olvido/decay; búsqueda semántica (embeddings/pgvector).
- M5: proactividad (KALY sugiere/recuerda sola basándose en la memoria).
- Autoservicio de personalidad por el dueño (hoy solo Atiko).

## Siguiente paso
Aprobar → `writing-plans`.
