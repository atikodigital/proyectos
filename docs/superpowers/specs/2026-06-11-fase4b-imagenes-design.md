# Diseño — Fase 4b · Generador de Imágenes (post / carrusel / story)

**Fecha:** 2026-06-11
**Estado:** Diseño aprobado (pendiente plan)
**Proyecto:** atiko-agent · redes sociales (Fase 4b)
**Depende de:** Gemini providers (Fase 2: `gemini`, `gen`), Remotion (Fase 2), Planificador (Fase 4a — consume la salida).

## 1. Objetivo

Dado un tema + formato, generar piezas de **imagen** listas para el planificador: **post de feed** (1 imagen 4:5), **carrusel** (3-5 imágenes 4:5) e **historia** (1 imagen 9:16), con caption + hashtags. **Calidad:** la imagen la genera Gemini LIMPIA (sin texto) y el **titular se dibuja con código** (Remotion `<Still>`: tipografía perfecta, overlay, estilo de marca) — evita los errores tipográficos de los modelos de imagen.

## 2. Decisiones (brainstorming)

- v1 cubre los 3 formatos: `post` (1 slide), `carousel` (3-5 slides), `story` (1 slide 9:16).
- Titular **overlay con código** (no texto IA en imagen, no imagen sin texto).
- Carrusel/story se **generan** ya; su **publicación** llega en 4c (el planificador 4a ya los marca `failed` con mensaje claro si se programan antes).
- Dimensiones: post/carousel 1080×1350 (4:5); story 1080×1920 (9:16).

## 3. Arquitectura y contratos

```
topic + format → post-script-generator (Gemini Flash) → post-spec:
  { caption, hashtags, slides: [ { headline, imagePrompt } ] }   // post=1, carousel=3-5, story=1
→ por slide (concurrencia 2): gen imagen LIMPIA (Gemini) con fallback de color
→ renderStill (Remotion PostImage): imagen + titular overlay → PNG
→ public/posts/*.png → { caption, hashtags, imageUrls, postSpec }
→ se crean content items en el planificador (4a)
```

**Unidades:**
- `services/posts/post-spec-schema.js` — `validatePostSpec(spec, format)` (slides según formato; headline/imagePrompt requeridos).
- `services/posts/post-script-generator.js` — `createPostScriptGenerator({ gemini })` → `generate(topic, format)`; JSON + validación + 1 reintento (patrón Fase 2).
- `services/posts/image-post-engine.js` — `createImagePostEngine({ scriptGenerator, images, renderStill })` → `generate(topic, format)`; usa el image provider de Fase 2 (fallback de color) y `renderStill(slide, format) -> pngPath` inyectado.
- `remotion/PostImage.jsx` — composición `PostImage` (Img + gradiente + headline grande), dimensiones por `props.format` vía `calculateMetadata`.
- `remotion/render-still.js` — `renderPostImage(inputProps, outPath)` (bundle compartido con los reels + `renderStill` de @remotion/renderer; stagea la imagen al public del bundle).
- `routes/posts.js` — `POST /api/posts/generate { topic, format, clientId? }` → `{ caption, hashtags, imageUrls }`; PNGs servidos en `/widget/posts/`.

## 4. Errores / testing

- Spec inválido → 1 reintento → error claro (patrón Fase 2). Imagen fallida → slide con fondo de color de marca (no rompe la pieza). renderStill falla → error de esa pieza.
- TDD: schema (conteos por formato), script-generator (prompt por formato, retry), engine (orquestación, fallback, propagación) — sin red ni render. Integración: still real renderizado + ruta + demo.

## 5. Fuera de alcance

Publicar carrusel/story (4c), panel (4d), plantillas de marca por cliente (colores/fuentes custom — luego), texto IA dentro de la imagen.
