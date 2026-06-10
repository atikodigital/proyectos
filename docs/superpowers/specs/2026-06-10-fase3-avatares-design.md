# Diseño — Fase 3 · Avatares (Veo vía API Gemini)

**Fecha:** 2026-06-10
**Estado:** Diseño aprobado (pendiente plan de implementación)
**Proyecto:** atiko-agent · redes sociales (Fase 3)
**Depende de:** Fase 2 (motor de reels) — extiende `services/reels/` y `remotion/` sin romper lo existente

---

## 1. Objetivo

Que los reels puedan incluir **escenas de avatar**: el dueño del negocio (José o sus clientes) "aparece" en video presentando el contenido **sin grabarse nunca**, generado por IA a partir de fotos de referencia. Formato **híbrido**: el avatar abre con el gancho y cierra con el CTA; las escenas del medio siguen siendo faceless (imágenes IA + voz en off).

## 2. Decisiones tomadas (brainstorming)

- **Proveedor: Veo 3.1 vía la MISMA API de Gemini** (misma key/factura; sin HeyGen/D-ID ni GPU propia). Verificado: `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`, `veo-3.1-lite-generate-preview`; image-to-video con **audio nativo**; clips de **8s** cuando se usan imágenes de referencia.
- **Voz:** escenas b-roll = Gemini TTS (actual). Escenas avatar = **voz nativa de Veo** (el avatar habla el diálogo escrito en el prompt; lip-sync incluido). El clonado de voz (ElevenLabs) queda como add-on futuro.
- **Formato: híbrido** — avatar en intro (gancho) y cierre (CTA), b-roll en medio. Minimiza segundos de Veo (lo caro) y es el formato viral típico.
- **Identidad:** 1-3 fotos de referencia por persona ("avatar profile") para mantener consistencia entre clips.

## 3. Requisito legal (bloqueante de negocio, no de código)

Usar la cara (y eventualmente voz) de un cliente exige **autorización escrita** (cláusula de cesión de imagen en el contrato de servicio de Atiko). El sistema registra el consentimiento (flag + fecha) en el avatar profile y **se niega a generar** si no está marcado. Al publicar, etiquetar contenido generado por IA según la política de cada red.

## 4. Arquitectura

```
ONBOARDING (una vez por persona)
  cliente sube 1-3 fotos + consentimiento firmado
   → avatar_profiles (atiko-db): clientId, displayName, photoPaths[], consentSigned, consentDate
PIPELINE POR REEL (extiende Fase 2)
  1) script-generator: el guion marca scenes[].type = "avatar" | "broll"
     (primera y última = avatar si el cliente tiene perfil con consentimiento; si no, todo broll)
  2) assets por escena:
     - broll  → flujo actual (Gemini TTS + imagen Nano Banana)
     - avatar → avatar.js: Veo 3.1 (fotos de referencia + diálogo en el prompt)
                → clip MP4 8s con audio nativo
  3) Remotion <Reel>: escena avatar = <OffthreadVideo> del clip (con su audio);
     escena broll = lo actual (Img + Audio + texto)
  4) salida igual que Fase 2: MP4 + caption + hashtags en URL pública
```

## 5. Unidades de código

```
agent/
├── services/reels/
│   ├── avatar.js               ← createAvatarProvider({ veo }) → generate({ photoPaths, dialogue }) -> { videoPath, durationMs }
│   ├── veo-provider.js         ← real: Gemini API Veo 3.1 (submit + poll operación long-running + download)
│   ├── avatar-profiles.js      ← store de perfiles (memoria + Postgres), exige consentSigned
│   ├── reel-spec-schema.js     ← MODIFICAR: scenes[].type opcional ("avatar"|"broll", default "broll")
│   ├── script-generator.js     ← MODIFICAR: prompt pide type por escena cuando hay avatar disponible
│   └── reel-engine.js          ← MODIFICAR: enruta escena avatar→avatar provider / broll→flujo actual
├── remotion/Reel.jsx           ← MODIFICAR: escena avatar usa <OffthreadVideo src=staticFile(videoSrc)>
├── remotion/render.js          ← MODIFICAR: stageAssets también copia videoPath → videoSrc
├── migrations/002_avatar_profiles.sql
└── routes/reels.js             ← MODIFICAR: acepta clientId y usa su avatar profile si existe y tiene consentimiento
```

Interfaz inyectable (mismo patrón DI de Fases 1-2): `veo` inyectado = `async ({ photoPaths, prompt }) -> videoPath`. Tests del núcleo sin red (veo mockeado); integración real con la key, como en Fase 2.

## 6. Contratos de datos

**reel-spec (extensión retrocompatible):**
```json
{ "scenes": [
  { "type": "avatar", "text": "¿Pierdes clientes por WhatsApp?", "voiceLine": "(diálogo que dice el avatar)", "imagePrompt": "(ignorado en avatar)" },
  { "type": "broll",  "text": "...", "voiceLine": "...", "imagePrompt": "..." }
] }
```
`type` ausente = "broll" (los reels actuales siguen funcionando sin cambios).

**avatar_profiles (atiko-db):** `id, client_id, display_name, photo_paths jsonb, consent_signed boolean, consent_date, created_at` — UNIQUE(client_id).

**Escena renderizada (props a Remotion):** broll = igual que Fase 2; avatar = `{ type:"avatar", text, videoPath→videoSrc, durationMs }` (sin audioPath: el clip Veo trae el audio embebido).

## 7. Manejo de errores

- Avatar profile sin `consentSigned` → error claro ("falta autorización de imagen"), nunca genera.
- Falla Veo en una escena avatar → **degradación**: esa escena se convierte a broll (TTS + imagen del prompt o color de marca) y el reel se genera igual; se reporta en la respuesta (`degraded: true`).
- Operación Veo es long-running → poll con timeout (como el contenedor de IG en Fase 1); si excede, degradar.
- Duración del clip Veo ≠ duración estimada → usar la duración real del MP4 para la Sequence.

## 8. Testing

- `avatar-profiles`: store memoria/PG, rechazo sin consentimiento.
- `avatar.js`: con veo mockeado — éxito y degradación.
- `reel-spec-schema`: acepta type avatar/broll, default broll, rechaza types inválidos.
- `reel-engine`: enrutado por type, degradación avatar→broll, retrocompatibilidad (spec sin type).
- Integración real: generar 1 clip Veo con foto de José + render híbrido completo (requiere GEMINI_API_KEY con acceso a Veo; verificar precio por segundo en el primer uso).

## 9. Costes (estimado, verificar con la key)

Veo 3.1 fast ≈ $0.10–0.40/segundo → 2 clips de 8s ≈ **$1.50–3.50 por reel híbrido** (+$0.10 del resto). Sigue siendo margen alto sobre tarifa de agencia ($200-500/mes/cliente). Usar `veo-3.1-fast` por defecto; `lite`/standard configurables.

## 10. Fuera de alcance (futuro)

- Clonado de voz del cliente (ElevenLabs) — add-on premium.
- Avatar en picture-in-picture u otros layouts.
- UI de onboarding de fotos (v1: se cargan por API/manual).
- Self-hosted (SadTalker/Hallo) si el volumen justifica GPU propia.

## 11. Próximo paso

Plan de implementación vía writing-plans: schema+profiles → avatar provider (mock) → engine híbrido → Remotion video scenes → veo-provider real + integración.
