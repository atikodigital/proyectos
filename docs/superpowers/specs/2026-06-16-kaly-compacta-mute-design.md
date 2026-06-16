# KALY compacta + texto + silenciar (diseño)

**Fecha:** 2026-06-16
**Producto:** Hash IA (app `gastos-app`) — agente de voz K.A.L.Y.
**Alcance:** rediseñar el strip global de KALY (`KalyAgent.jsx`) para que ocupe poco espacio, responda por voz **y texto**, y tenga un botón **silenciar** (modo reunión). Es global: aparece igual en Captura · Movimientos · Transaccional · Match · Chat.

## Contexto

`KalyAgent.jsx` se renderiza arriba de `<main>` en `GastosApp.jsx`, sobre todas las pestañas. Hoy, cuando KALY se activa, muestra un **recuadro de historial con scroll** (`h-28`, ~112px) con todos los mensajes + una barra de texto, todo dentro de un `<div>` que solo aparece con `state !== 'off'`. Eso ocupa demasiado. `live.js` abre la sesión Gemini Live con `responseModalities: ['AUDIO']` + `inputAudioTranscription` (transcribe al usuario) pero **no** transcribe lo que dice KALY, así que hoy no hay texto fiable de sus respuestas.

## Objetivo

KALY compacta: esfera (voz) + barra de texto siempre visible + su última respuesta en 1-2 líneas (texto) + botón silenciar para reuniones.

## Decisiones (del usuario)
1. **Quitar el recuadro de historial** (la caja con scroll que ocupa espacio).
2. **Mantener la esfera** para hablar por voz (tap inicia/termina).
3. **Barra "Escribe a Kaly…" SIEMPRE visible** (incluso con KALY apagada): escribir + enviar con KALY apagada **arranca la sesión** y manda el texto.
4. **KALY responde por voz Y texto**: mostrar solo **su última respuesta** (1-2 líneas, compacta) bajo la esfera; no el muro.
5. **Silenciar = KALY deja de HABLAR** (corto el parlante), **PERO la sesión sigue viva**: el micrófono queda activo (por eso puedes decirle "cállate" y te sigue oyendo) y te responde por **texto**. NO es `audio:false` (eso apagaría también el mic). **Dos gatillos** para silenciar, ambos al mismo estado `muted`:
   - (a) **Decirle "cállate / silencio / no hables"** por voz o texto → se detecta y entra en silencio.
   - (b) El **botón 🔇**.
   Se recuerda (localStorage `kaly_muted`) y **persiste entre sesiones**. Estando silenciada **SÍ auto-arranca** (no queda muerta: sigue trabajando), solo que arranca **callada** (sin voz, responde por texto) hasta que la reactives con el botón 🔊.

## Diseño

### `live.js` — texto de las respuestas + silenciar el parlante
- Agregar `outputAudioTranscription: {}` al `setup` (junto a `inputAudioTranscription: {}`).
- En `onmessage`, manejar `serverContent.outputTranscription.text` → llamar `onAgentTranscript(text)` (hoy solo se intenta con `p.text`, que con modalidad AUDIO casi nunca llega). Así se ve el texto de lo que KALY dice.
- **Silenciar el parlante SIN matar la sesión:** la sesión expone `setMuted(bool)`; el `player` (createPlayer) respeta un flag `muted` → cuando está muteado, `push(b64)` **no reproduce** (no agenda el bufferSource) pero igual cuenta el drain/turnos. El **micrófono sigue enviando** (no se detiene). El texto (`outputTranscription`) sigue llegando. Así KALY no suena, pero oye y responde por texto.
- (El `audio:false` se mantiene SOLO para tests/jsdom, no para el silencio.)

### `KalyAgent.jsx` — UI compacta + mute
- **Estado nuevo**: `muted` (init desde `localStorage.kaly_muted === '1'`).
- **Quitar** el bloque del recuadro de historial (`<div className="w-full h-28 overflow-y-auto …">` con el `.map(messages)`), y el `messagesEndRef`/scroll asociado.
- **Última respuesta**: derivar `ultimaKaly` = el último mensaje con `sender==='kaly' && !isSystem`; mostrarlo en una línea compacta (máx 2 líneas, `line-clamp-2`) bajo la esfera. Si no hay, no mostrar nada (o el estado tipo "Conectando…").
- **Barra de texto SIEMPRE visible** (sacarla de dentro del `state !== 'off'`): input "Escribe a Kaly…" + botón Enviar. `handleSendText`: si no hay sesión (`state==='off'`), primero `start('manual')` y luego manda el texto (encolar: la sesión ya tiene cola interna `queue` + `sendText`; basta llamar `start` y, tras crear la sesión, `sessionRef.current.sendText(txt)` — como `start` es async, enviar el texto tras `await start(...)` o dejar que el usuario lo reintente; implementación: `await start('manual')` y luego `sessionRef.current?.sendText(txt)`).
- **Botón Silenciar** (icono 🔇/🔊) junto a la esfera: `toggleMute()` invierte `muted`, lo persiste en `localStorage.kaly_muted`. Si hay sesión viva, llama `sessionRef.current.setMuted(nuevoMuted)` (NO reinicia la sesión — el mic sigue, solo cambia el parlante). Si está apagada, solo cambia la preferencia para la próxima sesión.
- **Aviso de silencio**: cuando `muted`, mostrar un textito junto a la esfera/respuesta, p. ej. **"🔇 En silencio — te respondo por texto. Toca 🔊 para la voz."** Así el usuario sabe que no está rota, solo callada por el botón. El **micrófono siempre escucha** aunque esté silenciada.
- **`start(motivo)`**: siempre abre con `audio: true` (mic+sesión). Si `muted`, justo después de crear la sesión llama `sessionRef.current.setMuted(true)` para arrancar **callada** (parlante muteado), pero viva.
- **Auto-start**: **NO cambia** — sigue auto-arrancando con `decideAutoStart` aunque esté `muted` (no queda muerta). La única diferencia es que arranca con el parlante muteado.
- Mantener: timers de silencio/inactividad, tools, onboarding, KalyOrb.

## Manejo de errores
- Sin cambios de fondo: si `agentSession` falla → estado 'error' + mensaje corto (ya existe). El texto de respuesta usa `outputTranscription`; si no llega, simplemente no se muestra texto (la voz sigue, salvo en mute).

## Testing (jest + RTL)
- Revisar/ajustar el test existente de `KalyAgent` (si lo hay) para que no dependa del recuadro de historial eliminado.
- Nuevos asserts: (a) la **barra de texto está siempre visible** (incluso con `state==='off'`); (b) existe el **botón silenciar** y al togglear persiste `localStorage.kaly_muted`; (c) estando `muted`, el componente no auto-arranca (no se llama `api.agentSession` en mount) — mockeando `api.agentSession`. Tests con `audio:false`/wsFactory mock como el resto de KALY. Mantener la suite app verde.

## Fuera de alcance (otros pasos, ya conversados)
- Mover "Productos" dentro del módulo Chat.
- Chat bidireccional real tipo WhatsApp (escribir/audio/descargar al cliente) — depende de la API oficial por canal (omnicanal multi-tenant, App Review). Se diseña aparte.

## Siguiente paso
Aprobar este spec → `writing-plans` para el plan de implementación.
