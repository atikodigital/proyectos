# Fase 2 — Motor de Reels Faceless · Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `atiko-agent` convierta un tema corto en un reel faceless 9:16 (MP4 + caption + hashtags): Gemini genera el guion por escenas, voz IA + imágenes IA por escena, y Remotion monta el video.

**Architecture:** Módulo `services/reels/` con unidades de una responsabilidad e inyección de dependencias (igual que Fase 1), testeables sin red ni render. Proyecto Remotion aparte (`agent/remotion/`) para la composición. El `reel-engine` orquesta y recibe una función `render` inyectable.

**Tech Stack:** Node 20 + Express (existente), `axios` (existente, para Gemini REST), Remotion 4.x (`remotion`, `@remotion/bundler`, `@remotion/renderer`) + React 18, test runner nativo `node:test`.

---

## Estructura de archivos

```
agent/
├── services/reels/
│   ├── reel-spec-schema.js     ← validateReelSpec(spec) -> { valid, errors }
│   ├── script-generator.js     ← createScriptGenerator({ gemini }) -> { generate(topic) }
│   ├── voice.js                ← createVoiceProvider({ tts, measureDuration }) -> { synthesize(text) }
│   ├── images.js               ← createImageProvider({ gen, fallbackColor }) -> { generate(prompt) }
│   └── reel-engine.js          ← createReelEngine({ scriptGenerator, voice, images, render }) -> { generate(topic) }
├── remotion/
│   ├── index.js                ← registerRoot(Root)
│   ├── Root.jsx                ← <Composition id="Reel" ... />
│   ├── Reel.jsx                ← <Reel scenes title /> (imagen+zoom, texto, audio)
│   └── render.js               ← renderReel(inputProps, outPath) (bundle + renderMedia)
├── routes/reels.js             ← POST /api/reels/generate (wiring real)
└── tests/reels/
    ├── reel-spec-schema.test.js
    ├── script-generator.test.js
    ├── voice.test.js
    ├── images.test.js
    └── reel-engine.test.js
```

**Contratos compartidos (usados por todas las tareas):**
- **reelSpec**: `{ title:string, caption:string, hashtags:string[], scenes: Array<{ text:string, voiceLine:string, imagePrompt:string }> }`
- **gemini** inyectado: objeto con `async generateText(prompt:string) -> string` (texto del modelo).
- **tts** inyectado: `async (text:string) -> audioPath:string` (escribe el audio, devuelve la ruta).
- **measureDuration** inyectado: `async (audioPath:string) -> durationMs:number`.
- **gen** (imágenes) inyectado: `async (prompt:string) -> imagePath:string`.
- **render** inyectado: `async (input:{ title:string, scenes: Array<{ text, imagePath, isFallback, fallbackColor, audioPath, durationMs }> }) -> mp4Path:string`.
- Tests con `const { test } = require("node:test"); const assert = require("node:assert");`, ejecutados con `cd agent && node --test tests/reels/<archivo>`.

---

## Task 0: Dependencias y carpetas

**Files:**
- Modify: `agent/package.json`

- [ ] **Step 1: Añadir dependencias de Remotion + React**

En `agent/package.json` añade a `"dependencies"` (mantén las existentes):

```json
"@remotion/bundler": "^4.0.0",
"@remotion/renderer": "^4.0.0",
"react": "^18.3.1",
"react-dom": "^18.3.1",
"remotion": "^4.0.0"
```

- [ ] **Step 2: Instalar**

Run: `cd agent && npm install`
Expected: instala sin errores (Remotion puede descargar un Chromium la primera vez que se renderice, no en install).

- [ ] **Step 3: Commit**

```bash
git add agent/package.json agent/package-lock.json
git commit -m "chore(reels): add remotion + react deps"
```

---

## Task 1: Schema del reel-spec

**Files:**
- Create: `agent/services/reels/reel-spec-schema.js`
- Test: `agent/tests/reels/reel-spec-schema.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/reels/reel-spec-schema.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { validateReelSpec } = require("../../services/reels/reel-spec-schema");

const valid = {
  title: "5 errores al vender por WhatsApp",
  caption: "¿Cometes alguno? 👇",
  hashtags: ["ventas", "whatsapp"],
  scenes: [
    { text: "Error #1", voiceLine: "El primero es tardar.", imagePrompt: "persona con teléfono 9:16" },
  ],
};

test("accepts a valid reel spec", () => {
  const r = validateReelSpec(valid);
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, []);
});

test("rejects missing title", () => {
  const r = validateReelSpec({ ...valid, title: undefined });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("title")));
});

test("rejects empty scenes array", () => {
  const r = validateReelSpec({ ...valid, scenes: [] });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("scenes")));
});

test("rejects a scene missing imagePrompt", () => {
  const r = validateReelSpec({ ...valid, scenes: [{ text: "t", voiceLine: "v" }] });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("imagePrompt")));
});

test("rejects non-array hashtags", () => {
  const r = validateReelSpec({ ...valid, hashtags: "ventas" });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("hashtags")));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/reels/reel-spec-schema.test.js`
Expected: FAIL — `Cannot find module '../../services/reels/reel-spec-schema'`.

- [ ] **Step 3: Write minimal implementation**

```js
// agent/services/reels/reel-spec-schema.js
function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function validateReelSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== "object") {
    return { valid: false, errors: ["reelSpec debe ser un objeto"] };
  }
  if (!isNonEmptyString(spec.title)) errors.push("title es requerido (string)");
  if (!isNonEmptyString(spec.caption)) errors.push("caption es requerido (string)");
  if (!Array.isArray(spec.hashtags)) errors.push("hashtags debe ser un array");
  if (!Array.isArray(spec.scenes) || spec.scenes.length === 0) {
    errors.push("scenes debe ser un array con al menos 1 escena");
  } else {
    spec.scenes.forEach((s, i) => {
      if (!isNonEmptyString(s && s.text)) errors.push("scene[" + i + "].text es requerido");
      if (!isNonEmptyString(s && s.voiceLine)) errors.push("scene[" + i + "].voiceLine es requerido");
      if (!isNonEmptyString(s && s.imagePrompt)) errors.push("scene[" + i + "].imagePrompt es requerido");
    });
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { validateReelSpec };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/reels/reel-spec-schema.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/services/reels/reel-spec-schema.js agent/tests/reels/reel-spec-schema.test.js
git commit -m "feat(reels): reel-spec schema validation"
```

---

## Task 2: Script generator (Gemini → reel-spec)

**Files:**
- Create: `agent/services/reels/script-generator.js`
- Test: `agent/tests/reels/script-generator.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/reels/script-generator.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { createScriptGenerator } = require("../../services/reels/script-generator");

const goodSpec = {
  title: "Tema",
  caption: "cap",
  hashtags: ["a"],
  scenes: [{ text: "t", voiceLine: "v", imagePrompt: "p" }],
};

test("generate returns a validated reel spec parsed from gemini JSON", async () => {
  const gemini = { async generateText() { return JSON.stringify(goodSpec); } };
  const gen = createScriptGenerator({ gemini });
  const spec = await gen.generate("mi tema");
  assert.deepEqual(spec, goodSpec);
});

test("generate strips ```json fences before parsing", async () => {
  const gemini = { async generateText() { return "```json\n" + JSON.stringify(goodSpec) + "\n```"; } };
  const gen = createScriptGenerator({ gemini });
  const spec = await gen.generate("x");
  assert.equal(spec.title, "Tema");
});

test("generate passes the topic into the prompt", async () => {
  let seenPrompt = "";
  const gemini = { async generateText(p) { seenPrompt = p; return JSON.stringify(goodSpec); } };
  await createScriptGenerator({ gemini }).generate("vender por whatsapp");
  assert.match(seenPrompt, /vender por whatsapp/);
});

test("generate retries once when first output is invalid, then succeeds", async () => {
  let calls = 0;
  const gemini = {
    async generateText() {
      calls++;
      return calls === 1 ? "no soy json" : JSON.stringify(goodSpec);
    },
  };
  const spec = await createScriptGenerator({ gemini }).generate("x");
  assert.equal(calls, 2);
  assert.equal(spec.title, "Tema");
});

test("generate throws after two invalid outputs", async () => {
  const gemini = { async generateText() { return "{ invalido }"; } };
  await assert.rejects(() => createScriptGenerator({ gemini }).generate("x"), /reel-spec inválido/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/reels/script-generator.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// agent/services/reels/script-generator.js
const { validateReelSpec } = require("./reel-spec-schema");

function buildPrompt(topic) {
  return [
    "Eres un guionista de reels virales en español para una pyme.",
    "Dado un TEMA, devuelve SOLO un JSON (sin texto extra) con esta forma exacta:",
    '{ "title": string, "caption": string, "hashtags": string[], "scenes": [ { "text": string, "voiceLine": string, "imagePrompt": string } ] }',
    "Reglas: 4-7 escenas; `text` = frase corta en pantalla (gancho/idea); `voiceLine` = lo que dice la voz en off;",
    "`imagePrompt` = descripción para generar una imagen vertical 9:16 de fondo. caption con 1-2 emojis. 3-6 hashtags sin #.",
    "",
    "TEMA: " + topic,
  ].join("\n");
}

function extractJson(text) {
  let t = String(text).trim();
  // quitar fences ```json ... ``` o ``` ... ```
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  return JSON.parse(t);
}

function createScriptGenerator({ gemini }) {
  async function attempt(topic, extraInstruction) {
    const prompt = buildPrompt(topic) + (extraInstruction ? "\n\n" + extraInstruction : "");
    const raw = await gemini.generateText(prompt);
    let spec;
    try {
      spec = extractJson(raw);
    } catch (e) {
      return { ok: false, reason: "no se pudo parsear JSON" };
    }
    const v = validateReelSpec(spec);
    if (!v.valid) return { ok: false, reason: v.errors.join("; ") };
    return { ok: true, spec };
  }

  async function generate(topic) {
    let r = await attempt(topic);
    if (r.ok) return r.spec;
    r = await attempt(topic, "Tu respuesta anterior fue inválida (" + r.reason + "). Devuelve SOLO el JSON válido pedido.");
    if (r.ok) return r.spec;
    throw new Error("reel-spec inválido tras 2 intentos: " + r.reason);
  }

  return { generate };
}

module.exports = { createScriptGenerator };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/reels/script-generator.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/services/reels/script-generator.js agent/tests/reels/script-generator.test.js
git commit -m "feat(reels): gemini script generator -> validated reel-spec"
```

---

## Task 3: Voice provider (TTS + duración)

**Files:**
- Create: `agent/services/reels/voice.js`
- Test: `agent/tests/reels/voice.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/reels/voice.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { createVoiceProvider } = require("../../services/reels/voice");

test("synthesize returns audioPath and durationMs", async () => {
  const calls = [];
  const tts = async (text) => { calls.push(text); return "/tmp/audio-1.wav"; };
  const measureDuration = async (path) => { assert.equal(path, "/tmp/audio-1.wav"); return 3200; };
  const voice = createVoiceProvider({ tts, measureDuration });
  const res = await voice.synthesize("hola mundo");
  assert.equal(res.audioPath, "/tmp/audio-1.wav");
  assert.equal(res.durationMs, 3200);
  assert.deepEqual(calls, ["hola mundo"]);
});

test("synthesize propagates tts errors", async () => {
  const tts = async () => { throw new Error("tts caído"); };
  const measureDuration = async () => 0;
  const voice = createVoiceProvider({ tts, measureDuration });
  await assert.rejects(() => voice.synthesize("x"), /tts caído/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/reels/voice.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// agent/services/reels/voice.js
// tts(text) -> audioPath ; measureDuration(audioPath) -> durationMs. Ambos inyectados.
function createVoiceProvider({ tts, measureDuration }) {
  async function synthesize(text) {
    const audioPath = await tts(text);
    const durationMs = await measureDuration(audioPath);
    return { audioPath, durationMs };
  }
  return { synthesize };
}

module.exports = { createVoiceProvider };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/reels/voice.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/services/reels/voice.js agent/tests/reels/voice.test.js
git commit -m "feat(reels): voice provider (tts + duration)"
```

---

## Task 4: Image provider (con fallback)

**Files:**
- Create: `agent/services/reels/images.js`
- Test: `agent/tests/reels/images.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/reels/images.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { createImageProvider } = require("../../services/reels/images");

test("generate returns imagePath on success", async () => {
  const gen = async (prompt) => { assert.equal(prompt, "un gato"); return "/tmp/img-1.png"; };
  const images = createImageProvider({ gen, fallbackColor: "#0A1F3F" });
  const res = await images.generate("un gato");
  assert.equal(res.imagePath, "/tmp/img-1.png");
  assert.equal(res.isFallback, false);
});

test("generate returns fallback when gen throws (no rompe el reel)", async () => {
  const gen = async () => { throw new Error("imagen caída"); };
  const images = createImageProvider({ gen, fallbackColor: "#0A1F3F" });
  const res = await images.generate("x");
  assert.equal(res.imagePath, null);
  assert.equal(res.isFallback, true);
  assert.equal(res.fallbackColor, "#0A1F3F");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/reels/images.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// agent/services/reels/images.js
const DEFAULT_FALLBACK = "#0A1F3F";

// gen(prompt) -> imagePath. Si falla, devuelve fallback (color sólido) en vez de romper.
function createImageProvider({ gen, fallbackColor = DEFAULT_FALLBACK }) {
  async function generate(prompt) {
    try {
      const imagePath = await gen(prompt);
      return { imagePath, isFallback: false };
    } catch (e) {
      return { imagePath: null, isFallback: true, fallbackColor };
    }
  }
  return { generate };
}

module.exports = { createImageProvider };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/reels/images.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/services/reels/images.js agent/tests/reels/images.test.js
git commit -m "feat(reels): image provider with solid-color fallback"
```

---

## Task 5: Reel engine (orquestador)

**Files:**
- Create: `agent/services/reels/reel-engine.js`
- Test: `agent/tests/reels/reel-engine.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/reels/reel-engine.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { createReelEngine } = require("../../services/reels/reel-engine");

function fixtures() {
  const spec = {
    title: "T", caption: "cap", hashtags: ["a"],
    scenes: [
      { text: "uno", voiceLine: "voz uno", imagePrompt: "img uno" },
      { text: "dos", voiceLine: "voz dos", imagePrompt: "img dos" },
    ],
  };
  const scriptGenerator = { async generate() { return spec; } };
  const voice = {
    async synthesize(text) { return { audioPath: "/a/" + text + ".wav", durationMs: text.length * 100 }; },
  };
  const images = {
    async generate(prompt) { return { imagePath: "/i/" + prompt + ".png", isFallback: false }; },
  };
  let renderInput = null;
  const render = async (input) => { renderInput = input; return "/out/reel.mp4"; };
  return { spec, scriptGenerator, voice, images, render, getRenderInput: () => renderInput };
}

test("generate orchestrates script -> assets -> render and returns result", async () => {
  const f = fixtures();
  const engine = createReelEngine(f);
  const res = await engine.generate("mi tema");

  assert.equal(res.mp4Path, "/out/reel.mp4");
  assert.equal(res.caption, "cap");
  assert.deepEqual(res.hashtags, ["a"]);
  assert.equal(res.reelSpec.title, "T");

  const input = f.getRenderInput();
  assert.equal(input.title, "T");
  assert.equal(input.scenes.length, 2);
  // escena 0 lleva el text en pantalla + assets + duración de su voz
  assert.equal(input.scenes[0].text, "uno");
  assert.equal(input.scenes[0].audioPath, "/a/voz uno.wav");
  assert.equal(input.scenes[0].imagePath, "/i/img uno.png");
  assert.equal(input.scenes[0].durationMs, "voz uno".length * 100);
  assert.equal(input.scenes[0].isFallback, false);
});

test("generate carries fallbackColor through when an image fails", async () => {
  const f = fixtures();
  f.images = { async generate() { return { imagePath: null, isFallback: true, fallbackColor: "#111" }; } };
  const engine = createReelEngine(f);
  await engine.generate("x");
  const input = f.getRenderInput();
  assert.equal(input.scenes[0].isFallback, true);
  assert.equal(input.scenes[0].fallbackColor, "#111");
});

test("generate propagates a render error", async () => {
  const f = fixtures();
  f.render = async () => { throw new Error("render falló"); };
  const engine = createReelEngine(f);
  await assert.rejects(() => engine.generate("x"), /render falló/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/reels/reel-engine.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// agent/services/reels/reel-engine.js
// Orquesta: tema -> guion (scriptGenerator) -> voz+imagen por escena (en paralelo) -> render.
function createReelEngine({ scriptGenerator, voice, images, render }) {
  async function buildScene(scene) {
    const [audio, image] = await Promise.all([
      voice.synthesize(scene.voiceLine),
      images.generate(scene.imagePrompt),
    ]);
    return {
      text: scene.text,
      audioPath: audio.audioPath,
      durationMs: audio.durationMs,
      imagePath: image.imagePath,
      isFallback: image.isFallback,
      fallbackColor: image.fallbackColor,
    };
  }

  async function generate(topic) {
    const reelSpec = await scriptGenerator.generate(topic);
    const scenes = await Promise.all(reelSpec.scenes.map(buildScene));
    const mp4Path = await render({ title: reelSpec.title, scenes });
    return {
      mp4Path,
      caption: reelSpec.caption,
      hashtags: reelSpec.hashtags,
      reelSpec,
      scenes,
    };
  }

  return { generate };
}

module.exports = { createReelEngine };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/reels/reel-engine.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/services/reels/reel-engine.js agent/tests/reels/reel-engine.test.js
git commit -m "feat(reels): reel engine orchestrator"
```

---

## Task 6: Composición Remotion (`<Reel>`)

**Files:**
- Create: `agent/remotion/index.js`
- Create: `agent/remotion/Root.jsx`
- Create: `agent/remotion/Reel.jsx`

> Integración: Remotion compila estos JSX con su propio bundler (Task 7). No hay test unitario aquí; se verifica con el bundle en la Task 7.

- [ ] **Step 1: Crear `agent/remotion/Reel.jsx`**

```jsx
import React from "react";
import { AbsoluteFill, Sequence, Img, Audio, useVideoConfig, interpolate, useCurrentFrame } from "remotion";

const FPS = 30;
const msToFrames = (ms) => Math.max(1, Math.round((ms / 1000) * FPS));

function Scene({ scene }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  // zoom suave (Ken Burns)
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.08]);
  return (
    <AbsoluteFill style={{ backgroundColor: scene.fallbackColor || "#0A1F3F" }}>
      {scene.imagePath ? (
        <Img
          src={"file://" + scene.imagePath}
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }}
        />
      ) : null}
      {/* overlay oscuro para legibilidad del texto */}
      <AbsoluteFill style={{ background: "linear-gradient(transparent 55%, rgba(0,0,0,0.75))" }} />
      <AbsoluteFill style={{ justifyContent: "flex-end", padding: 80 }}>
        <div
          style={{
            color: "white", fontFamily: "Arial, sans-serif", fontWeight: 800,
            fontSize: 64, lineHeight: 1.15, textShadow: "0 2px 12px rgba(0,0,0,0.8)",
          }}
        >
          {scene.text}
        </div>
      </AbsoluteFill>
      {scene.audioPath ? <Audio src={"file://" + scene.audioPath} /> : null}
    </AbsoluteFill>
  );
}

export const Reel = ({ scenes = [] }) => {
  let start = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#0A1F3F" }}>
      {scenes.map((scene, i) => {
        const dur = msToFrames(scene.durationMs || 2500);
        const from = start;
        start += dur;
        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            <Scene scene={scene} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export const reelDurationInFrames = (scenes = []) =>
  scenes.reduce((acc, s) => acc + msToFrames(s.durationMs || 2500), 0) || FPS;
```

- [ ] **Step 2: Crear `agent/remotion/Root.jsx`**

```jsx
import React from "react";
import { Composition } from "remotion";
import { Reel, reelDurationInFrames } from "./Reel";

export const RemotionRoot = () => {
  return (
    <Composition
      id="Reel"
      component={Reel}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ scenes: [] }}
      calculateMetadata={({ props }) => ({
        durationInFrames: reelDurationInFrames(props.scenes),
      })}
    />
  );
};
```

- [ ] **Step 3: Crear `agent/remotion/index.js`**

```js
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
```

- [ ] **Step 4: Commit**

```bash
git add agent/remotion/index.js agent/remotion/Root.jsx agent/remotion/Reel.jsx
git commit -m "feat(reels): remotion Reel composition (image+text+audio per scene)"
```

---

## Task 7: Render Remotion (`renderReel`)

**Files:**
- Create: `agent/remotion/render.js`

> Integración: usa `@remotion/bundler` + `@remotion/renderer`. Se verifica generando un MP4 de muestra a partir de un input fijo (requiere que Remotion descargue Chromium la primera vez).

- [ ] **Step 1: Crear `agent/remotion/render.js`**

```js
// renderReel(inputProps, outPath) -> outPath. inputProps = { title, scenes:[{text,imagePath,isFallback,fallbackColor,audioPath,durationMs}] }
const path = require("path");
const { bundle } = require("@remotion/bundler");
const { renderMedia, selectComposition } = require("@remotion/renderer");

let cachedBundleUrl = null;

async function getBundle() {
  if (cachedBundleUrl) return cachedBundleUrl;
  cachedBundleUrl = await bundle({
    entryPoint: path.join(__dirname, "index.js"),
    // webpackOverride por defecto; Remotion maneja JSX.
  });
  return cachedBundleUrl;
}

async function renderReel(inputProps, outPath) {
  const serveUrl = await getBundle();
  const composition = await selectComposition({
    serveUrl,
    id: "Reel",
    inputProps,
  });
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outPath,
    inputProps,
  });
  return outPath;
}

module.exports = { renderReel };
```

- [ ] **Step 2: Crear un script de muestra para verificar el render**

Crea temporalmente `agent/remotion/_sample.js`:

```js
const path = require("path");
const { renderReel } = require("./render");

(async () => {
  const out = path.join(__dirname, "_sample-out.mp4");
  await renderReel({
    title: "Demo",
    scenes: [
      { text: "Escena uno", imagePath: null, isFallback: true, fallbackColor: "#0A1F3F", audioPath: null, durationMs: 2000 },
      { text: "Escena dos", imagePath: null, isFallback: true, fallbackColor: "#1B3B6F", audioPath: null, durationMs: 2000 },
    ],
  }, out);
  console.log("RENDER OK ->", out);
})().catch((e) => { console.error("RENDER FAIL", e); process.exit(1); });
```

- [ ] **Step 3: Ejecutar el render de muestra**

Run: `cd agent && node remotion/_sample.js`
Expected: La primera vez Remotion descarga Chromium (puede tardar). Al final imprime `RENDER OK -> .../_sample-out.mp4` y el archivo existe (sin audio/imagen, 2 escenas de color sólido con texto, 4s).

Si falla por Chromium/entorno headless, reportar el error como DONE_WITH_CONCERNS (el código queda listo; el render puede requerir dependencias del SO en el VPS).

- [ ] **Step 4: Limpiar muestra y commitear**

```bash
rm -f agent/remotion/_sample.js agent/remotion/_sample-out.mp4
git add agent/remotion/render.js
git commit -m "feat(reels): remotion render (bundle + renderMedia)"
```

---

## Task 8: Proveedores reales de Gemini + ruta Express

**Files:**
- Create: `agent/services/reels/gemini-providers.js`
- Create: `agent/routes/reels.js`
- Modify: `agent/server.js` (require + mount)

> Integración: wiring con las APIs reales de Gemini (vía axios) y Remotion. Se verifica que el módulo carga sin errores; la generación real requiere `GEMINI_API_KEY`.

- [ ] **Step 1: Crear los proveedores reales `agent/services/reels/gemini-providers.js`**

```js
// Implementaciones reales (Gemini vía REST con axios) que cumplen las interfaces inyectables.
// NOTA: confirmar IDs de modelo/endpoints vigentes en ai.google.dev antes de producción.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const KEY = () => process.env.GEMINI_API_KEY;

function tmpFile(ext) {
  return path.join(os.tmpdir(), "reel-" + crypto.randomBytes(8).toString("hex") + ext);
}

// gemini.generateText(prompt) -> string
const gemini = {
  async generateText(prompt) {
    const url = BASE + "/gemini-2.5-flash:generateContent?key=" + KEY();
    const { data } = await axios.post(url, { contents: [{ parts: [{ text: prompt }] }] });
    const parts = data.candidates && data.candidates[0] && data.candidates[0].content.parts;
    return (parts || []).map((p) => p.text || "").join("");
  },
};

// tts(text) -> audioPath (Gemini TTS devuelve PCM 24kHz mono base64; lo guardamos como WAV)
function pcmToWav(pcmBuffer, sampleRate = 24000) {
  const numChannels = 1, bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

async function tts(text) {
  const url = BASE + "/gemini-2.5-flash-preview-tts:generateContent?key=" + KEY();
  const { data } = await axios.post(url, {
    contents: [{ parts: [{ text }] }],
    generationConfig: { responseModalities: ["AUDIO"] },
  });
  const b64 = data.candidates[0].content.parts[0].inlineData.data;
  const pcm = Buffer.from(b64, "base64");
  const wav = pcmToWav(pcm, 24000);
  const out = tmpFile(".wav");
  fs.writeFileSync(out, wav);
  return out;
}

// measureDuration: duración exacta del WAV PCM 24kHz/16-bit/mono = bytesData / (24000*2) * 1000
async function measureDuration(audioPath) {
  const stat = fs.statSync(audioPath);
  const dataBytes = stat.size - 44; // restar cabecera WAV
  return Math.round((dataBytes / (24000 * 2)) * 1000);
}

// gen(prompt) -> imagePath (Gemini image / Nano Banana). Devuelve la imagen inline base64.
async function gen(prompt) {
  const url = BASE + "/gemini-2.5-flash-image:generateContent?key=" + KEY();
  const fullPrompt = prompt + " — formato vertical 9:16, alta calidad, sin texto.";
  const { data } = await axios.post(url, { contents: [{ parts: [{ text: fullPrompt }] }] });
  const parts = data.candidates[0].content.parts;
  const imgPart = parts.find((p) => p.inlineData);
  if (!imgPart) throw new Error("Gemini no devolvió imagen");
  const out = tmpFile(".png");
  fs.writeFileSync(out, Buffer.from(imgPart.inlineData.data, "base64"));
  return out;
}

module.exports = { gemini, tts, measureDuration, gen };
```

- [ ] **Step 2: Crear la ruta `agent/routes/reels.js`**

```js
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const { createScriptGenerator } = require("../services/reels/script-generator");
const { createVoiceProvider } = require("../services/reels/voice");
const { createImageProvider } = require("../services/reels/images");
const { createReelEngine } = require("../services/reels/reel-engine");
const { gemini, tts, measureDuration, gen } = require("../services/reels/gemini-providers");
const { renderReel } = require("../remotion/render");

const router = express.Router();

// Carpeta pública para servir los MP4 (la necesita el Publicador de IG con URL pública).
const REELS_DIR = path.join(__dirname, "..", "public", "reels");
fs.mkdirSync(REELS_DIR, { recursive: true });

const scriptGenerator = createScriptGenerator({ gemini });
const voice = createVoiceProvider({ tts, measureDuration });
const images = createImageProvider({ gen });
const render = async (input) => {
  const out = path.join(REELS_DIR, "reel-" + crypto.randomBytes(8).toString("hex") + ".mp4");
  return renderReel(input, out);
};
const engine = createReelEngine({ scriptGenerator, voice, images, render });

// POST /api/reels/generate  body: { topic, clientId? }
router.post("/generate", async function (req, res) {
  try {
    const { topic } = req.body;
    if (!topic) return res.status(400).json({ error: "Falta topic" });
    const result = await engine.generate(topic);
    const fileName = path.basename(result.mp4Path);
    res.json({
      ok: true,
      caption: result.caption,
      hashtags: result.hashtags,
      publicUrl: "/widget/reels/" + fileName, // servido estático por el agente
      reelSpec: result.reelSpec,
    });
  } catch (err) {
    console.error("[reels/generate]", err.message);
    res.status(500).json({ error: "Error generando el reel", detail: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 2b: Servir la carpeta de reels como estática**

En `agent/server.js`, junto a la línea `app.use("/widget", express.static(path.join(__dirname, "public")));` (ya existente) NO hace falta cambio: `public/reels/` ya queda servido bajo `/widget/reels/`. Verifícalo; si el static de `/widget` no cubriera subcarpetas, añade `app.use("/widget", express.static(path.join(__dirname, "public")));` (ya está).

- [ ] **Step 3: Montar la ruta en server.js**

En `agent/server.js`, junto a los otros `require` de rutas añade:

```js
const reelsRoutes = require("./routes/reels");
```

Y junto a los otros `app.use(...)` añade:

```js
app.use("/api/reels", reelsRoutes);
```

- [ ] **Step 4: Verificar que carga y que la suite sigue verde**

Run: `cd agent && node -e "require('./routes/reels'); console.log('reels route OK')"`
Expected: imprime `reels route OK` (puede tardar un momento por requires de Remotion; sin errores).

Run: `cd agent && node --check server.js && echo "server OK"`
Expected: `server OK`.

Run: `cd agent && npm test 2>&1 | tail -5`
Expected: todos los tests de `tests/reels/` y `tests/social/` en verde.

- [ ] **Step 5: Commit**

```bash
git add agent/services/reels/gemini-providers.js agent/routes/reels.js agent/server.js
git commit -m "feat(reels): gemini providers + /api/reels/generate route"
```

---

## Task 9: Variables de entorno + README

**Files:**
- Modify: `agent/.env.example`
- Modify: `agent/README.md`

- [ ] **Step 1: Añadir variable al .env.example**

Añade al final de `agent/.env.example`:

```
# ── Reels (Motor de generación, Fase 2) ──────────────────────
# Gemini para guion + voz (TTS) + imágenes. ai.google.dev
GEMINI_API_KEY=
```

- [ ] **Step 2: Documentar en el README**

Añade una sección antes de la línea de contacto final en `agent/README.md`:

```markdown
## 🎬 Reels — Motor de generación faceless (Fase 2)

Convierte un tema corto en un reel 9:16 (MP4 + caption + hashtags).

| Método | URL | Descripción |
|--------|-----|-------------|
| `POST` | `/api/reels/generate` | Body `{ topic, clientId? }` → genera el reel y devuelve `publicUrl`, `caption`, `hashtags` |

Pipeline: Gemini (guion por escenas) → voz Gemini TTS + imágenes Gemini por escena → Remotion monta el MP4. El MP4 se guarda en `public/reels/` y se sirve en `/widget/reels/<archivo>.mp4` (URL pública que consume el Publicador de la Fase 1).

Requiere `GEMINI_API_KEY`. El primer render descarga un Chromium (Remotion).

```bash
curl -X POST http://localhost:3000/api/reels/generate \
  -H "Content-Type: application/json" \
  -d '{"topic":"5 errores al vender por WhatsApp"}'
```
```

- [ ] **Step 3: Commit**

```bash
git add agent/.env.example agent/README.md
git commit -m "docs(reels): env var + README motor de reels"
```

---

## Notas de cierre

- **Núcleo testeable (Tasks 1-5):** schema, script-generator, voice, images, reel-engine — TDD con `node:test`, sin red ni render.
- **Integración (Tasks 6-8):** Remotion (composición + render) y proveedores Gemini reales — se verifican por bundle/carga; la generación real necesita `GEMINI_API_KEY` y, para render, Chromium (lo descarga Remotion).
- **Confirmar antes de producción:** IDs de modelo Gemini vigentes (`gemini-2.5-flash`, `gemini-2.5-flash-preview-tts`, `gemini-2.5-flash-image`) y que el VPS tenga las libs del SO que Remotion/Chromium necesita.
- **Fuera de alcance (fases siguientes):** subtítulos karaoke, música de fondo, integración automática con el Publicador (lo orquesta el agente), capa de inteligencia que elige el `topic`.
