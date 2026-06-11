# Fase 4b — Generador de Imágenes · Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline por lotes, elegido por José). Checkboxes para tracking.

**Goal:** `POST /api/posts/generate {topic, format}` genera post (1 img 4:5), carrusel (3-5 img 4:5) o story (1 img 9:16): Gemini escribe spec + imágenes limpias, Remotion Still dibuja el titular, PNGs públicos + caption + hashtags.

**Architecture:** `services/posts/` con DI/TDD (schema, script-generator, engine) + composición Remotion `PostImage` con `renderStill` + ruta. Bundle Remotion compartido con los reels.

**Tech Stack:** existente (Express, axios, Gemini providers, Remotion 4, node:test).

---

## Lote 1 — Núcleo TDD

### Task 1: post-spec-schema
- Create `agent/services/posts/post-spec-schema.js`: `validatePostSpec(spec, format)` → `{valid, errors}`. Reglas: caption string no vacío; hashtags array; slides array con headline+imagePrompt no vacíos; conteo: post=1, story=1, carousel=3..5; formato desconocido → error.
- Test `agent/tests/posts/post-spec-schema.test.js`: válido por formato; carrusel con 2 slides → inválido; post con 2 slides → inválido; slide sin headline → inválido; formato desconocido → inválido.
- Run `node --test tests/posts/post-spec-schema.test.js` (fail→impl→pass). Commit `feat(posts): post-spec schema`.

### Task 2: post-script-generator
- Create `agent/services/posts/post-script-generator.js`: `createPostScriptGenerator({ gemini })` → `generate(topic, format)`. Prompt en español pide SOLO JSON `{caption, hashtags, slides:[{headline, imagePrompt}]}` con el nº de slides según formato (post/story: 1; carousel: "entre 3 y 5 slides que cuenten una secuencia"); imagePrompt SIEMPRE "sin texto, sin letras" + orientación (4:5 o 9:16). Extract JSON (fences) + validatePostSpec + 1 reintento → throw (patrón de `script-generator.js` de reels).
- Test `agent/tests/posts/post-script-generator.test.js` (gemini mock): devuelve spec válido; pasa topic y la palabra del formato al prompt; pide "sin texto" en el prompt; retry una vez ante salida inválida; throw tras 2 inválidas.
- Run, commit `feat(posts): gemini post script generator`.

### Task 3: image-post-engine
- Create `agent/services/posts/image-post-engine.js`: `createImagePostEngine({ scriptGenerator, images, renderStill, slideConcurrency=2 })` → `generate(topic, format)`:
  spec → mapWithConcurrency slides → `images.generate(imagePrompt)` (provider Fase 2 con fallback) → `renderStill({ headline, imagePath, isFallback, fallbackColor, format }) -> pngPath` → return `{ caption, hashtags, imagePaths, postSpec }`. Reusar `mapWithConcurrency`: extraerlo a `agent/services/lib/concurrency.js` y que `reel-engine` lo importe de ahí (sin duplicar).
- Test `agent/tests/posts/image-post-engine.test.js` (mocks): orquesta y devuelve rutas en orden; pasa format al renderStill; fallback de imagen llega al renderStill; error de renderStill se propaga.
- Run + suite completa verde. Commit `feat(posts): image post engine + shared concurrency lib`.

## Lote 2 — Integración

### Task 4: Remotion PostImage + renderStill
- Create `agent/remotion/PostImage.jsx`: AbsoluteFill bg `fallbackColor||#0A1F3F`; `imageSrc` → `<Img staticFile cover>`; gradiente inferior; headline abajo (font Arial 900, ~72px post / ~84px story, blanco, sombra, mayúsculas). Export `postImageDimensions(format)` → {width:1080, height: format==="story"?1920:1350}.
- Modify `agent/remotion/Root.jsx`: añadir `<Composition id="PostImage" component={PostImage} width={1080} height={1350} durationInFrames={1} fps={30} defaultProps={{format:"post"}} calculateMetadata={({props}) => postImageDimensions(props.format)} />`.
- Modify `agent/remotion/render.js`: exportar `getBundle`.
- Create `agent/remotion/render-still.js`: `renderPostImage(inputProps, outPath)` — getBundle → stagear `inputProps.imagePath` al `public/` del bundle (`imageSrc`, cleanup en finally) → `selectComposition({id:"PostImage", inputProps})` → `renderStill({composition, serveUrl, output: outPath, inputProps})` → outPath.
- Verificar con script temporal `_still-test.js` (fallback color, sin red): renderiza PNG post y story, imprime tamaños, borrar después. Commit `feat(posts): remotion PostImage still renderer`.

### Task 5: ruta + server + docs
- Create `agent/routes/posts.js`: wiring real (gemini, createImageProvider({gen}), engine, renderStill→`public/posts/post-<hex>-<i>.png`); `POST /generate` valida topic+format∈{post,carousel,story} → `{ok, caption, hashtags, imageUrls:["/widget/posts/..."], postSpec}`; errores 500 con detail.
- Modify `agent/server.js`: `postsLimiter` (10/5min) + mount `/api/posts`.
- `.gitignore`: `agent/public/posts/`. `.env.example`: nada nuevo (usa GEMINI_API_KEY). README: sección "🖼️ Posts e historias (Fase 4b)" con tabla del endpoint y ejemplo curl.
- Verificar: route OK, server --check, suite completa. Commit `feat(posts): /api/posts/generate route + docs`.

### Task 6: demo real (con GEMINI_API_KEY)
- Generar 1 post real y 1 story real vía engine directo (script node), abrir PNGs para José. Sin commit (solo validación).

## Notas
- Carrusel se genera ya; publicarlo = 4c. Story → planificador la marca failed hasta 4c (ya cubierto).
- Tests nuevos esperados: ~14. Suite total esperada: ~87.
