# Fase 3 — Avatares (HeyGen) · Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los reels puedan incluir escenas de avatar (la persona del cliente hablando, generada por HeyGen a partir de su foto + nuestro audio Gemini TTS), en formato híbrido (avatar abre/cierra, b-roll en medio), con consentimiento obligatorio y degradación a b-roll si HeyGen falla.

**Architecture:** Extiende el motor de la Fase 2 sin romperlo: `reel-spec` gana `scenes[].type` ("avatar"|"broll", default broll → retrocompatible); el `reel-engine` enruta por type con degradación; `avatar.js` orquesta TTS→HeyGen; `avatar-profiles` guarda `heygen_avatar_id` + consentimiento (gate legal). Remotion reproduce el clip del avatar con `<OffthreadVideo>`. Mismo patrón DI/TDD de las fases 1-2.

**Tech Stack:** Node 20 + Express + axios (existente), Remotion 4 (existente), HeyGen API (nuevo, `HEYGEN_API_KEY`), `node:test`.

---

## Estructura de archivos

```
agent/
├── migrations/002_avatar_profiles.sql        ← NUEVO
├── services/reels/
│   ├── avatar-profiles.js                    ← NUEVO: store memoria + PG, getAuthorized exige consentimiento
│   ├── avatar.js                             ← NUEVO: createAvatarProvider({ heygen, voice })
│   ├── heygen-provider.js                    ← NUEVO: API real (upload audio, generate, poll, download) + createPhotoAvatar
│   ├── reel-spec-schema.js                   ← MODIFICAR: scenes[].type opcional
│   ├── script-generator.js                   ← MODIFICAR: opts.hasAvatar en el prompt
│   └── reel-engine.js                        ← MODIFICAR: enrutado avatar/broll + degradación
├── remotion/
│   ├── Reel.jsx                              ← MODIFICAR: escena con videoSrc usa <OffthreadVideo>
│   └── render.js                             ← MODIFICAR: stageAssets copia videoPath → videoSrc
├── routes/reels.js                           ← MODIFICAR: clientId → avatar profile autorizado; POST /avatar-profile
└── tests/reels/
    ├── avatar-profiles.test.js               ← NUEVO
    ├── avatar.test.js                        ← NUEVO
    ├── reel-spec-schema.test.js              ← MODIFICAR (añadir tests de type)
    ├── script-generator.test.js              ← MODIFICAR (añadir test hasAvatar)
    └── reel-engine.test.js                   ← MODIFICAR (añadir tests avatar/degradación)
```

**Contratos compartidos (además de los de Fase 2):**
- **avatarProfile**: `{ clientId, displayName, heygenAvatarId, consentSigned, consentDate }`
- **heygen** inyectado: `{ async generateVideo({ avatarId, audioPath }) -> videoPath }` (el real también expone `createPhotoAvatar`)
- **avatarProvider**: `generate({ avatarId, voiceLine }) -> { videoPath, durationMs }` (lanza error si HeyGen falla → el engine degrada)
- **Escena renderizada avatar**: `{ type:"avatar", text, videoPath, durationMs, degraded:false }` → render.js la convierte a `videoSrc` relativo.
- Tests: `cd agent && node --test tests/reels/<archivo>` (pasar archivos explícitos, NO el directorio).

---

## Task 0: Migración + store de avatar profiles

**Files:**
- Create: `agent/migrations/002_avatar_profiles.sql`
- Create: `agent/services/reels/avatar-profiles.js`
- Test: `agent/tests/reels/avatar-profiles.test.js`

- [ ] **Step 1: Crear la migración**

```sql
-- agent/migrations/002_avatar_profiles.sql
CREATE TABLE IF NOT EXISTS avatar_profiles (
  id               BIGSERIAL PRIMARY KEY,
  client_id        TEXT NOT NULL UNIQUE,
  display_name     TEXT,
  heygen_avatar_id TEXT NOT NULL,
  consent_signed   BOOLEAN NOT NULL DEFAULT false,
  consent_date     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Write the failing test**

```js
// agent/tests/reels/avatar-profiles.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { createMemoryAvatarProfiles } = require("../../services/reels/avatar-profiles");

const profile = {
  clientId: "casaluxe", displayName: "Caro de Casa Luxe",
  heygenAvatarId: "tp_abc123", consentSigned: true, consentDate: "2026-06-10",
};

test("save then getAuthorized returns the profile when consent is signed", async () => {
  const store = createMemoryAvatarProfiles();
  await store.save(profile);
  const got = await store.getAuthorized("casaluxe");
  assert.deepEqual(got, profile);
});

test("getAuthorized returns null when consent NOT signed (gate legal)", async () => {
  const store = createMemoryAvatarProfiles();
  await store.save({ ...profile, consentSigned: false });
  assert.equal(await store.getAuthorized("casaluxe"), null);
});

test("getAuthorized returns null for unknown client", async () => {
  const store = createMemoryAvatarProfiles();
  assert.equal(await store.getAuthorized("nadie"), null);
});

test("get returns the profile even without consent (para administrar)", async () => {
  const store = createMemoryAvatarProfiles();
  await store.save({ ...profile, consentSigned: false });
  const got = await store.get("casaluxe");
  assert.equal(got.consentSigned, false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd agent && node --test tests/reels/avatar-profiles.test.js`
Expected: FAIL — `Cannot find module '../../services/reels/avatar-profiles'`.

- [ ] **Step 4: Write minimal implementation**

```js
// agent/services/reels/avatar-profiles.js
function createMemoryAvatarProfiles() {
  const map = new Map();
  return {
    async save(p) { map.set(p.clientId, p); },
    async get(clientId) { return map.get(clientId) || null; },
    // Gate legal: solo devuelve el perfil si el consentimiento está firmado.
    async getAuthorized(clientId) {
      const p = map.get(clientId) || null;
      return p && p.consentSigned ? p : null;
    },
  };
}

function createPgAvatarProfiles({ pool }) {
  function rowToProfile(r) {
    return {
      clientId: r.client_id, displayName: r.display_name,
      heygenAvatarId: r.heygen_avatar_id,
      consentSigned: r.consent_signed, consentDate: r.consent_date,
    };
  }
  return {
    async save(p) {
      await pool.query(
        `INSERT INTO avatar_profiles (client_id, display_name, heygen_avatar_id, consent_signed, consent_date)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (client_id)
         DO UPDATE SET display_name=$2, heygen_avatar_id=$3, consent_signed=$4, consent_date=$5`,
        [p.clientId, p.displayName, p.heygenAvatarId, p.consentSigned, p.consentDate]
      );
    },
    async get(clientId) {
      const { rows } = await pool.query(
        `SELECT client_id, display_name, heygen_avatar_id, consent_signed, consent_date
         FROM avatar_profiles WHERE client_id=$1`, [clientId]);
      return rows.length ? rowToProfile(rows[0]) : null;
    },
    async getAuthorized(clientId) {
      const { rows } = await pool.query(
        `SELECT client_id, display_name, heygen_avatar_id, consent_signed, consent_date
         FROM avatar_profiles WHERE client_id=$1 AND consent_signed=true`, [clientId]);
      return rows.length ? rowToProfile(rows[0]) : null;
    },
  };
}

module.exports = { createMemoryAvatarProfiles, createPgAvatarProfiles };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd agent && node --test tests/reels/avatar-profiles.test.js`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add agent/migrations/002_avatar_profiles.sql agent/services/reels/avatar-profiles.js agent/tests/reels/avatar-profiles.test.js
git commit -m "feat(avatar): avatar profiles store with consent gate + migration"
```

---

## Task 1: reel-spec con `scenes[].type`

**Files:**
- Modify: `agent/services/reels/reel-spec-schema.js`
- Modify: `agent/tests/reels/reel-spec-schema.test.js`

- [ ] **Step 1: Write the failing tests (append al final del test file)**

```js
test("accepts scenes with type avatar or broll", () => {
  const r = validateReelSpec({
    ...valid,
    scenes: [
      { type: "avatar", text: "t", voiceLine: "v", imagePrompt: "p" },
      { type: "broll", text: "t2", voiceLine: "v2", imagePrompt: "p2" },
    ],
  });
  assert.equal(r.valid, true);
});

test("accepts scenes WITHOUT type (retrocompatible, default broll)", () => {
  const r = validateReelSpec(valid);
  assert.equal(r.valid, true);
});

test("rejects invalid scene type", () => {
  const r = validateReelSpec({
    ...valid,
    scenes: [{ type: "hologram", text: "t", voiceLine: "v", imagePrompt: "p" }],
  });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("type")));
});
```

- [ ] **Step 2: Run para verificar que falla**

Run: `cd agent && node --test tests/reels/reel-spec-schema.test.js`
Expected: FAIL — el test de "hologram" pasa validación (no hay regla de type aún).

- [ ] **Step 3: Implementar — añadir dentro del forEach de scenes en `validateReelSpec`**

Añade esta línea dentro de `spec.scenes.forEach((s, i) => { ... })`, junto a las otras validaciones:

```js
      if (s && s.type !== undefined && s.type !== "avatar" && s.type !== "broll") {
        errors.push("scene[" + i + "].type debe ser 'avatar' o 'broll'");
      }
```

- [ ] **Step 4: Run para verificar que pasa**

Run: `cd agent && node --test tests/reels/reel-spec-schema.test.js`
Expected: PASS (8 tests: 5 previos + 3 nuevos).

- [ ] **Step 5: Commit**

```bash
git add agent/services/reels/reel-spec-schema.js agent/tests/reels/reel-spec-schema.test.js
git commit -m "feat(avatar): reel-spec scenes[].type avatar|broll (default broll)"
```

---

## Task 2: Avatar provider (TTS → HeyGen)

**Files:**
- Create: `agent/services/reels/avatar.js`
- Test: `agent/tests/reels/avatar.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/reels/avatar.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { createAvatarProvider } = require("../../services/reels/avatar");

test("generate synthesizes voice then asks heygen with that audio", async () => {
  const calls = [];
  const voice = {
    async synthesize(text) { calls.push(["tts", text]); return { audioPath: "/tmp/v.wav", durationMs: 4500 }; },
  };
  const heygen = {
    async generateVideo({ avatarId, audioPath }) {
      calls.push(["heygen", avatarId, audioPath]);
      return "/tmp/avatar-clip.mp4";
    },
  };
  const avatar = createAvatarProvider({ heygen, voice });
  const res = await avatar.generate({ avatarId: "tp_abc", voiceLine: "Hola, soy Caro" });
  assert.equal(res.videoPath, "/tmp/avatar-clip.mp4");
  assert.equal(res.durationMs, 4500);
  assert.deepEqual(calls, [["tts", "Hola, soy Caro"], ["heygen", "tp_abc", "/tmp/v.wav"]]);
});

test("generate propagates heygen errors (el engine degradará)", async () => {
  const voice = { async synthesize() { return { audioPath: "/a.wav", durationMs: 1000 }; } };
  const heygen = { async generateVideo() { throw new Error("heygen caído"); } };
  const avatar = createAvatarProvider({ heygen, voice });
  await assert.rejects(() => avatar.generate({ avatarId: "x", voiceLine: "y" }), /heygen caído/);
});
```

- [ ] **Step 2: Run para verificar que falla**

Run: `cd agent && node --test tests/reels/avatar.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implementar**

```js
// agent/services/reels/avatar.js
// Genera la voz con NUESTRO TTS (voz coherente con el resto del reel) y
// HeyGen anima al avatar hablando ese audio (lip-sync).
function createAvatarProvider({ heygen, voice }) {
  async function generate({ avatarId, voiceLine }) {
    const { audioPath, durationMs } = await voice.synthesize(voiceLine);
    const videoPath = await heygen.generateVideo({ avatarId, audioPath });
    return { videoPath, durationMs };
  }
  return { generate };
}

module.exports = { createAvatarProvider };
```

- [ ] **Step 4: Run para verificar que pasa**

Run: `cd agent && node --test tests/reels/avatar.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/services/reels/avatar.js agent/tests/reels/avatar.test.js
git commit -m "feat(avatar): avatar provider (gemini tts -> heygen lipsync)"
```

---

## Task 3: script-generator con `hasAvatar`

**Files:**
- Modify: `agent/services/reels/script-generator.js`
- Modify: `agent/tests/reels/script-generator.test.js`

- [ ] **Step 1: Write the failing tests (append)**

```js
test("generate with hasAvatar asks for type per scene in the prompt", async () => {
  let seenPrompt = "";
  const gemini = { async generateText(p) { seenPrompt = p; return JSON.stringify(goodSpec); } };
  await createScriptGenerator({ gemini }).generate("tema x", { hasAvatar: true });
  assert.match(seenPrompt, /"type"/);
  assert.match(seenPrompt, /avatar/);
});

test("generate without opts does NOT mention avatar (retrocompatible)", async () => {
  let seenPrompt = "";
  const gemini = { async generateText(p) { seenPrompt = p; return JSON.stringify(goodSpec); } };
  await createScriptGenerator({ gemini }).generate("tema x");
  assert.ok(!/avatar/.test(seenPrompt));
});
```

- [ ] **Step 2: Run para verificar que falla**

Run: `cd agent && node --test tests/reels/script-generator.test.js`
Expected: FAIL — el primer test nuevo no encuentra `"type"` en el prompt.

- [ ] **Step 3: Implementar — reemplazar `buildPrompt`, `attempt` y `generate` en script-generator.js**

```js
function buildPrompt(topic, hasAvatar) {
  const lines = [
    "Eres un guionista de reels virales en español para una pyme.",
    "Dado un TEMA, devuelve SOLO un JSON (sin texto extra) con esta forma exacta:",
    '{ "title": string, "caption": string, "hashtags": string[], "scenes": [ { "text": string, "voiceLine": string, "imagePrompt": string } ] }',
    "Reglas: 4-7 escenas; `text` = frase corta en pantalla (gancho/idea); `voiceLine` = lo que dice la voz en off;",
    "`imagePrompt` = descripción para generar una imagen vertical 9:16 de fondo. caption con 1-2 emojis. 3-6 hashtags sin #.",
  ];
  if (hasAvatar) {
    lines.push(
      'Además, cada escena debe incluir "type": "avatar" o "broll".',
      'La PRIMERA escena (gancho) y la ÚLTIMA (llamada a la acción) deben ser "type": "avatar" — la persona hablando a cámara, con voiceLine en primera persona.',
      'Las escenas del medio deben ser "type": "broll".'
    );
  }
  lines.push("", "TEMA: " + topic);
  return lines.join("\n");
}
```

En `attempt` y `generate`, pasar la opción:

```js
  async function attempt(topic, hasAvatar, extraInstruction) {
    const prompt = buildPrompt(topic, hasAvatar) + (extraInstruction ? "\n\n" + extraInstruction : "");
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

  async function generate(topic, opts = {}) {
    const hasAvatar = !!opts.hasAvatar;
    let r = await attempt(topic, hasAvatar);
    if (r.ok) return r.spec;
    r = await attempt(topic, hasAvatar, "Tu respuesta anterior fue inválida (" + r.reason + "). Devuelve SOLO el JSON válido pedido.");
    if (r.ok) return r.spec;
    throw new Error("reel-spec inválido tras 2 intentos: " + r.reason);
  }
```

- [ ] **Step 4: Run para verificar que pasa (los 5 tests previos + 2 nuevos)**

Run: `cd agent && node --test tests/reels/script-generator.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/services/reels/script-generator.js agent/tests/reels/script-generator.test.js
git commit -m "feat(avatar): script generator marks avatar/broll scenes when hasAvatar"
```

---

## Task 4: reel-engine híbrido (enrutado + degradación)

**Files:**
- Modify: `agent/services/reels/reel-engine.js`
- Modify: `agent/tests/reels/reel-engine.test.js`

- [ ] **Step 1: Write the failing tests (append)**

```js
function avatarFixtures() {
  const spec = {
    title: "T", caption: "cap", hashtags: ["a"],
    scenes: [
      { type: "avatar", text: "gancho", voiceLine: "hola soy caro", imagePrompt: "x" },
      { type: "broll", text: "medio", voiceLine: "dato uno", imagePrompt: "img medio" },
      { type: "avatar", text: "cta", voiceLine: "sígueme", imagePrompt: "x" },
    ],
  };
  const scriptGenerator = { async generate() { return spec; } };
  const voice = { async synthesize(t) { return { audioPath: "/a/" + t + ".wav", durationMs: 1000 }; } };
  const images = { async generate(p) { return { imagePath: "/i/" + p + ".png", isFallback: false }; } };
  let renderInput = null;
  const render = async (input) => { renderInput = input; return "/out/reel.mp4"; };
  const avatar = { async generate({ avatarId, voiceLine }) { return { videoPath: "/v/" + voiceLine + ".mp4", durationMs: 8000 }; } };
  return { spec, scriptGenerator, voice, images, render, avatar, getRenderInput: () => renderInput };
}

test("avatar scenes route to avatar provider, broll to current flow", async () => {
  const f = avatarFixtures();
  const engine = createReelEngine(f);
  const res = await engine.generate("tema", { avatarId: "tp_1" });
  const input = f.getRenderInput();
  assert.equal(input.scenes[0].type, "avatar");
  assert.equal(input.scenes[0].videoPath, "/v/hola soy caro.mp4");
  assert.equal(input.scenes[0].durationMs, 8000);
  assert.equal(input.scenes[1].type, "broll");
  assert.equal(input.scenes[1].imagePath, "/i/img medio.png");
  assert.equal(res.usedAvatar, true);
  assert.equal(res.degraded, false);
});

test("scriptGenerator receives hasAvatar=true when avatar provider + avatarId present", async () => {
  const f = avatarFixtures();
  let seenOpts = null;
  f.scriptGenerator = { async generate(topic, opts) { seenOpts = opts; return f.spec; } };
  const engine = createReelEngine(f);
  await engine.generate("tema", { avatarId: "tp_1" });
  assert.equal(seenOpts.hasAvatar, true);
});

test("avatar failure degrades that scene to broll and flags degraded", async () => {
  const f = avatarFixtures();
  f.avatar = { async generate() { throw new Error("heygen caído"); } };
  const engine = createReelEngine(f);
  const res = await engine.generate("tema", { avatarId: "tp_1" });
  const input = f.getRenderInput();
  assert.equal(input.scenes[0].type, "broll");
  assert.ok(input.scenes[0].audioPath);
  assert.equal(res.degraded, true);
});

test("without avatarId everything is broll even if scenes say avatar", async () => {
  const f = avatarFixtures();
  const engine = createReelEngine(f);
  const res = await engine.generate("tema");
  const input = f.getRenderInput();
  assert.equal(input.scenes[0].type, "broll");
  assert.equal(res.usedAvatar, false);
});
```

- [ ] **Step 2: Run para verificar que falla**

Run: `cd agent && node --test tests/reels/reel-engine.test.js`
Expected: FAIL — `usedAvatar`/enrutado no existen.

- [ ] **Step 3: Reescribir `agent/services/reels/reel-engine.js`**

```js
// Orquesta: tema -> guion (scriptGenerator) -> assets por escena (en paralelo) -> render.
// Escenas type "avatar" van al avatar provider (HeyGen); si falla, degradan a broll.
function createReelEngine({ scriptGenerator, voice, images, render, avatar }) {
  async function buildBrollScene(scene, degraded) {
    const [audio, image] = await Promise.all([
      voice.synthesize(scene.voiceLine),
      images.generate(scene.imagePrompt),
    ]);
    return {
      type: "broll",
      text: scene.text,
      audioPath: audio.audioPath,
      durationMs: audio.durationMs,
      imagePath: image.imagePath,
      isFallback: image.isFallback,
      fallbackColor: image.fallbackColor,
      degraded: !!degraded,
    };
  }

  async function buildScene(scene, avatarId) {
    if (scene.type === "avatar" && avatar && avatarId) {
      try {
        const clip = await avatar.generate({ avatarId, voiceLine: scene.voiceLine });
        return {
          type: "avatar",
          text: scene.text,
          videoPath: clip.videoPath,
          durationMs: clip.durationMs,
          degraded: false,
        };
      } catch (e) {
        return buildBrollScene(scene, true); // degradación: el reel sale igual
      }
    }
    return buildBrollScene(scene, false);
  }

  async function generate(topic, opts = {}) {
    const avatarId = opts.avatarId || null;
    const hasAvatar = !!(avatar && avatarId);
    const reelSpec = await scriptGenerator.generate(topic, { hasAvatar });
    const scenes = await Promise.all(reelSpec.scenes.map((s) => buildScene(s, avatarId)));
    const mp4Path = await render({ title: reelSpec.title, scenes });
    return {
      mp4Path,
      caption: reelSpec.caption,
      hashtags: reelSpec.hashtags,
      reelSpec,
      scenes,
      usedAvatar: scenes.some((s) => s.type === "avatar"),
      degraded: scenes.some((s) => s.degraded),
    };
  }

  return { generate };
}

module.exports = { createReelEngine };
```

- [ ] **Step 4: Run TODOS los tests de engine (3 previos deben seguir verdes + 4 nuevos)**

Run: `cd agent && node --test tests/reels/reel-engine.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/services/reels/reel-engine.js agent/tests/reels/reel-engine.test.js
git commit -m "feat(avatar): hybrid reel engine (avatar routing + degradation to broll)"
```

---

## Task 5: Remotion — escenas de video (avatar)

**Files:**
- Modify: `agent/remotion/Reel.jsx`
- Modify: `agent/remotion/render.js`

- [ ] **Step 1: Modificar `Reel.jsx` — import + rama de video en `Scene`**

Import (línea 2):

```jsx
import { AbsoluteFill, Sequence, Img, Audio, OffthreadVideo, staticFile, interpolate, useCurrentFrame } from "remotion";
```

Reemplazar el cuerpo del componente `Scene` por:

```jsx
function Scene({ scene, sceneDurationInFrames }) {
  const frame = useCurrentFrame();
  // zoom suave (Ken Burns) a lo largo de ESTA escena (solo b-roll)
  const scale = interpolate(frame, [0, sceneDurationInFrames], [1, 1.08]);
  return (
    <AbsoluteFill style={{ backgroundColor: scene.fallbackColor || "#0A1F3F" }}>
      {scene.videoSrc ? (
        <OffthreadVideo
          src={staticFile(scene.videoSrc)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : scene.imageSrc ? (
        <Img
          src={staticFile(scene.imageSrc)}
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
      {scene.audioSrc && !scene.videoSrc ? <Audio src={staticFile(scene.audioSrc)} /> : null}
    </AbsoluteFill>
  );
}
```

(El clip del avatar trae su audio embebido — por eso no se añade `<Audio>` cuando hay `videoSrc`.)

- [ ] **Step 2: Modificar `render.js` — stageAssets copia también el video**

Dentro del `.map` de `stageAssets`, después del bloque de `audioPath`, añadir:

```js
    if (s.videoPath) {
      const name = renderId + "-vid-" + i + (path.extname(s.videoPath) || ".mp4");
      fs.copyFileSync(s.videoPath, path.join(publicDir, name));
      staged.push(path.join(publicDir, name));
      scene.videoSrc = name;
    }
```

- [ ] **Step 3: Verificación de integración — render de muestra con una escena de video**

Crea temporalmente `agent/remotion/_avatar-sample.js`:

```js
const path = require("path");
const fs = require("fs");
const { renderReel } = require("./render");

(async () => {
  // 1) generar un clip corto que hará de "clip de avatar"
  const fakeAvatarClip = path.join(__dirname, "_fake-avatar.mp4");
  await renderReel({
    title: "clip",
    scenes: [{ text: "AVATAR", imagePath: null, isFallback: true, fallbackColor: "#444499", audioPath: null, durationMs: 2000 }],
  }, fakeAvatarClip);

  // 2) usarlo como escena type avatar dentro de un reel híbrido
  const out = path.join(__dirname, "_avatar-sample-out.mp4");
  await renderReel({
    title: "Hibrido",
    scenes: [
      { type: "avatar", text: "Habla el avatar", videoPath: fakeAvatarClip, durationMs: 2000 },
      { type: "broll", text: "Escena broll", imagePath: null, isFallback: true, fallbackColor: "#0A1F3F", audioPath: null, durationMs: 2000 },
    ],
  }, out);
  console.log("HYBRID RENDER OK ->", out, fs.statSync(out).size, "bytes");
})().catch((e) => { console.error("HYBRID RENDER FAIL:", e.message.slice(0, 300)); process.exit(1); });
```

Run: `cd agent && node remotion/_avatar-sample.js`
Expected: `HYBRID RENDER OK -> ..._avatar-sample-out.mp4 <bytes>`.

- [ ] **Step 4: Limpiar muestras y verificar suite**

```bash
rm -f agent/remotion/_avatar-sample.js agent/remotion/_fake-avatar.mp4 agent/remotion/_avatar-sample-out.mp4
cd agent && npm test
```
Expected: suite completa verde.

- [ ] **Step 5: Commit**

```bash
git add agent/remotion/Reel.jsx agent/remotion/render.js
git commit -m "feat(avatar): remotion video scenes (OffthreadVideo + videoSrc staging)"
```

---

## Task 6: HeyGen provider real + ruta + env

**Files:**
- Create: `agent/services/reels/heygen-provider.js`
- Modify: `agent/routes/reels.js`
- Modify: `agent/.env.example`
- Modify: `agent/README.md`

- [ ] **Step 1: Crear el proveedor real**

```js
// agent/services/reels/heygen-provider.js
// HeyGen API: talking photo (foto del cliente) + nuestro audio -> video con lip-sync.
// NOTA: verificar endpoints/formatos vigentes en docs.heygen.com con HEYGEN_API_KEY antes de producción.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");

const API = "https://api.heygen.com";
const UPLOAD = "https://upload.heygen.com";
const KEY = () => process.env.HEYGEN_API_KEY;

function tmpFile(ext) {
  return path.join(os.tmpdir(), "avatar-" + crypto.randomBytes(8).toString("hex") + ext);
}

// Sube un archivo binario (audio) y devuelve su asset id.
async function uploadAsset(filePath, contentType) {
  const bin = fs.readFileSync(filePath);
  const { data } = await axios.post(UPLOAD + "/v1/asset", bin, {
    headers: { "X-Api-Key": KEY(), "Content-Type": contentType },
  });
  return data.data.id;
}

// Onboarding (una vez por persona): foto -> talking photo id (el heygenAvatarId del perfil).
async function createPhotoAvatar({ photoPath }) {
  const bin = fs.readFileSync(photoPath);
  const ext = path.extname(photoPath).toLowerCase();
  const contentType = ext === ".png" ? "image/png" : "image/jpeg";
  const { data } = await axios.post(UPLOAD + "/v1/talking_photo", bin, {
    headers: { "X-Api-Key": KEY(), "Content-Type": contentType },
  });
  return data.data.talking_photo_id;
}

// Genera el clip del avatar hablando NUESTRO audio. Asíncrono: submit + poll + download.
async function generateVideo({ avatarId, audioPath, pollIntervalMs = 5000, maxPolls = 60 }) {
  const audioAssetId = await uploadAsset(audioPath, "audio/wav");
  const { data: gen } = await axios.post(API + "/v2/video/generate", {
    video_inputs: [{
      character: { type: "talking_photo", talking_photo_id: avatarId },
      voice: { type: "audio", audio_asset_id: audioAssetId },
    }],
    dimension: { width: 1080, height: 1920 },
  }, { headers: { "X-Api-Key": KEY() } });
  const videoId = gen.data.video_id;

  for (let i = 0; i < maxPolls; i++) {
    const { data: st } = await axios.get(API + "/v1/video_status.get?video_id=" + videoId, {
      headers: { "X-Api-Key": KEY() },
    });
    const status = st.data.status;
    if (status === "completed") {
      const out = tmpFile(".mp4");
      const resp = await axios.get(st.data.video_url, { responseType: "arraybuffer" });
      fs.writeFileSync(out, Buffer.from(resp.data));
      return out;
    }
    if (status === "failed") {
      throw new Error("HeyGen video failed: " + JSON.stringify(st.data.error || {}));
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error("HeyGen video timed out tras " + maxPolls + " intentos");
}

module.exports = { generateVideo, createPhotoAvatar, uploadAsset };
```

- [ ] **Step 2: Modificar `agent/routes/reels.js` — wiring de avatar + clientId + ruta de registro de perfil**

Reemplazar el contenido completo por:

```js
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const { createScriptGenerator } = require("../services/reels/script-generator");
const { createVoiceProvider } = require("../services/reels/voice");
const { createImageProvider } = require("../services/reels/images");
const { createReelEngine } = require("../services/reels/reel-engine");
const { createAvatarProvider } = require("../services/reels/avatar");
const { createMemoryAvatarProfiles, createPgAvatarProfiles } = require("../services/reels/avatar-profiles");
const { gemini, tts, measureDuration, gen } = require("../services/reels/gemini-providers");
const heygen = require("../services/reels/heygen-provider");
const { renderReel } = require("../remotion/render");

const router = express.Router();

// Carpeta pública para servir los MP4 (la necesita el Publicador de IG con URL pública).
const REELS_DIR = path.join(__dirname, "..", "public", "reels");
fs.mkdirSync(REELS_DIR, { recursive: true });

// Perfiles de avatar: Postgres si hay DATABASE_URL, memoria en dev.
let avatarProfiles;
if (process.env.DATABASE_URL) {
  const { pool } = require("../db/pool");
  avatarProfiles = createPgAvatarProfiles({ pool });
} else {
  console.warn("[reels] DATABASE_URL no definido — avatar profiles en MEMORIA (no persiste).");
  avatarProfiles = createMemoryAvatarProfiles();
}

const scriptGenerator = createScriptGenerator({ gemini });
const voice = createVoiceProvider({ tts, measureDuration });
const images = createImageProvider({ gen });
const avatar = process.env.HEYGEN_API_KEY ? createAvatarProvider({ heygen, voice }) : null;
const render = async (input) => {
  const out = path.join(REELS_DIR, "reel-" + crypto.randomBytes(8).toString("hex") + ".mp4");
  return renderReel(input, out);
};
const engine = createReelEngine({ scriptGenerator, voice, images, render, avatar });

// POST /api/reels/generate  body: { topic, clientId? }
// Si clientId tiene avatar profile CON consentimiento, el reel sale híbrido (avatar+broll).
router.post("/generate", async function (req, res) {
  try {
    const { topic, clientId } = req.body;
    if (!topic) return res.status(400).json({ error: "Falta topic" });

    let avatarId = null;
    if (clientId && avatar) {
      const profile = await avatarProfiles.getAuthorized(clientId);
      if (profile) avatarId = profile.heygenAvatarId;
    }

    const result = await engine.generate(topic, { avatarId });
    const fileName = path.basename(result.mp4Path);
    res.json({
      ok: true,
      caption: result.caption,
      hashtags: result.hashtags,
      publicUrl: "/widget/reels/" + fileName,
      usedAvatar: result.usedAvatar,
      degraded: result.degraded,
      reelSpec: result.reelSpec,
    });
  } catch (err) {
    console.error("[reels/generate]", err.message);
    res.status(500).json({ error: "Error generando el reel", detail: err.message });
  }
});

// POST /api/reels/avatar-profile  body: { clientId, displayName, heygenAvatarId, consentSigned }
// Registro manual del perfil (v1). El consentimiento escrito es responsabilidad del contrato.
router.post("/avatar-profile", async function (req, res) {
  try {
    const { clientId, displayName, heygenAvatarId, consentSigned } = req.body;
    if (!clientId || !heygenAvatarId) {
      return res.status(400).json({ error: "Falta clientId o heygenAvatarId" });
    }
    await avatarProfiles.save({
      clientId, displayName: displayName || clientId, heygenAvatarId,
      consentSigned: !!consentSigned,
      consentDate: consentSigned ? new Date().toISOString() : null,
    });
    res.json({ ok: true, clientId, consentSigned: !!consentSigned });
  } catch (err) {
    console.error("[reels/avatar-profile]", err.message);
    res.status(500).json({ error: "Error guardando avatar profile", detail: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 3: Env + README**

Añadir al final de `agent/.env.example`:

```
# ── Avatares (Fase 3) ────────────────────────────────────────
# HeyGen API (pay-as-you-go). Si falta, los reels salen 100% faceless.
HEYGEN_API_KEY=
```

Añadir en `agent/README.md`, dentro de la sección "🎬 Reels", al final:

```markdown
### 🎭 Avatares (Fase 3)

Si el `clientId` tiene un avatar profile **con consentimiento firmado**, el reel sale híbrido: el avatar del cliente (HeyGen, foto + nuestro audio TTS) abre con el gancho y cierra con el CTA; el resto es faceless. Si HeyGen falla, la escena degrada a faceless y el reel se genera igual (`degraded: true`).

| Método | URL | Descripción |
|--------|-----|-------------|
| `POST` | `/api/reels/avatar-profile` | Registra `{ clientId, displayName, heygenAvatarId, consentSigned }` |

Onboarding por persona: 1 foto → `createPhotoAvatar` (heygen-provider) o dashboard de HeyGen → guardar el id con consentimiento. Requiere `HEYGEN_API_KEY`; sin ella, todo sale faceless.
```

- [ ] **Step 4: Verificar carga + suite completa**

Run: `cd agent && node -e "require('./routes/reels'); console.log('reels route OK')"`
Expected: `reels route OK` (con warning de memoria si no hay DATABASE_URL).

Run: `cd agent && node --check server.js && npm test`
Expected: server OK y suite completa verde.

- [ ] **Step 5: Commit**

```bash
git add agent/services/reels/heygen-provider.js agent/routes/reels.js agent/.env.example agent/README.md
git commit -m "feat(avatar): heygen provider + hybrid route with consent-gated avatar profiles"
```

---

## Notas de cierre

- **Integración real (la hace José):** crear cuenta HeyGen pay-as-you-go (~$5), poner `HEYGEN_API_KEY` en `.env`, subir 1 foto suya → `createPhotoAvatar` → registrar perfil con `consentSigned: true` → `POST /api/reels/generate { topic, clientId }` → primer reel híbrido real. **Verificar entonces los endpoints exactos de HeyGen** (como hicimos con los IDs de Gemini — el código degrada a faceless si fallan).
- **Legal:** plantilla de cláusula de cesión de imagen (incluyendo procesamiento por HeyGen) para el contrato de Atiko — fuera del código, requerida antes de usar avatares de clientes reales.
- **Fuera de alcance:** clonado de voz, Veo cinematográfico, UI de onboarding, picture-in-picture.
