# Memoria del agente en 3 niveles + aislamiento por cuenta — Diseño

**Fecha:** 2026-06-22
**Autor:** José Antonio Olguín (con Claude)
**Estado:** Para revisión

## Problema

Los agentes de IA (KALY en la app, VARAS en el panel) a veces entregan
"antecedentes de otro usuario":

1. **Datos de otra cuenta/empresa** (cruce real entre tenants), y
2. **Hechos viejos de la misma cuenta** que se mezclan (memoria acumulada a
   nivel empresa, sin separar por persona ni poder limpiarla).

Hoy la memoria de hechos (`kaly_memory`) es **solo por empresa** (`company_id`)
y se comparte entre el dueño y todos los empleados. No existe memoria privada
por persona, ni una forma de listar/limpiar lo acumulado. Además hay dos
consultas (`getAgentPrefs`/`setAgentPrefs`) que filtran por `employee_id` sin
validar `company_id` (frontera de tenant incompleta), y falta un índice por
`company_id` en `kaly_memory`.

## Objetivo

Ordenar la memoria del agente en **3 niveles** bien definidos, todos anclados a
la cuenta en la base de datos, con **aislamiento estricto** verificado por tests:

- Cuenta A nunca ve memoria/datos de cuenta B.
- Persona X no ve la memoria **privada** de persona Y (aunque sean de la misma
  empresa).
- La memoria **de empresa** sí la ven todas las personas de esa empresa.
- El usuario puede **listar y borrar** su memoria (limpiar lo viejo).

No es un rediseño: se endurece y se extiende el modelo actual.

## Los 3 niveles

### Nivel 1 — Memoria genérica del sistema (global, estática, NO en DB)
Conocimiento fijo e igual para todos: qué es Hash IA, reglas contables, cómo se
usa la app, cómo deriva KALY↔VARAS. Vive en los *prompts* de los agentes
(`gastos-app/src/gastos/kaly/prompt.js`, `.../varas/voice/prompt.js`, panel
`agente-voz.js`). No se toca el comportamiento; solo se documenta que este nivel
es código, no datos de tenant. Sin cambios de DB.

### Nivel 2 — Memoria persistente (en DB), en dos capas
Tabla `kaly_memory`, con un nuevo eje de "dueño" de cada hecho:

- **2a. Empresa (compartida):** hechos del negocio (horarios, formas de pago,
  proveedores). `owner_kind = 'company'`, `owner_id = NULL`. La ven todas las
  personas de la empresa. Es el comportamiento actual.
- **2b. Persona (privada):** historial/preferencias de quien inició sesión.
  `owner_kind ∈ {'user','employee'}`, `owner_id = <id de la persona>`. Solo la ve
  esa persona. **Siempre** además filtrada por `company_id` (defensa en
  profundidad).

Las preferencias `nombre/trato` siguen siendo por persona
(`employees.agent_prefs` en la app, `companies.owner_agent_prefs` para el dueño
del panel), pero se endurece su consulta con `company_id`.

### Nivel 3 — Memoria de sesión (efímera, sin persistencia)
La conversación en curso vive solo dentro de la sesión Gemini Live y se borra al
cerrarla. No se mezcla entre cuentas porque **cada sesión arma su contexto desde
la cuenta autenticada** (`buildAgentContext` con `companyId` del JWT). No se
persiste nada; se agrega un test que prueba que dos sesiones de cuentas distintas
reciben contextos distintos.

## Modelo de datos

`kaly_memory` (tabla existente) gana dos columnas, vía ALTER idempotente en
`MEMORY_DDL` (`gastos/src/db/migrate.js`):

```sql
ALTER TABLE kaly_memory ADD COLUMN IF NOT EXISTS owner_kind text NOT NULL DEFAULT 'company';
ALTER TABLE kaly_memory ADD COLUMN IF NOT EXISTS owner_id uuid;
CREATE INDEX IF NOT EXISTS idx_kaly_memory_scope ON kaly_memory(company_id, owner_kind, owner_id);
```

- Filas existentes quedan `owner_kind='company'`, `owner_id=NULL` →
  retrocompatibles (se vuelven memoria de empresa, igual que hoy).
- `owner_kind` válidos: `'company' | 'user' | 'employee'`.
- `owner_id`: NULL para empresa; el `userId` (panel) o `employeeId` (app) para
  personal.

Identidad de la persona desde el JWT (`req.auth`):
- Panel (dueño): `kind='user'`, persona = `{ kind:'user', id: req.auth.userId }`.
- App (empleado): `kind='employee'`, persona = `{ kind:'employee', id: req.auth.employeeId }`.

## Lectura (qué memoria ve el agente)

Para una sesión de la persona P en la empresa C, el contexto incluye:

```sql
SELECT id, tipo, contenido, origen, owner_kind, created_at
FROM kaly_memory
WHERE company_id = $1
  AND activo = true
  AND (owner_kind = 'company' OR (owner_kind = $2 AND owner_id = $3))
ORDER BY created_at DESC
LIMIT $4
```

(`$2 = P.kind`, `$3 = P.id`). Garantiza: empresa C compartida + privadas de P;
nunca privadas de otra persona; nunca de otra empresa.

## Escritura (qué se guarda y dónde)

La herramienta `recordar` / endpoint `POST /kaly/memoria` acepta un `alcance`:
- `alcance: 'empresa'` (por defecto) → `owner_kind='company'`, `owner_id=NULL`.
- `alcance: 'personal'` → `owner_kind = P.kind`, `owner_id = P.id`.

Mapeo por defecto sugerido al prompt: hechos del **negocio** (`tipo` negocio/hecho)
→ empresa; datos del **dueño/preferencia** (`tipo` dueño/preferencia) → personal.
El parámetro explícito manda; el `tipo` solo sugiere el default.

## Gestión de memoria (listar/borrar)

- `GET /kaly/memoria` → devuelve, separadas, `{ empresa: [...], personal: [...] }`
  para que el usuario vea y distinga.
- `DELETE /kaly/memoria/:id` → borra (soft-delete) solo si la fila pertenece a la
  empresa del caller Y (si es personal) a la persona del caller. Memoria de
  empresa: cualquiera de la empresa puede borrarla.
- `DELETE /kaly/memoria?alcance=personal` (nuevo) → limpia toda la memoria
  personal del caller (para botar pruebas viejas). Opcionalmente
  `?alcance=empresa` para limpiar la de empresa (solo dueño/`rol=owner`).

## Endurecimiento de fugas (bugs encontrados)

1. `getAgentPrefs(db, employeeId)` → `getAgentPrefs(db, employeeId, companyId)`
   con `WHERE id=$1 AND company_id=$2` (`gastos/src/companies/repo.js`). Igual
   `setAgentPrefs`. Actualizar llamadores: `agent/context.js`,
   `app/router.js` (GET/PATCH `/agent/prefs`).
2. Índice `idx_kaly_memory_scope` (arriba).
3. `buildAgentContext` recibe la persona y filtra memoria por persona (no solo
   empresa).

## Componentes a tocar (archivos)

- `gastos/src/db/migrate.js` — columnas + índice en `MEMORY_DDL`.
- `gastos/src/agent/memory.js` — `crearMemoria`/`listMemorias`/`borrarMemoria`
  con eje owner; nueva `borrarMemoriasDe(db, companyId, scope)`.
- `gastos/src/agent/context.js` — `buildAgentContext` recibe
  `owner = { kind, id }` y lo pasa a `listMemorias`.
- `gastos/src/companies/repo.js` — `getAgentPrefs`/`setAgentPrefs` con
  `company_id`.
- `gastos/src/app/router.js` — `/agent/prefs` (pasar companyId), `/agent/session`
  (pasar owner), `/kaly/memoria` GET/POST/DELETE con alcance + caller.
- `gastos/src/panel/router.js` — `/agent/session` (pasar owner = userId),
  `/kaly/memoria` GET/POST/DELETE con alcance + caller.
- `gastos/src/agent/gestionar.js` y `aprender.js` — al reconciliar/guardar
  hechos automáticos, respetar alcance (default 'empresa').
- Tests nuevos de aislamiento (ver abajo).

## Tests de aislamiento (lo más importante)

Unitarios (`gastos/tests/agent/`):
1. `memory.js`: dos empresas A,B con hechos; `listMemorias(A, personaA)` solo
   trae A. (cross-tenant)
2. `memory.js`: persona P1 guarda personal; `listMemorias(C, P2)` NO la trae;
   `listMemorias(C, P1)` SÍ; la de empresa la traen ambos.
3. `getAgentPrefs(db, empOfB, companyA)` → `{}` (no cruza).
4. `buildAgentContext` para empresa A nunca incluye memoria/resumen de B.

De endpoint (`gastos/tests/panel/` y `gastos/tests/`):
5. Panel: POST `/kaly/memoria` personal por dueño A; GET por dueño B no la ve;
   401 sin token; la de empresa A no aparece para B.
6. App: dos empleados de la misma empresa; memoria personal separada, memoria de
   empresa compartida.
7. `/agent/session` de empresa A y de empresa B devuelven `context.empresaNombre`
   y `memorias` distintos (nivel 3: contexto fresco por sesión).

Todos deben pasar antes de desplegar.

## Riesgos y decisiones

- **Retrocompatibilidad:** las memorias actuales quedan como "empresa"
  (comportamiento idéntico). Sin migración de datos destructiva.
- **pg-mem:** los ALTER van en `MEMORY_DDL` con try/catch tolerante (igual que
  el resto). El índice compuesto es soportado por pg-mem.
- **Borrado de empresa:** restringido a `rol=owner` para no permitir que un
  empleado borre la memoria del negocio.
- **No se persiste la sesión (nivel 3):** si en el futuro se quiere historial de
  conversaciones, será otra spec.

## Fuera de alcance

- UI nueva de gestión de memoria en el panel/app (se puede agregar después;
  esta spec deja los endpoints listos).
- Historial de conversaciones persistido.
- Cambiar el motor de voz o los prompts (nivel 1) más allá de documentar.
