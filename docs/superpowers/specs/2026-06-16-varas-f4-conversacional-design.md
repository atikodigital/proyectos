# VARAS — F4: Agente conversacional (chat + voz) — Diseño

**Fecha:** 2026-06-16
**Producto:** Hash IA Finanzas / VARAS
**Repo:** `HASH IA\` (canónico, rama master)
**Estado:** diseño aprobado, pendiente plan (writing-plans)

## 1. Objetivo

Que el dueño le **pregunte a VARAS en lenguaje natural** y obtenga respuestas usando
todo lo construido (contabilidad F1, conciliación F2/F3, asientos F5, auxiliares A1–A4):
"¿cuánto debo?", "¿qué falta conciliar?", "¿cuál es mi flujo de caja?", "¿cuántos kilos
de harina consumimos?", "¿cuánto gasté en electricidad?". Además puede **proponer
acciones** (marcar pagado, crear asiento, enviar resumen) que el dueño confirma.

## 2. Decisiones (aprobadas vía AskUserQuestion, 2026-06-16)

1. **Texto primero (F4a), luego voz (F4b).** El chat de texto entrega el valor y es testeable; la voz reusa la infra de Gemini Live de K.A.L.Y. con voz/esfera propias de VARAS (fase aparte).
2. **Consultar + acciones con confirmación.** Tools de lectura (read-only) + tools de acción que VARAS **propone** y el dueño **confirma** (nada se ejecuta solo).
3. **App + panel web.**

## 3. Arquitectura (F4a — texto)

### 3.1 Cerebro: `varas/chat.js`
`responder(db, companyId, messages, { gemini })` → `{ reply, accionPropuesta? }`.
- Arma el **system prompt de VARAS** (controlador financiero, serio/conciso, responde con los datos reales, cero invención) + las **declaraciones de tools**.
- Llama a Gemini (function-calling, **inyectable** para tests) en un **loop**:
  - Gemini pide un **tool de lectura** → el servidor lo ejecuta y devuelve el dato → Gemini sigue.
  - Gemini pide un **tool de acción** → NO se ejecuta: se devuelve `accionPropuesta = { tipo, args, descripcion }` y se corta el loop (el dueño confirma aparte).
  - Gemini responde texto → `reply`.
- Tope de iteraciones (p. ej. 5) para no colgarse.

### 3.2 Tools de lectura (reusan lo construido)
- `saldo_cuenta(nombre|clave)` y `balance()` y `flujo(periodo)` → `contabilidad/reportes`.
- `deudas()` → saldos de Proveedores (por pagar) y Clientes (por cobrar) del Mayor.
- `estado_conciliacion()` → `match/repo.getUltima` (SCA/SBA, cuadrado, partidas pendientes).
- `consumo_insumo(nombre, periodo)` → `auxiliares/reportes.consumoPorNombre` + `frasearConsumo`.

Cada tool: `(db, companyId, args) → dato estructurado`. Registro en `varas/tools.js`.

### 3.3 Tools de acción (con confirmación)
- `marcar_pagado(expenseId|descripcion)` → `markExpensePaid` (+ contabiliza).
- `crear_asiento_manual({fecha, glosa, lineas})` → `contabilidad/manual.crearAsientoManual`.
- `enviar_resumen_whatsapp()` → el resumen de cashflow al owner_whatsapp.
VARAS las **propone** (`accionPropuesta`); ejecutar = `POST /varas/accion`.

### 3.4 Endpoints (app y panel, multi-tenant)
- `POST /varas/chat` `{ messages:[{role, text}] }` → `{ reply, accionPropuesta? }`.
- `POST /varas/accion` `{ tipo, args }` → ejecuta la acción confirmada (valida tipo permitido, scoped por empresa), devuelve resultado.

### 3.5 UI
- **App:** un chat de VARAS en el hub **VARAS · Contabilidad** (pestaña "VARAS" o un botón/orbe): burbujas usuario/VARAS, input, y cuando llega `accionPropuesta` un botón **"Confirmar"** → `/varas/accion`. Reusa el patrón de `api.js`.
- **Panel:** un chat equivalente en la sección Contabilidad.

## 4. Arquitectura (F4b — voz, fase aparte)

Reusa la infra de **K.A.L.Y.**: `agent/token.js` (token efímero Gemini Live), `kaly/live.js`
(WS BidiGenerateContent, audio PCM, barge-in), `kaly/KalyOrb.jsx` (esfera). VARAS = un
segundo agente con **prompt, voz y esfera propias** (controlador financiero, tono serio,
voz distinta a Charon) y las **mismas tools** de F4a (lectura + acción con confirmación
verbal). No comparte personalidad con KALY; sí la infra técnica. Se especifica al construir F4b.

## 5. Faseo

| Fase | Entrega |
|---|---|
| **F4a-1 — Cerebro + tools de lectura** | `varas/tools.js` (read), `varas/chat.js` (`responder` + loop, Gemini inyectable). |
| **F4a-2 — Acciones + endpoints** | tools de acción, `POST /varas/chat`, `POST /varas/accion` (app y panel). |
| **F4a-3 — UI app** | chat de VARAS en el hub + confirmar acción. |
| **F4a-4 — UI panel** | chat en la sección Contabilidad. |
| **F4b — Voz** | reusa Gemini Live de KALY con voz/esfera propias + las tools. |

F4a-1 primero (el cerebro es el corazón; sin él no hay chat).

## 6. Testing

- **Cerebro:** `responder` con un Gemini fake que devuelve tool-calls y luego texto → verifica que ejecuta el tool de lectura, alimenta el dato, y devuelve `reply`; y que un tool de acción produce `accionPropuesta` sin ejecutar.
- **Tools de lectura:** con pg-mem + datos sembrados (saldos, consumo, conciliación).
- **Acción:** `/varas/accion` ejecuta solo tipos permitidos, scoped por empresa.
- **API:** endpoints app+panel (auth, tenant).
- **UI:** app RTL (manda pregunta, muestra reply, confirma acción); panel lib/manual.
- Multi-tenant en todo. La IA (Gemini) siempre inyectable → tests sin red.

## 7. No rompe lo existente

- Es additivo: nuevas rutas `/varas/*` y módulos `varas/*`. No toca KALY, contabilidad, conciliación ni auxiliares (solo los consume).
- K.A.L.Y. (captura/voz general) sigue intacto; VARAS es un agente separado (ver `varas-contabilidad-conciliacion` §3bis del spec de contabilidad).
