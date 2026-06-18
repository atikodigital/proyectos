# M5 — Proactividad (actuar) de KALY — Diseño

**Fecha:** 2026-06-18
**Producto:** K.A.L.Y. (agente de voz de Hash IA, app `gastos-app`). Repo `HASH IA`, branch `master`.
**Alcance:** último sub-proyecto de la memoria agéntica de KALY. **M5 = ACTUAR / proactividad:** que KALY, al saludar, mencione SOLA y de forma útil UNA señal relevante derivada de lo que sabe (resumen vivo del negocio + memoria), en vez de solo un saludo genérico.

> Serie: M1 almacén+recall+recordar ✅ · M4 personalidad ✅ · M2 aprender auto ✅ · M3 gestionar/reconciliar ✅ (todos desplegados) → **M5 proactividad** (este, cierra la serie).

## Contexto (ya existente)

- `gastos/src/agent/context.js` `buildAgentContext(db, {companyId, employeeId, now})` arma el contexto que va al prompt: `{nombre, trato, onboarded, saludoHora, empresaNombre, resumen, memorias, persona}`.
  - `resumen` = `{ gastos, ingresos, saldo, countGastos, countIngresos, porCategoria, pendientesPago }` (mes actual, gastos confirmados; `saldo = ingresos - gastos`; `pendientesPago` = gastos confirmados con `estado_pago='registrada'`).
  - `memorias` = lista de hechos (`{id, tipo, contenido, origen, created_at}`).
- `agent_prefs` es una columna **jsonb** en `employees`. `getAgentPrefs(db, employeeId)` devuelve el objeto; `setAgentPrefs(db, employeeId, patch)` mergea campos puntuales (nombre/trato/onboarded). Endpoint `PATCH /api/app/agent/prefs` (api.js `agentPrefs`).
- App `gastos-app/src/gastos/kaly/prompt.js`:
  - `buildSystemPrompt(context)` arma el system prompt (ya inyecta persona + memorias + resumen).
  - `instruccionInicial(context, motivo)` arma la PRIMERA frase que dice KALY. Motivos: `onboarding|saludo|inactividad|manual` (de `logic.js` `decideAutoStart`). Hoy `saludo` dice algo genérico ("Hola, buenos días, ¿en qué trabajaremos hoy?").
- KALY es Gemini Live (voz). `KalyAgent.jsx` llama `api.agentSession()` (que corre `buildAgentContext`) y abre la sesión con `buildSystemPrompt(context)` + `instruccionInicial(context, motivo)`.

## Decisiones (del usuario, vía brainstorming)
1. **Qué:** status útil + llenar huecos. Al saludar, KALY menciona UNA señal: o un dato del negocio (flujo en rojo, gastos sin pagar) o —si la memoria tiene huecos clave— una pregunta para llenarlos.
2. **Cómo:** reglas en el backend (no LLM dedicado, no improvisación). `buildAgentContext` calcula las señales desde `resumen` + `memorias` y las inyecta al contexto; KALY (Live) elige la primera y la dice natural. Instantáneo, confiable, testeable con pg-mem.
3. **Anti-molesto:** máx 1 señal por saludo + switch on/off para el dueño. Sin tracker de frecuencia (las señales se auto-resuelven). Default ON.

## Diseño

### Backend — `gastos/src/agent/senales.js` (nuevo, puro)
- `construirSenales(context)` → array de frases cortas en español, **priorizadas**, o `[]`. `context` = el objeto de `buildAgentContext` (usa `resumen` + `memorias`). Reglas (orden = prioridad):
  1. **Plata** (de `resumen`):
     - `saldo < 0` → `"este mes vas con saldo negativo (gastaste más de lo que ingresó)"`.
     - `pendientesPago > 0` → `"tienes ${pendientesPago} gasto(s) confirmado(s) sin marcar como pagados"`.
     - `countGastos === 0 && countIngresos === 0` → `"este mes aún no registras movimientos"`.
  2. **Huecos de memoria** (de `memorias`, por palabras clave sobre `contenido`):
     - sin horario (regex `/horari|abre|cierra|atiend|lunes|s[áa]bado|domingo/i`) → `"no me has contado tu horario de atención"`.
     - sin dirección (`/direcci|ubica|queda en|local en|calle|avenida/i`) → `"no sé bien dónde queda tu negocio"`.
     - sin formas de pago (`/pago|transfer|efectivo|tarjeta|débito|crédito/i`) → `"no sé qué formas de pago aceptas"`.
     - si `memorias.length === 0` → en vez de los 3 anteriores, una sola: `"todavía sé poco de tu negocio, cuéntame algo para ayudarte mejor"`.
  - Función pura, sin DB, sin red. Tope implícito: el consumidor usa solo `[0]`.

### Backend — `context.js` + `companies/repo.js`
- `buildAgentContext`: tras armar el contexto, si la proactividad está **encendida** (`prefs.proactividad !== false`, default ON) agrega `senales: construirSenales(ctx)`; si está apagada, `senales: []`. Además expone `proactividad: prefs.proactividad !== false`.
- `setAgentPrefs`: acepta `if (patch.proactividad !== undefined) next.proactividad = Boolean(patch.proactividad);`. Sin migración (es jsonb).

### App — `prompt.js`
- `instruccionInicial(context, 'saludo')`: si `context.senales && context.senales[0]`, abre el saludo mencionándola: `"Enciende el micrófono y saluda breve y natural mencionando esto y luego ofrece ayuda: '${senales[0]}'."` (en su tono/persona). Si no hay señal, el saludo genérico de hoy. Los otros motivos (`onboarding|inactividad|manual`) NO cambian.
- `buildSystemPrompt(context)`: bloque corto "Saludo proactivo" cuando `context.senales?.length`: recuerda a KALY mencionar **solo UNA** señal al saludar, breve, en su tono, sin agobiar ni repetir.

### App — switch del dueño
- Un toggle "KALY proactiva" (encendido/apagado) en los ajustes de KALY → `api.agentPrefs({ proactividad })`. Ubicación: un punto aislado de la app para no chocar con el rediseño que Antigravity tiene en curso (se decide en el plan). `api.js` ya tiene `agentPrefs(patch)`.

### Data flow
1. App abre → `api.agentSession()` → backend `buildAgentContext` calcula `senales` (si proactividad ON).
2. App recibe el contexto con `senales`; `buildSystemPrompt` + `instruccionInicial('saludo')` lo usan.
3. KALY abre el saludo mencionando `senales[0]` de forma natural (o saludo genérico si `[]`).
4. El dueño puede apagar la proactividad con el toggle → próximas sesiones sin señales.

### Manejo de errores / privacidad / multi-tenant
- `construirSenales` es pura y defensiva (campos faltantes → no rompe, simplemente menos señales). Si algo falla, peor caso = saludo genérico.
- Todo scoped por `company_id`/`employee_id` (ya en buildAgentContext).
- No persiste nada nuevo; las prefs viven en `agent_prefs` (ya existente).

### Testing (TDD)
- `construirSenales` (puro): saldo<0 → señal de saldo primero; pendientesPago>0 → señal de pendientes; mes sin movimientos → señal; huecos de memoria (cada keyword) detectados; memoria vacía → la señal única "sé poco"; contexto sin nada relevante → `[]`; orden plata-antes-que-huecos.
- `buildAgentContext` (pg-mem): incluye `senales` cuando proactividad ON; `senales: []` y `proactividad:false` cuando `agent_prefs.proactividad === false`.
- `setAgentPrefs` (pg-mem): guarda `proactividad` boolean.
- App `instruccionInicial`: con `senales` usa la primera en el saludo; sin señales, saludo genérico; no toca onboarding/inactividad/manual.
- App `buildSystemPrompt`: incluye el bloque cuando hay señales; lo omite cuando no.
- App toggle: llama `api.agentPrefs({proactividad})`.
- Suites backend + app verdes + build.

## Fuera de M5
- Proactividad DURANTE la charla (solo al saludar).
- Sugerencias/consejos de negocio complejos.
- Anti-repetición con tracker (`last_signal`) — las señales se auto-resuelven, YAGNI.
- Embeddings/búsqueda semántica/decay (eran de M3, pospuestos).

## Siguiente paso
Aprobar → `writing-plans`.
