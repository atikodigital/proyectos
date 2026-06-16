# K.A.L.Y. Fase 1 — Agente contable de voz en Hash IA

**Fecha:** 2026-06-12
**Estado:** Aprobado (pendiente revisión del spec por el usuario)
**Base:** app Hash IA (`gastos-app/`, Capacitor+React) + backend (`gastos/`, Node/Express) ya en producción.
**Prototipo de referencia:** `gastos-app/J.A.R.V.I.S..html` (esfera SVG reactiva + personalidad). Se migra de OpenAI a **Gemini Live**.
**System prompt de referencia:** JSON de K.A.L.Y. provisto por el usuario (onboarding, gestión de tokens, OCR línea a línea, devengado, conciliación). La Fase 1 implementa las secciones 1 y 2 y deja las demás como roadmap.

## Visión completa (roadmap de fases)

| Fase | Alcance | Estado |
|---|---|---|
| **1. K.A.L.Y. Voz** | Esfera + Gemini Live + onboarding + saludos/timeouts + acciones por voz + barra 4 botones + detección de cartola/libro | **ESTA SPEC** |
| 2. Transaccional | Registro sin imagen por voz/texto (deduce gasto/ingreso, calcula IVA, valida y registra) | futuro |
| 3. Match SII | Cargar Libro de Compra/Venta del SII, cotejar folios/RUT, registrar faltantes | futuro |
| 4. Match bancario | Cargar cartolas, conciliar por monto/RUT/fecha, iteración de sumas para pagos masivos | futuro |
| 5. Contabilidad devengado | Plan de cuentas, asientos cargo/abono, IVA crédito/débito, protocolo pagado/efectivo/parcial | futuro (con 3-4) |
| 6. Multicanal OP/OC | Pedidos desde WhatsApp/IG/email/etc. → órdenes de pedido/compra | futuro |

## Objetivos Fase 1

1. **K.A.L.Y.** (voz masculina grave "Charon", seria, formal, trata de "señor/señora") vive en el tab Captura, **arriba de los botones de captura**, como una esfera reactiva al audio **mimetizada con el fondo de la app** (sin caja, fondo transparente, color base dorado #C9A24B).
2. **Conversación en vivo** (Gemini Live API): respuesta inmediata, interrumpible hablando encima (barge-in nativo).
3. **Onboarding primera vez en la historia**: se presenta ("Soy K.A.L.Y., su asistente contable…"), pregunta nombre y trato preferido, **los guarda en memoria permanente** (backend), y explica los 4 botones de la app (Captura, Movimientos, Transaccional, Match) según el guion del usuario.
4. **Saludo diario**: en la primera apertura del día (post-onboarding) saluda según la hora ("buenos días/tardes/noches, [trato] [nombre], ¿en qué trabajaremos hoy? ¿Necesita ayuda?").
5. **Protocolo anti-tokens** (apagado automático):
   - Respuesta "no" (o equivalente) o **5 segundos de silencio** tras un saludo/pregunta → micrófono OFF, sesión cerrada.
   - **5 minutos sin interacción** con la app → pregunta breve ("¿Le puedo ayudar en algo, [trato]?") → no/silencio → cierra.
   - **Tocar la esfera** = iniciar/terminar manualmente. Sin sesión abierta no se consume API.
6. **Conoce tus números**: al abrir sesión recibe contexto (ingresos/gastos/saldo del mes, pendientes) y responde preguntas sobre ellos.
7. **Acciones por voz** (function calling), siempre con confirmación verbal previa: marcar pagada, anular movimiento, enviar resumen WhatsApp, listar/consultar movimientos, guardar preferencias (nombre/trato).
8. **Barra de 4 botones**: `Captura · Movimientos · Transaccional · Match(rojo)`. Transaccional y Match muestran pantalla "próximamente" con su descripción.
9. **Detección de cartola/libro en la captura**: el OCR clasifica también `cartola` y `libro_compra_venta`. Si se captura uno de esos documentos, NO se registra como gasto/ingreso: se enruta al módulo Match automáticamente. En Fase 1 ese enrutamiento muestra/dice "Detecté una cartola/libro, señor — el módulo Match se activará aquí próximamente". En Fases 3-4 dispara la conciliación real de inmediato.

## No-objetivos (Fase 1)

- Registrar movimientos por voz sin imagen (Fase 2 — Transaccional).
- Conciliación real SII/bancaria (Fases 3-4); aquí solo detección + aviso.
- Asientos contables/devengado (Fase 5).
- Canales externos (Fase 6).
- Wake-word ("Hey Kaly") con micrófono siempre abierto — descartado por costo/batería/privacidad.
- iOS (Android primero, como el resto de la app).

## Arquitectura

### A. Backend (`gastos/`)

**A1. Token efímero + contexto — `POST /api/app/agent/session`** (auth: JWT empleado)
- Crea un **token efímero** de Gemini (API `v1alpha auth_tokens`, TTL ~30 min, usos limitados) usando la GEMINI_API_KEY del servidor. La key real nunca viaja a la app.
- Devuelve `{ token, expireAt, context }` donde `context` = `{ nombre, trato, onboarded, saludoHora ('dia'|'tarde'|'noche', según hora de Chile), resumen: { ingresos, gastos, saldo, countGastos, countIngresos, pendientesPago }, empresaNombre }` (resumen = `cashflowSummary` del mes en curso + conteo de gastos confirmados con `estado_pago='registrada'`).
- **Riesgo conocido:** si la cuenta/key no soporta tokens efímeros, plan B = proxy WebSocket por el backend (`/api/app/agent/ws`). Se valida al inicio de la implementación; el contrato con la app no cambia (la app recibe URL+token sea cual sea el modo).

**A2. Memoria permanente — columna `agent_prefs jsonb` en `employees`**
- Forma: `{ "nombre": "José", "trato": "señor", "onboarded_at": "2026-06-12T..." }`.
- `PATCH /api/app/agent/prefs` (auth empleado): guarda nombre/trato/onboarded. Lo invoca la app cuando K.A.L.Y. ejecuta la tool `guardar_preferencias`.
- Migración aditiva idempotente (mismo patrón ALTER de v2).

**A3. Endpoints espejo para las acciones por voz** — las consultas reutilizan la API actual de la app (`GET /expenses`, `PATCH /expenses/:id`, `POST /expenses/:id/anular`). Se agregan dos espejos con auth de empleado (los originales son de panel/kind user): `PATCH /api/app/expenses/:id/pagar` (ownership igual que /anular) y `POST /api/app/agent/resumen-whatsapp` (reusa `cashflowSummary`+`formatCashflowSummary`+`getCompanyWa`, scope empresa del empleado).

### B. App (`gastos-app/src/gastos/kaly/`)

**B1. `live.js` — cliente Gemini Live** (módulo sin React, testeable con WS/audio mockeados)
- Abre WebSocket a Gemini Live con el token efímero. Modelo: el Live nativo-audio vigente (configurable vía define de Vite `__KALY_LIVE_MODEL__`, default el actual de Google). Config de sesión: voz **Charon**, idioma español, `systemInstruction` = prompt K.A.L.Y. (B4) + contexto inyectado, `tools` (B3), transcripción de entrada habilitada (para detectar "no"/silencio).
- **Audio in:** getUserMedia → AudioWorklet/ScriptProcessor → PCM 16 kHz mono → chunks `realtimeInput`. **Audio out:** PCM 24 kHz → cola de reproducción AudioContext. Expone `onLevel(in/out)` para la esfera, `onToolCall`, `onUserTranscript`, `onTurnComplete`, `close()`.
- Maneja interrupción nativa (barge-in) y reconexión simple (si el WS cae, la sesión termina y la esfera vuelve a idle).

**B2. `KalyOrb.jsx` — la esfera**
- Adaptación del `JarvisCore` del prototipo: SVG reactivo (anillos, ondas, núcleo), **fondo transparente** (se funde con el fondo real de la app, sin tarjeta ni borde), tamaño compacto (~170 px).
- Colores por estado: idle = dorado tenue (#C9A24B al 40%), listening = dorado brillante, speaking = dorado pulsante con nivel de audio, thinking = ámbar, error = rojo. Nada de azul Matico ni textos "SYS.CORE" (se eliminan los rótulos técnicos del prototipo o se cambian a "K.A.L.Y.").
- Props: `{ state, audioLevel, onTap }`.

**B3. Tools (function calling) y su ejecución**
Declaradas en la sesión; la app las ejecuta contra la API REST con el JWT y devuelve el resultado a la sesión:
- `guardar_preferencias({nombre, trato})` → PATCH agent/prefs.
- `obtener_resumen({periodo?})` → GET /expenses + cashflow client-side, o el resumen del contexto si es el mes en curso.
- `listar_movimientos({tipo?, estado?, limite?})` → GET /api/app/expenses (filtra client-side).
- `marcar_pagada({descripcion_o_proveedor})` → la app resuelve el movimiento más probable de la lista, K.A.L.Y. confirma verbalmente ("¿Confirmo el pago de Sodimac por $11.900, señor?") y solo tras el "sí" llama PATCH …/pagar. (El endpoint de pagar es de panel hoy: se agrega espejo `PATCH /api/app/expenses/:id/pagar` con ownership de empleado, mismo patrón que /anular.)
- `anular_movimiento({descripcion_o_proveedor})` → ídem con confirmación → POST …/anular.
- `enviar_resumen_whatsapp()` → POST /api/app/agent/resumen-whatsapp.
**Regla dura en el prompt:** ninguna acción que modifique datos sin confirmación verbal explícita del usuario en el turno anterior.

**B4. Prompt de sistema K.A.L.Y.** (`kaly/prompt.js`)
- Base: el JSON del usuario (identidad, tono profesional/proactivo/amable/eficiente, trato señor/señora, respuestas concisas 1-3 frases).
- Guion de onboarding (botones): Captura (fotos/capturas que K.A.L.Y. interpreta), Movimientos (registros y su estado pagado/pendiente), Transaccional (registro hablado/escrito sin imagen — "próximamente"), Match (conciliación SII + cartolas bancarias, iteración de sumas para pagos masivos — "próximamente", botón rojo).
- Reglas de cierre: si el usuario dice "no"/"nada"/"gracias" responde con una despedida de UNA frase y la app cierra la sesión.
- Voz Charon + español; siempre en personaje.

**B5. `KalyAgent.jsx` — orquestador (máquina de estados + timers)**
Estados: `off` (sin sesión) · `connecting` · `live` (conversación) · `closing`.
Disparadores de sesión:
1. **Primera vez en la historia** (context.onboarded=false): al montar el tab Captura → pide permiso de micrófono → abre sesión con instrucción inicial "realiza el onboarding completo".
2. **Saludo diario** (onboarded=true y `localStorage.kaly_last_greet` ≠ hoy): abre sesión con instrucción "saluda según la hora y pregunta en qué trabajamos hoy".
3. **Inactividad**: timer de 5 min sin eventos de interacción (touch/click/captura) con la app abierta → abre sesión breve con instrucción "pregunta si puede ayudar en algo".
4. **Tap en la esfera**: toggle abrir/cerrar.
Cierre automático: (a) el usuario responde negativo (la transcripción de entrada matchea no/nada/gracias/estoy bien y K.A.L.Y. se despide) → close; (b) **silencio**: 5 s después de que K.A.L.Y. terminó de hablar sin transcripción de entrada → close; (c) expiración del token → close limpio.
El timer de inactividad se reinicia con cada interacción y cada sesión.

**B6. Detección cartola/libro en la captura**
- `gastos/src/ocr/gemini.js`: el prompt de extracción agrega al campo `tipo` los valores `cartola` y `libro_compra_venta` (además de gasto/ingreso) con instrucciones de reconocimiento (cartola = listado de movimientos bancarios con saldos; libro = registro de compras/ventas del SII con folios y RUTs múltiples).
- `extract.js`/`intake.js`: si `tipo` ∈ {cartola, libro_compra_venta} → NO se crea expense; el endpoint devuelve `202 { tipo, match: 'pendiente' }`.
- App: al recibir 202, muestra pantalla del Match "próximamente" y, si hay sesión K.A.L.Y. activa, este lo anuncia; si no, se muestra el aviso visual. (En Fases 3-4 este mismo punto dispara la conciliación real.)

**B7. Barra de navegación 4 botones** (`GastosApp.jsx`)
- `Captura · Movimientos · Transaccional · Match`. Match en rojo (#b91c1c). Transaccional y Match → componentes placeholder con título, descripción de qué harán y "Próximamente".
- La esfera K.A.L.Y. + `KalyAgent` viven en el tab Captura, arriba de `EvidenceIntake`.

## Manejo de errores

- Sin permiso de micrófono → esfera en estado error con mensaje "Activa el micrófono para hablar con K.A.L.Y."; la app sigue funcionando normal sin agente.
- Token efímero falla / WS cae → esfera vuelve a idle silenciosamente; tap reintenta (nueva sesión = nuevo token).
- Tool call falla (API caída) → K.A.L.Y. lo dice honesto ("No pude completar la operación, señor") sin inventar éxito.
- Sin conexión → la esfera queda idle; el resto de la app funciona.

## Testing

- Backend: tests del endpoint `agent/session` (mock del cliente de tokens; devuelve contexto correcto con cashflow y prefs), `agent/prefs` (persiste jsonb, tenant-scoped), `agent/resumen-whatsapp` (espejo del de panel), espejo `/pagar` de app, y clasificación `cartola`/`libro_compra_venta` (extract con mock Gemini → intake devuelve 202 sin insertar).
- App: tests jest de `KalyAgent` (máquina de estados con fake timers: onboarding 1ª vez, saludo diario una vez al día, cierre por silencio 5 s, timer 5 min, toggle por tap) y del manejador de tools (cada tool llama el endpoint correcto; las mutadoras exigen confirmación previa) — WS y audio mockeados.
- Voz real (latencia, barge-in, calidad Charon): prueba manual en teléfono (runbook).

## Despliegue

- Migración aditiva (`agent_prefs`), redeploy backend, rebuild APK (v1.4). El modelo Live y la voz quedan configurables por env/define para ajustarlos sin recompilar el backend.
- Costo operativo: sesiones cortas bajo demanda; sin sesión no hay consumo. Se registra en el log del backend cada emisión de token (auditoría de uso).
