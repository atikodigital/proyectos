# VARAS — F4b: Voz (Gemini Live) — Plan

**Fecha:** 2026-06-18
**Repo:** `HASH IA\` (canónico, rama master)
**Spec:** `docs/superpowers/specs/2026-06-16-varas-f4-conversacional-design.md` §4
**Precondición:** F4a completa (cerebro+tools+endpoints+UI chat, 395 backend / 154 app tests verdes).

## Objetivo
Que el dueño **hable** con VARAS por voz (igual que KALY), con **voz, esfera, prompt y personalidad propios**
(controlador financiero, tono serio), reusando la infra técnica de Gemini Live de KALY. La voz responde
con datos reales (tools de lectura) y ejecuta acciones **solo tras confirmación verbal explícita**.

## Arquitectura — decisión clave
El loop de tools de Gemini Live corre **en el cliente** (Live emite `toolCall` → cliente ejecuta → `sendToolResponse`).
Para **no duplicar** la lógica de las tools de lectura (saldo/balance/flujo/deudas/conciliación/consumo) que ya
viven server-side en `varas/tools.js` (`TOOLS_READ`), el cliente las invoca vía un **endpoint delgado**:
- **`POST /api/app/varas/tool` `{ name, args }`** → ejecuta `TOOLS_READ[name](db, companyId, args)` server-side, scoped por empresa, y devuelve `{ data }`. Rechaza nombres que no sean de lectura (`error: 'tool_no_permitida'`).
- Acciones → el endpoint ya existente **`POST /api/app/varas/accion`** `{ tipo, args }` (F4a-2).

Así la voz reusa EXACTAMENTE el mismo cerebro de lectura y las mismas acciones. Voz = **solo app** (KALY tampoco está en el panel).

---

## Task 1 — Backend: endpoint `/varas/tool` (lectura)
**Archivos:** `gastos/src/app/router.js`, `gastos/src/panel/router.js` (mismo endpoint en ambos por consistencia; el de panel bajo requireKind('user')).
- Importar `TOOLS_READ` de `../varas/tools`.
- `router.post('/varas/tool', ...)`: `const { name, args } = req.body||{}; const fn = TOOLS_READ[name]; if (!fn) return res.status(400).json({ error:'tool_no_permitida' }); try { const data = await fn(db, req.auth.companyId, args||{}); res.json({ data }); } catch(e){ res.status(500).json({ error:'fallo_tool' }); }`.
**Test:** `gastos/tests/varas/tool-endpoint.test.js` (supertest + pg-mem o el harness de los otros tests de api varas): un nombre de lectura válido (p.ej. `balance`) devuelve `{ data }` scoped por empresa; un nombre no permitido (p.ej. `marcar_pagado`) → 400 `tool_no_permitida`; multi-tenant (otra empresa no ve datos). TDD. Commit `feat(varas-f4b): endpoint /varas/tool (lectura server-side para la voz)`.

## Task 2 — App: módulo de voz de VARAS
**Archivos nuevos:** `gastos-app/src/gastos/varas/voice/prompt.js`, `gastos-app/src/gastos/varas/voice/tools.js`, `gastos-app/src/gastos/varas/VarasOrb.jsx`, `gastos-app/src/gastos/varas/VarasVoice.jsx`.
**Modificar:** `gastos-app/src/gastos/kaly/live.js` (parametrizar voz), `gastos-app/src/gastos/api.js` (varasTool), `gastos-app/src/gastos/VarasChat.jsx` (montar la esfera/mic de voz).

1. **live.js — parametrizar voz (cambio mínimo, no rompe KALY):** `openLiveSession(opts)` acepta `voice`; en el `setup` usar `prebuiltVoiceConfig: { voiceName: opts.voice || 'Charon' }`. KALY sigue con 'Charon' (default). VARAS pasará **'Orus'** (voz distinta, seria/grave para el contador).
2. **api.js:** `varasTool(name, args) { return req('/api/app/varas/tool', { method:'POST', body:{ name, args } }); }`.
3. **voice/prompt.js:** `buildVarasVoicePrompt(context)` → identidad VARAS (controlador financiero IA, tono serio/conciso, español de Chile, montos CLP), reglas: responder SOLO con datos de las tools (cero invención); para saldos/balance/flujo/deudas/conciliación/consumo USA la tool; **NUNCA** ejecutar `marcar_pagado`/`crear_asiento_manual`/`enviar_resumen_whatsapp` sin confirmación verbal EXPLÍCITA en el turno inmediatamente anterior — primero di la propuesta y pregunta "¿Confirma?", y solo si responde afirmativo llamas la tool de acción. `instruccionInicialVoz(motivo)` para el saludo al tocar la esfera.
4. **voice/tools.js:** `TOOL_DECLARATIONS` en formato Gemini Live (OBJECT mayúscula) con los mismos nombres que el cerebro: lectura `saldo_cuenta`, `balance`, `flujo`, `deudas`, `estado_conciliacion`, `consumo_insumo`; acción `marcar_pagado`, `crear_asiento_manual`, `enviar_resumen_whatsapp`. `executeVarasVoiceTool(name, args)`: si es de lectura → `const r = await api.varasTool(name, args); return r.data || r;`; si es de acción → `const r = await api.varasAccion(name, args); return r;`. (El nombre de la acción == tipo que espera `/varas/accion`.) Conjunto `ACCION_NAMES` para distinguir. Maneja errores devolviendo `{error}`.
5. **VarasOrb.jsx:** esfera estilo HUD pero **tema ORO `#C9A24B`** (distinta del celeste de KALY), label "VARAS". Puede ser una versión simplificada/adaptada de `KalyOrb` con la paleta dorada. Mismo contrato de props `{ state, audioLevel, onTap }`. Salta el rAF en test (JEST_WORKER_ID).
6. **VarasVoice.jsx:** orquestador de sesión Live para VARAS (adaptado de `KalyAgent`, **sin** onboarding/auto-start/inactividad — VARAS arranca SOLO al tocar la esfera). Estados off/connecting/live/listening/speaking/error. `start('manual')`: `api.agentSession()` (reusa token+model native-audio), `openLiveSession({ token, model, voice:'Orus', systemPrompt: buildVarasVoicePrompt(ctx), tools: TOOL_DECLARATIONS, audio:true, onToolCall → executeVarasVoiceTool + sendToolResponse, ... })`. Botón silenciar opcional. Muestra última respuesta + transcripción.
7. **VarasChat.jsx:** montar `<VarasVoice/>` arriba del chat de texto (la esfera dorada de VARAS), de modo que en la pestaña VARAS conviva texto + voz.

**Tests (RTL + jsdom, `tests/gastos/`):**
- `live.voice.test.js` (o ampliar test de live si existe): con `wsFactory` fake + `audio:false`, al `onopen` el `setup` enviado incluye `voiceName:'Orus'` cuando se pasa `voice:'Orus'`, y `'Charon'` por defecto.
- `varas-voice-tools.test.js`: `executeVarasVoiceTool('balance', {})` llama `api.varasTool('balance',...)` y devuelve data; `executeVarasVoiceTool('marcar_pagado', {...})` llama `api.varasAccion('marcar_pagado',...)`.
- `VarasVoice.test.jsx`: mock `./api` (agentSession) + `./kaly/live` (openLiveSession fake que captura opts y expone sendText/sendToolResponse/close/setMuted); al tocar la esfera entra en connecting→live; un toolCall de lectura dispara executeVarasVoiceTool→sendToolResponse. Reusa el patrón de los tests de KALY si existen (`tests/gastos/Kaly*.test.jsx`).
TDD. Commit `feat(varas-f4b): agente de voz de VARAS (esfera dorada + voz Orus + tools reusadas)`.

## Task 3 — Cierre
- `cd gastos && npx jest` verde; `cd gastos-app && npx jest` verde; `cd gastos-app && npm run build` OK.
- `version.js` v3.12 → **v3.13**.
- Commit `chore(varas-f4b): cierre voz (suites verdes + build + v3.13)`.

## No rompe lo existente
- `live.js` voz parametrizada con default 'Charon' → KALY intacto.
- Additivo: nuevo endpoint `/varas/tool`, nuevos módulos `varas/voice/*` + `VarasOrb`/`VarasVoice`. No toca KALY, contabilidad, conciliación ni auxiliares.
- Tests sin red: api mockeada, `wsFactory` fake, `audio:false`.
