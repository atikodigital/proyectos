# Diseño — Fase 2 · Motor de Reels Faceless

**Fecha:** 2026-06-10
**Estado:** Diseño aprobado (pendiente plan de implementación)
**Proyecto:** atiko-agent · redes sociales (Fase 2)
**Depende de:** nada en código (la integración con el Publicador de Fase 1 es vía orquestación, no acoplamiento)

---

## 1. Objetivo

Dado un **tema corto** (string), generar de forma autónoma un **reel faceless 9:16** listo para publicar: guion por escenas, locución IA, imágenes IA, subtítulos por frase y montaje en video, devolviendo un **MP4 + metadata** (caption + hashtags).

## 2. Decisiones tomadas (brainstorming)

- **Tipo de video:** faceless — texto en pantalla + imágenes IA + voz en off (no avatar, no video IA generativo). Lo más factible y barato; encaja con el modelo NIMED.
- **Entrada:** un **tema/idea corta**. Gemini genera todo lo demás (máxima autonomía).
- **Subtítulos v1:** **por frase/escena** (no karaoke palabra-a-palabra todavía; se mejora después).
- **Composición:** **Remotion** (React) — coherente con el stack JS, programático, propio (vs FFmpeg crudo o APIs externas de pago).
- **Modelos (híbrido con Gemini protagonista):** guion = Gemini Flash; imágenes = Gemini (Nano Banana / Imagen); voz = Gemini TTS por defecto, ElevenLabs como premium opcional.

## 3. Arquitectura y flujo

```
TEMA (string)
  │  1) script-generator (Gemini Flash) → reel-spec (JSON)
  ▼
reel-spec = {
  title, caption, hashtags,
  scenes: [ { text, voiceLine, imagePrompt }, ... ]   // 4-7 escenas típicas
}
  │
  ├──────────────┬───────────────────┐   (assets en paralelo por escena)
  ▼ 2) voice      ▼ 3) images          │
  TTS por escena  imagen 9:16 por       │
  → {audioPath,   escena → imagePath    │
     durationMs}                        │
  └──────────────┴───────────────────┘
  │  4) reel-engine ensambla props de Remotion (escenas con assets+duración)
  ▼
  Remotion render (<Reel> composition) → MP4 9:16
  │  5) MP4 escrito en dir público servido por el agente → URL pública
  ▼
  Resultado: { mp4Path, publicUrl, caption, hashtags, reelSpec }
```

La duración de cada escena = duración del audio de su locución (+ pequeño padding). Así el video queda sincronizado con la voz sin karaoke.

## 4. Unidades (archivos enfocados, una responsabilidad cada uno)

```
agent/
├── services/reels/
│   ├── script-generator.js   ← createScriptGenerator({ gemini }) → generate(topic) -> reelSpec
│   ├── voice.js              ← createVoiceProvider({ tts, measureDuration }) → synthesize(text) -> {audioPath, durationMs}
│   ├── images.js             ← createImageProvider({ gen }) → generate(prompt) -> imagePath
│   ├── reel-engine.js        ← createReelEngine({ scriptGenerator, voice, images, render }) → generate(topic) -> result
│   └── reel-spec.schema.js   ← JSON schema + validación del reel-spec
├── remotion/
│   ├── Root.jsx              ← registerRoot + composición "Reel"
│   ├── Reel.jsx              ← <Reel scenes=[...] /> (imagen con zoom + texto/subtítulo + audio)
│   └── render.js             ← renderReel(props, outPath) usando @remotion/renderer
└── routes/reels.js           ← POST /api/reels/generate  body: { topic, clientId? }
```

**Interfaces (inyección de dependencias, igual que Fase 1):**
- `script-generator`: recibe un cliente Gemini inyectado; valida la salida contra `reel-spec.schema`.
- `voice`: recibe un `tts` (que devuelve audio) y un `measureDuration` (ffprobe/lib) inyectables.
- `images`: recibe un generador de imágenes inyectable.
- `reel-engine`: recibe los 3 anteriores + una función `render` inyectable → orquesta y devuelve el resultado.

Esto permite **testear toda la lógica sin red ni render real** (proveedores mockeados); el render Remotion real es un paso de integración aparte.

## 5. reel-spec (contrato de datos)

```json
{
  "title": "5 errores al vender por WhatsApp",
  "caption": "¿Cometes alguno? 👇 #ventas #pymechile",
  "hashtags": ["ventas", "whatsapp", "pyme"],
  "scenes": [
    { "text": "Error #1: tardar en responder", "voiceLine": "El primer error es tardar horas en responder.", "imagePrompt": "vertical 9:16, persona mirando el teléfono frustrada, estilo moderno" }
  ]
}
```

- 4-7 escenas. `text` = lo que aparece en pantalla (subtítulo/hook de la escena). `voiceLine` = lo que dice la voz (puede coincidir o ampliar el text). `imagePrompt` = prompt 9:16 para la imagen de fondo.

## 6. Salida y entrega

- MP4 9:16 (1080×1920) escrito en un directorio público servido por el agente (p.ej. `agent/public/reels/<uuid>.mp4` → `https://agent.atikodigital.cl/widget/reels/<uuid>.mp4` o ruta estática equivalente).
- La **URL pública** es lo que el Publicador (Fase 1) necesita para publicar el Reel en IG. La Fase 2 NO publica — devuelve el MP4 + metadata; el agente orquesta ambas fases.

## 7. Manejo de errores

- Si Gemini devuelve un reel-spec inválido (no cumple schema) → reintento 1 vez con instrucción de corrección; si vuelve a fallar → error claro.
- Si falla la generación de una imagen → usar un fondo de color sólido de marca como fallback (no bloquear el reel completo).
- Si falla el TTS de una escena → error (la voz es esencial); reportar qué escena falló.
- El render Remotion se ejecuta con timeout; si falla, se conserva el reel-spec y los assets para reintentar el render sin regenerar todo.

## 8. Testing

- `script-generator`: con Gemini mockeado, verifica que valida el schema y reintenta ante salida inválida.
- `voice`: con tts + measureDuration mockeados, verifica que devuelve `{audioPath, durationMs}`.
- `images`: con generador mockeado, verifica rutas y el fallback ante error.
- `reel-engine`: con los 3 proveedores + render mockeados, verifica el orquestado (paralelismo de assets, ensamblado de props, propagación de errores).
- `reel-spec.schema`: casos válidos e inválidos.
- Render Remotion real: prueba de integración manual (genera un MP4 de muestra a partir de un reel-spec fijo).

## 9. Costes (recordatorio)

~$0.05–0.15 por reel (Gemini guion+voz+imágenes; render en VPS = $0). Remotion gratis si Atiko ≤3 empleados.

## 10. Fuera de alcance (fases siguientes)

- Subtítulos karaoke palabra-a-palabra (mejora de v1).
- Música de fondo (nice-to-have; se puede añadir como pista opcional en `<Reel>`).
- Avatares / video IA generativo.
- La capa de inteligencia (analizar virales para decidir el tema) — eso alimenta el `topic`, pero es otra fase.
- Publicación (Fase 1) y orquestación multi-cliente/aprobación (Fase 6).

## 11. Próximo paso

Plan de implementación detallado vía writing-plans, empezando por el contrato `reel-spec` + `script-generator`, luego voice/images, reel-engine, y por último la integración Remotion + ruta.
