# Diseño — Fase 3 · Avatares (HeyGen API; Veo como alternativa futura)

**Fecha:** 2026-06-10 (rev. 2: proveedor cambiado de Veo a HeyGen tras comparar coste/calidad)
**Estado:** Diseño aprobado (pendiente plan de implementación)
**Proyecto:** atiko-agent · redes sociales (Fase 3)
**Depende de:** Fase 2 (motor de reels) — extiende `services/reels/` y `remotion/` sin romper lo existente

---

## 1. Objetivo

Que los reels puedan incluir **escenas de avatar**: el dueño del negocio (José o sus clientes) "aparece" en video presentando el contenido **sin grabarse nunca**, generado por IA a partir de fotos. Formato **híbrido**: el avatar abre con el gancho y cierra con el CTA; las escenas del medio siguen siendo faceless (imágenes IA + voz en off).

## 2. Decisiones tomadas (brainstorming + revisión de costes)

- **Proveedor: HeyGen API** (pay-as-you-go desde $5, sin mensualidad). Elegido sobre Veo por: hecho exactamente para esto (foto → persona hablando con lip-sync), **identidad estable** (anima la foto real, misma cara siempre), **acepta nuestro audio** (mismo Gemini TTS en avatar y b-roll → voz consistente en todo el reel), y **~10-20x más barato** por segundo de avatar (~$0.50–1/min vs ~$9–24/min de Veo).
- **Veo 3.1 (misma API Gemini)** queda documentado como **alternativa futura** para tomas cinematográficas/creativas, no para talking-head v1.
- **Voz:** TODO el reel usa Gemini TTS (actual). Para las escenas avatar, el audio TTS se sube a HeyGen y el avatar lo habla con lip-sync → una sola voz coherente.
- **Formato: híbrido** — avatar en intro (gancho) y cierre (CTA), b-roll en medio. Minimiza segundos de avatar y es el formato viral típico.
- **Identidad:** 1+ fotos por persona → se crea un **photo avatar en HeyGen una vez** por cliente; su `heygenAvatarId` se guarda en el avatar profile.

## 3. Requisito legal (bloqueante de negocio, no de código)

Usar la cara de un cliente exige **autorización escrita** (cláusula de cesión de imagen en el contrato de Atiko), que debe cubrir además el **envío de sus fotos a un tercero (HeyGen)** para procesamiento. El sistema registra el consentimiento (flag + fecha) en el avatar profile y **se niega a generar** si no está marcado. Al publicar, etiquetar contenido generado por IA según la política de cada red.

## 4. Arquitectura

```
ONBOARDING (una vez por persona)
  cliente sube 1+ fotos + consentimiento firmado
   → se crea photo avatar en HeyGen (API) → heygenAvatarId
   → avatar_profiles (atiko-db): clientId, displayName, heygenAvatarId, consentSigned, consentDate
PIPELINE POR REEL (extiende Fase 2)
  1) script-generator: el guion marca scenes[].type = "avatar" | "broll"
     (primera y última = avatar si el cliente tiene perfil con consentimiento; si no, todo broll)
  2) assets por escena:
     - broll  → flujo actual (Gemini TTS + imagen Nano Banana)
     - avatar → Gemini TTS del voiceLine (igual que broll) → audio
                → avatar.js: HeyGen genera video del avatar hablando ESE audio
                → poll hasta completar → descarga clip MP4
  3) Remotion <Reel>: escena avatar = <OffthreadVideo> del clip (audio embebido);
     escena broll = lo actual (Img + Audio + texto)
  4) salida igual que Fase 2: MP4 + caption + hashtags en URL pública
```

## 5. Unidades de código

```
agent/
├── services/reels/
│   ├── avatar.js               ← createAvatarProvider({ heygen, voice }) → generate({ avatarId, voiceLine }) -> { videoPath, durationMs } | degradación
│   ├── heygen-provider.js      ← real: HeyGen API (upload audio, create video, poll status, download MP4) + createPhotoAvatar(photos)
│   ├── avatar-profiles.js      ← store de perfiles (memoria + Postgres), exige consentSigned
│   ├── reel-spec-schema.js     ← MODIFICAR: scenes[].type opcional ("avatar"|"broll", default "broll")
│   ├── script-generator.js     ← MODIFICAR: prompt pide type por escena cuando hay avatar disponible
│   └── reel-engine.js          ← MODIFICAR: enruta escena avatar→avatar provider / broll→flujo actual
├── remotion/Reel.jsx           ← MODIFICAR: escena avatar usa <OffthreadVideo src=staticFile(videoSrc)>
├── remotion/render.js          ← MODIFICAR: stageAssets también copia videoPath → videoSrc
├── migrations/002_avatar_profiles.sql
└── routes/reels.js             ← MODIFICAR: acepta clientId y usa su avatar profile si existe y tiene consentimiento
```

Interfaz inyectable (mismo patrón DI de Fases 1-2): `heygen` inyectado = `{ async generateVideo({ avatarId, audioPath }) -> videoPath, async createPhotoAvatar({ photoPaths, name }) -> avatarId }`. Tests del núcleo sin red (heygen mockeado); integración real con HEYGEN_API_KEY, como en Fase 2.

## 6. Contratos de datos

**reel-spec (extensión retrocompatible):**
```json
{ "scenes": [
  { "type": "avatar", "text": "¿Pierdes clientes por WhatsApp?", "voiceLine": "(lo que dice el avatar)", "imagePrompt": "(ignorado en avatar)" },
  { "type": "broll",  "text": "...", "voiceLine": "...", "imagePrompt": "..." }
] }
```
`type` ausente = "broll" (los reels actuales siguen funcionando sin cambios).

**avatar_profiles (atiko-db):** `id, client_id, display_name, heygen_avatar_id, consent_signed boolean, consent_date, created_at` — UNIQUE(client_id).

**Escena renderizada (props a Remotion):** broll = igual que Fase 2; avatar = `{ type:"avatar", text, videoPath→videoSrc, durationMs }` (sin audioPath aparte: el clip HeyGen trae el audio embebido).

## 7. Manejo de errores

- Avatar profile sin `consentSigned` → error claro ("falta autorización de imagen"), nunca genera.
- Falla HeyGen en una escena avatar → **degradación**: esa escena se convierte a broll (TTS + imagen del prompt o color de marca) y el reel se genera igual; se reporta en la respuesta (`degraded: true`).
- La generación HeyGen es asíncrona → poll con timeout (como el contenedor de IG en Fase 1); si excede, degradar.
- Duración del clip ≠ estimada → usar la duración real del MP4 para la Sequence.

## 8. Testing

- `avatar-profiles`: store memoria/PG, rechazo sin consentimiento.
- `avatar.js`: con heygen mockeado — éxito y degradación.
- `reel-spec-schema`: acepta type avatar/broll, default broll, rechaza types inválidos.
- `reel-engine`: enrutado por type, degradación avatar→broll, retrocompatibilidad (spec sin type).
- Integración real: crear photo avatar con foto de José + generar 1 clip + render híbrido completo (requiere HEYGEN_API_KEY pay-as-you-go; verificar precio/créditos en el primer uso).

## 9. Costes (estimado, verificar al crear la cuenta)

HeyGen ~$0.50–1/min de avatar → 16s por reel ≈ **$0.15–0.30** + ~$0.10 del resto ≈ **$0.25–0.45 por reel híbrido**. Entrada pay-as-you-go desde $5 sin mensualidad. (Con Veo habría sido $1.50–3.50.)

## 10. Fuera de alcance (futuro)

- Clonado de voz del cliente (ElevenLabs) — add-on premium.
- Veo para tomas cinematográficas del avatar (no talking-head).
- Avatar picture-in-picture u otros layouts.
- UI de onboarding de fotos (v1: por API/manual).

## 11. Próximo paso

Plan de implementación vía writing-plans: schema+profiles → avatar provider (mock) → engine híbrido → Remotion video scenes → heygen-provider real + integración.
