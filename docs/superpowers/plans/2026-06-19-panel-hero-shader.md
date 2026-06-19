# Panel — Fondo Hero Shader WebGL — Implementation Plan

> **For agentic workers:** este plan es un **checklist de edición + verificación visual** (HTML estático, sin tests automáticos). NO hay ciclo RED/GREEN. Ejecutar inline, verificando en Chrome entre pasos. Steps con checkbox (`- [ ]`).

**Goal:** Agregar un fondo animado tipo shader (mesh-gradient cian/naranja WebGL) detrás de TODO el panel, manteniendo intactas las tarjetas, pestañas, login y la lógica (`lib.js`).

**Architecture:** Editar SOLO `gastos/public/panel/index.html`: un `<canvas>` fijo de fondo (z-index 0) con un fragment shader vanilla, un `<div>` scrim para legibilidad, CSS de layering+glass, y un `<script>` de init WebGL con fallback. Sin build, sin deps, sin tocar backend ni `lib.js`.

**Tech Stack:** HTML/CSS/JS vanilla + WebGL. Tailwind y Chart.js ya por CDN. Deploy SFTP (`deploy-gastos-wt.js`).

**⚠️ Reglas:** Branch `master`. `git add` SOLO `gastos/public/panel/index.html`. NUNCA `git add -A`. Antigravity pausó el panel (confirmado por el usuario) → seguro editar; **avisar al terminar**. INSERTAR, no reestructurar el markup existente. No tocar `lib.js`.

---

### Paso 1: Re-leer los puntos de anclaje

- [ ] Abrir `gastos/public/panel/index.html` y confirmar:
  - El `<body>` (hoy línea ~798: `<body><!-- LOGIN -->`) y sus primeros hijos (`#loginView`, luego `#appView`).
  - El bloque `<style>` (CSS variables `--bg`, `--surface`, etc.; `.glass-card { background: rgba(9,9,11,0.8); ... }`; `.sidebar`).
  - **Identificar los contenedores con fondo OPACO** que taparían el shader: el `.sidebar` (`bg-[#121414]`), y el/los contenedor(es) de fondo del área principal/main de `#appView`. Anotar sus selectores reales (clase Tailwind o clase CSS) para el Paso 3. Las `.glass-card` ya son semi-transparentes (dejan ver algo del fondo).

---

### Paso 2: Insertar el canvas + scrim como primeros hijos del body

- [ ] Reemplazar la apertura `<body><!-- LOGIN -->` (línea ~798) por:

```html
<body><!-- HERO SHADER -->
<canvas id="heroShader" aria-hidden="true"></canvas>
<div id="heroScrim" aria-hidden="true"></div>
<!-- LOGIN -->
```

(Solo se insertan dos elementos justo después de `<body>`; el resto del body queda igual.)

---

### Paso 3: Agregar el CSS (layering + glass + scrim + fallback)

- [ ] Dentro del `<style>` existente (al final del bloque, antes de `</style>`), agregar:

```css
/* ===== Hero shader de fondo ===== */
#heroShader, #heroScrim { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 0; pointer-events: none; }
#heroShader { display: block; }
/* Scrim oscuro para legibilidad sobre el fondo en movimiento (ajustable) */
#heroScrim { background: radial-gradient(130% 120% at 50% 0%, rgba(8,10,14,0.35) 0%, rgba(8,10,14,0.62) 60%, rgba(8,10,14,0.78) 100%); }
/* El contenido va por encima del canvas/scrim */
#loginView, #appView { position: relative; z-index: 1; }
/* Glass: dejar ver el shader detrás de superficies antes opacas */
.sidebar { background: rgba(18,20,20,0.55) !important; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
/* Fallback sin WebGL: gradiente cian/naranja estático en el body */
body.no-webgl { background: linear-gradient(135deg, #000000 0%, #164e63 30%, #06b6d4 55%, #0891b2 70%, #f97316 100%) fixed !important; }
@media (prefers-reduced-motion: reduce) { #heroShader { /* el JS dibuja un frame estático */ } }
```

> **Glass del área principal:** además del `.sidebar`, si al verificar en Chrome (Paso 5) el shader NO se ve en el área de contenido porque su contenedor tiene fondo opaco, agregar aquí una regla que baje la opacidad de ESE contenedor (usar el selector real anotado en el Paso 1), p. ej. `.app-main { background: transparent !important; }` o `rgba(...,0.4)` con `backdrop-filter: blur(...)`. Ajustar `#heroScrim` (subir/bajar el alpha) hasta que números y textos se lean perfecto. Esta calibración es iterativa y visual.

---

### Paso 4: Agregar el `<script>` WebGL al final del body

- [ ] Justo antes de `</body>` (después de los scripts existentes / el `<script src=".../lib.js">` si está al final), insertar:

```html
<script>
(function () {
  var canvas = document.getElementById('heroShader');
  if (!canvas) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var gl = null;
  try { gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl'); } catch (e) { gl = null; }
  if (!gl) { document.body.classList.add('no-webgl'); canvas.style.display = 'none'; return; }

  var VS = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
  var FS = [
    'precision highp float;',
    'uniform float u_time; uniform vec2 u_res;',
    'const vec3 C1 = vec3(0.024,0.714,0.831);', // #06b6d4 cian
    'const vec3 C2 = vec3(0.031,0.569,0.698);', // #0891b2 teal
    'const vec3 C3 = vec3(0.086,0.306,0.388);', // #164e63 azul profundo
    'const vec3 C4 = vec3(0.976,0.451,0.086);', // #f97316 naranja
    'float blob(vec2 uv, vec2 c, float r){ return smoothstep(r, 0.0, length(uv - c)); }',
    'void main(){',
    '  vec2 uv = gl_FragCoord.xy / u_res.xy;',
    '  float ar = u_res.x / u_res.y;',
    '  vec2 p = vec2(uv.x * ar, uv.y);',
    '  float t = u_time * 0.18;',
    '  vec2 a = vec2((0.30 + 0.18*sin(t*1.10)) * ar, 0.42 + 0.20*cos(t*0.90));',
    '  vec2 b = vec2((0.72 + 0.16*cos(t*0.70)) * ar, 0.60 + 0.18*sin(t*1.30));',
    '  vec2 d = vec2((0.50 + 0.26*sin(t*0.50)) * ar, 0.30 + 0.22*cos(t*1.70));',
    '  vec2 e = vec2((0.82 + 0.14*sin(t*1.90)) * ar, 0.86 + 0.10*cos(t*1.20));',
    '  vec3 col = vec3(0.0);',
    '  col = mix(col, C3, blob(p, a, 0.62));',
    '  col = mix(col, C1, blob(p, b, 0.52));',
    '  col = mix(col, C2, blob(p, d, 0.46));',
    '  col = mix(col, C4, blob(p, e, 0.34) * 0.85);',
    '  col += 0.02;', // leve realce
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  }
  var prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
  } catch (e) { document.body.classList.add('no-webgl'); canvas.style.display = 'none'; return; }

  gl.useProgram(prog);
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var uTime = gl.getUniformLocation(prog, 'u_time');
  var uRes = gl.getUniformLocation(prog, 'u_res');

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.floor(window.innerWidth * dpr), h = Math.floor(window.innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  }
  window.addEventListener('resize', resize);
  resize();

  function draw(time) {
    gl.uniform1f(uTime, time);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  var raf = null, t0 = Date.now();
  function frame() { resize(); draw((Date.now() - t0) / 1000); raf = requestAnimationFrame(frame); }
  function start() { if (!raf) raf = requestAnimationFrame(frame); }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });

  if (reduce) { resize(); draw(4.0); } else { start(); }
})();
</script>
```

---

### Paso 5: Verificar en Chrome (visual)

- [ ] Abrir el panel en el navegador (vía Chrome MCP): preferible la URL desplegada DESPUÉS del deploy, pero para iterar rápido se puede abrir el archivo local `file:///.../gastos/public/panel/index.html` (el shader + layout se ven aunque el login no autentique contra el backend). Confirmar:
  - El **shader anima** de fondo (mesh-gradient cian/naranja fluido), a pantalla completa.
  - En **login** y en **dashboard** (entrando con credenciales reales sobre la URL desplegada) los textos/números se **leen perfecto** sobre el fondo → si no, subir el alpha de `#heroScrim` y/o bajar transparencia de las superficies.
  - El **sidebar** deja ver algo del shader detrás (glass), pero las tabs/labels se leen bien.
  - Las **pestañas** (Gastos/Empleados/.../Agente IA), tarjetas y **charts** siguen funcionando igual (el canvas es `pointer-events:none`, no bloquea clicks).
  - **Consola sin errores** (especialmente sin errores de compilación de shader).
  - **Fallback:** forzar `prefers-reduced-motion` (DevTools → Rendering → Emulate CSS prefers-reduced-motion) → el fondo queda **estático** (un frame), sin animar. (El fallback `no-webgl` se confía por código; opcional probarlo deshabilitando WebGL.)
- [ ] Ajustar scrim/glass iterativamente hasta que el balance "se ve el shader" ↔ "todo legible" quede bien.

---

### Paso 6: Commit + deploy + verificar en producción

- [ ] Commit (SOLO el panel):
```bash
cd "C:/Users/josea/Desktop/proyectos/paginas web/atiko/HASH IA"
git rev-parse --abbrev-ref HEAD   # master
git add gastos/public/panel/index.html
git commit -m "feat(panel): fondo hero shader WebGL (mesh-gradient cian/naranja detrás de todo)"
```
- [ ] Deploy: `node deploy-gastos-wt.js` (SFTP — sube `index.html`, no compila). Confirmar `=== deploy worktree OK ===` y `HEALTH ok`.
- [ ] Verificar en **https://gastos.atikodigital.cl/panel** (Chrome MCP): shader anima, login y dashboard legibles, sin errores. Forzar refresco si hay caché.
- [ ] **Avisar al usuario** que el panel quedó tocado y desplegado, para que coordine el retorno de Antigravity a ese archivo.

---

## Self-Review

**1. Spec coverage:**
- Canvas WebGL de fondo + fragment shader cian/naranja animado → Pasos 2,4 ✅
- "Detrás de todo": layering (z-index) + glass de superficies + cuerpo transparente cubierto por canvas → Paso 3 ✅
- Scrim de legibilidad ajustable → Paso 3 + calibración Paso 5 ✅
- Rendimiento/robustez: pausa en visibilitychange, dpr≤2, prefers-reduced-motion (frame estático), fallback sin WebGL (clase `no-webgl` + gradiente CSS) → Paso 4 (script) + Paso 3 (CSS) ✅
- Fuera de alcance (copy marketing/nav/orbe) → no se agregan (solo canvas+scrim+style+script) ✅
- No tocar lib.js/lógica/pestañas → Pasos insertan, no reestructuran ✅
- Verificación visual en Chrome + deploy SFTP + avisar a Antigravity → Pasos 5,6 ✅

**2. Placeholder scan:** El único punto "a confirmar al leer" es el selector real del contenedor de fondo del área principal (Paso 1/3) — es intrínseco a integrar con un archivo existente cuyo markup hay que mirar, no un placeholder de lógica; el código del canvas, CSS base y shader están completos.

**3. Consistencia:** `#heroShader`/`#heroScrim`/`body.no-webgl`/`#loginView`/`#appView` usados igual en CSS (Paso 3) y JS (Paso 4). Uniforms `u_time`/`u_res` consistentes entre shader y JS. Colores = los del spec (#06b6d4/#0891b2/#164e63/#f97316 + negro base). ✅
