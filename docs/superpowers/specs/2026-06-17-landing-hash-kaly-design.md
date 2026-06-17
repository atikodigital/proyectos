# Landing Hash IA con KALY en vivo (J.A.R.V.I.S.-style) — Diseño

**Fecha:** 2026-06-17
**Producto:** Sitio público para promocionar/vender **Hash IA** (SaaS chileno para pymes).
**Subdominio:** `hash.atikodigital.cl` (nuevo, servido por el VPS vía Caddy).
**Idea central:** la primera pantalla es **KALY**, un agente de voz en vivo (Gemini Live) que **habla, vende y responde** — presentado como una **interfaz de IA estilo J.A.R.V.I.S.** (HUD futurista, orbe celeste reactivo a la voz). "No hay mejor forma de presentar el producto que el producto mismo presentándose."

## Contexto

- KALY ya existe como agente Gemini Live en la app: `gastos-app/src/gastos/kaly/live.js` (WebSocket `BidiGenerateContent` v1alpha, audio PCM 16k in / 24k out, `inputAudioTranscription` + `outputAudioTranscription`, `setMuted`) y `prompt.js` (prompt de sistema). Reutilizamos ese patrón en la web.
- Token efímero: `gastos/src/agent/token.js` → `createEphemeralToken({ apiKey })` pega a `v1alpha/auth_tokens` y devuelve un token corto. Hoy lo sirve el router con auth de empleado. Para la web pública creamos un endpoint **público con rate-limit**.
- Referencia visual: `C:\Users\josea\Desktop\proyectos\Mark-XXXIX` (HUD JARVIS en PyQt: orbe central con anillos giratorios, halo que pulsa, escáneres, tick marks, crosshair, corchetes de esquina, waveform, estado LISTENING/SPEAKING/THINKING). Replicamos ESE lenguaje visual en web (canvas), pero con KALY y color celeste.
- Hash IA = 2 familias: **Finanzas** (gastos/Match/KALY) + **Ventas** (Chat/catálogo/pedidos). Planes por **shots** (1 shot = 1 imagen interpretada por IA): Free 30 / Básico 100 / **Pyme 250 (estrella)** / Empresa 800.

## Decisiones (del usuario)
1. Hosting: **subdominio nuevo en el VPS**, dominio **`hash.atikodigital.cl`**.
2. CTA principal: **descargar la app** (`https://gastos.atikodigital.cl/panel/HashIA.apk`) + secundario **WhatsApp**.
3. KALY en el hero: **voz + chips de sugerencia + muestra tarjetas de features** + texto en pantalla de lo que dice.
4. Orbe **azul celeste** (cian tipo Mark XXXIX) que combine con el dark.
5. El hero debe **parecer una IA de verdad, estilo J.A.R.V.I.S.** (HUD completo).
6. Segunda página en adelante: secciones normales construidas con el **MCP de 21st.dev (magic)**; Claude elige los componentes/hero.

## Arquitectura

```
hash.atikodigital.cl  (Caddy → static dist/ de landing/)
  └─ landing/ (Vite + React + Tailwind)          ← repo: HASH IA\landing
       ├─ Hero KALY (custom, JARVIS HUD + Gemini Live)
       └─ Secciones marketing (componentes 21st.dev magic)
atiko-agent (backend untracked, ya en el VPS)
  └─ GET /api/public/kaly-token  (público, rate-limit IP, CORS hash.atikodigital.cl)
       → createEphemeralToken({ apiKey: GEMINI_API_KEY })  → { token, model, expireAt }
Gemini Live (wss BidiGenerateContent v1alpha)  ← el navegador conecta con el token efímero
```

### Stack
- **Vite + React 18 + TailwindCSS** en `HASH IA\landing` (web pura). Sin Capacitor.
- Build estático (`vite build` → `dist/`). Deploy con `HASH IA\deploy-landing-wt.js` (sube `dist/` al VPS por SFTP, análogo a `upload-apk-wt.js`); Caddyfile añade el bloque `hash.atikodigital.cl`.
- Tests: Jest + React Testing Library (acotado, ver Testing).

## Componentes

### A. Seguridad del token — endpoint público (en atiko-agent)
- `GET /api/public/kaly-token`:
  - **Rate-limit por IP** en memoria (p.ej. 20 req / 10 min / IP) → 429 si excede.
  - **CORS** restringido a `https://hash.atikodigital.cl` (y `http://localhost:5173` en dev).
  - Llama `createEphemeralToken({ apiKey: process.env.GEMINI_API_KEY })` y devuelve `{ token, model, expireAt }`. **Nunca** expone la API key.
  - Si Gemini falla → 502; el front cae a modo texto.
- El endpoint vive en el backend del agente (untracked). Documentar el snippet en el plan para que el usuario lo pegue/active (no commiteamos el agente).

### B. KALY web (hero) — `landing/src/kaly/`
- `live.js`: port del `openLiveSession` de la app (WS, mic PCM, player, `setMuted`, transcripciones). Mismo protocolo; se le pasa el token del endpoint público.
- `prompt.js`: **prompt de sistema NUEVO de ventas**. KALY = vendedora experta de Hash IA, cálida y chilena (modismos suaves, trato de "usted"), concisa (1-3 frases). Sabe: qué es Hash IA, las 2 familias, las features clave, los planes por shots, y SIEMPRE empuja a **descargar la app** o **escribir por WhatsApp**. Pitch de apertura al iniciar: se presenta ("Hola, soy KALY, la inteligencia artificial de Hash IA…"), dice en una frase qué hace Hash IA y pregunta en qué ayudar / ofrece contar las características. Voz: una voz prebuilt cálida de Gemini Live (probar p.ej. `Aoede`/`Kore`) + `languageCode es-US` (no hay voz "chilena" nativa; el acento/modismo se logra por prompt).
- **Tools (function calling de Gemini Live)** ejecutadas en el cliente:
  - `mostrar_features({ familia? })` → renderiza tarjetas de features en el hero (Finanzas/Ventas o todas).
  - `mostrar_planes()` → resalta/scrollea a la sección de planes.
  - `descargar_app()` → dispara el CTA de descarga.
  - `abrir_whatsapp()` → abre el WhatsApp de Atiko.
  (Patrón idéntico a `kaly/tools.js`: declaraciones + `executeTool` → la UI reacciona.)
- Estado y subtítulos: muestra en pantalla lo que KALY dice (`outputAudioTranscription`) y un indicador de estado.

### C. Orbe HUD J.A.R.V.I.S. — `landing/src/kaly/Orb.jsx` (canvas)
Componente canvas que replica el lenguaje de Mark XXXIX, en **celeste** (`#19C3FF`/`#00d4ff` primario sobre fondo `#00060a`), con toques de **dorado Hash `#C9A24B`** para CTAs/marca:
- Orbe central (KALY) con **halo que pulsa según el nivel de audio** (`onAudioLevel` in/out).
- **Anillos giratorios** (arcos segmentados), **escáner** (arco que barre), **tick marks**, **crosshair**, **corchetes de esquina**, **partículas** al hablar, **waveform** abajo.
- **Estado** tipo HUD con tipografía monoespaciada: `ESCUCHANDO` / `HABLANDO` / `PENSANDO` / `EN SILENCIO`.
- Lecturas decorativas estilo "sistema" (p.ej. `IA · ONLINE`, `GEMINI LIVE`, `ES-CL`) para reforzar el feel de IA — decorativas, no métricas reales.
- Reacciona a: iniciar/cerrar sesión, hablar, mute.
- Responsive: en móvil el orbe se reduce y los chips se apilan.

### D. Hero (layout) — `landing/src/sections/Hero.jsx`
- Fondo dark con grid sutil de puntos (como Mark XXXIX). Orbe al centro.
- Titular corto + subtítulo (ej. "La IA que le lleva las cuentas y las ventas a tu pyme").
- **Chips** de sugerencia: "¿Qué es Hash IA?", "¿Cuánto cuesta?", "¿Sirve para mi negocio?", "Muéstrame las características" (al tocarlos, se envían como texto a KALY vía `sendText`).
- Botón micrófono / silenciar. Subtítulos de KALY en vivo.
- **Tarjetas de features** que aparecen cuando KALY llama `mostrar_features`.
- CTAs visibles: **Descargar app** (dorado) + **WhatsApp**.
- Fallback: si no hay permiso de micrófono o el token falla → muestra "Escríbele a KALY" (input de texto) y un aviso; nada bloquea el resto del sitio.

### E. Secciones marketing (2+) — construidas con el MCP de 21st.dev (magic)
Claude elige los componentes (`mcp__magic__21st_magic_component_builder`):
1. **Dos familias**: Finanzas (gastos/Match/KALY) y Ventas (Chat/catálogo/pedidos).
2. **Cómo funciona**: 3-4 pasos (saca foto o habla → la IA registra/contabiliza → ves reportes / armas pedidos).
3. **Features**: OCR de facturas, conciliación SII/cartola (Match), catálogo por voz y foto, pedidos + PDF + delivery, recordatorios/WhatsApp.
4. **Planes por shots**: Free 30 ($0) · Básico 100 ($9.900) · **Pyme 250 ($24.900, estrella)** · Empresa 800 ($49.900). 1 shot = 1 imagen interpretada por la IA.
5. **CTA final**: Descargar app + WhatsApp.
6. **Footer**: Atiko Digital.
Responsive en todas.

## Data flow
1. Visitante entra → front pide `GET /api/public/kaly-token` → recibe token efímero.
2. Toca el orbe (o un chip) → `openLiveSession` abre el WS a Gemini Live con el token.
3. Habla / los chips mandan texto → KALY responde por voz + texto; si llama una tool, la UI reacciona (tarjetas, scroll, CTA).
4. CTAs llevan a la APK o a WhatsApp.

## Manejo de errores
- Token 429/502 o sin micrófono → modo solo-texto + aviso; secciones y CTAs intactas.
- WS cae → reintento suave 1 vez; si no, modo texto.
- Sin autoplay de audio (políticas del navegador): el audio arranca recién tras el gesto del usuario (tocar el orbe) — por eso el inicio es **click-to-start**.

## Testing (acotado, es mayormente presentacional)
- `kaly/token.js`: pide el token, maneja 429/502 (mock fetch).
- `kaly/tools.js`: `executeTool` para `mostrar_features`/`mostrar_planes`/`descargar_app`/`abrir_whatsapp` (mock de callbacks de UI).
- Smoke test de render del `Hero` (RTL): aparece el titular, los chips y los CTAs; el orbe monta sin reventar (canvas mockeado).
- El detalle visual (orbe/animación) se valida con `vite build` + revisión en el navegador.

## Decomposición del plan (un proyecto, fases)
1. Scaffold Vite+React+Tailwind en `HASH IA\landing` + `deploy-landing-wt.js` + bloque Caddy `hash.atikodigital.cl`.
2. Endpoint público `GET /api/public/kaly-token` (rate-limit + CORS) en el agente (snippet para activar).
3. KALY web: `live.js` (port) + `prompt.js` (ventas) + `tools.js` + `token.js`.
4. Orbe HUD JARVIS (`Orb.jsx`, canvas) + `Hero.jsx` (chips, subtítulos, tarjetas, CTAs, fallback texto).
5. Secciones marketing con el MCP de 21st.dev (familias, cómo funciona, features, planes, CTA, footer) + responsive.
6. Tests acotados + build + deploy a `hash.atikodigital.cl`.

## Fuera de v1
- Registro/alta o "prueba gratis" con backend (el CTA es descargar/WhatsApp).
- Multi-idioma.
- KALY controlando scroll/animaciones complejas más allá de las 4 tools.
- Analítica avanzada (se puede sumar un pixel después).

## Siguiente paso
Aprobar → `writing-plans`. El agente backend es untracked: su endpoint se entrega como snippet para que el usuario lo active; el resto (landing) se commitea en el repo `HASH IA`.
