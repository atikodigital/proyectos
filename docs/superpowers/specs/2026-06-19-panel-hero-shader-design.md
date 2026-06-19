# Panel web — fondo "hero" shader animado — Diseño

**Fecha:** 2026-06-19
**Producto:** panel web del dueño de Hash IA (`gastos.atikodigital.cl/panel`). Repo `HASH IA`, branch `master`.
**Alcance:** darle al panel un **fondo animado tipo shader** (mesh gradient cian/naranja sobre negro) detrás de todo el contenido, **manteniendo intactas** las tarjetas, pestañas, login y la lógica actual. Inspirado en un componente de 21st.dev (`@paper-design/shaders-react` MeshGradient + PulsingBorder), pero re-implementado para el panel.

## Contexto (estado actual)
- `gastos/public/panel/index.html` (~2632 líneas) + `gastos/public/panel/lib.js` (~334) — **HTML estático** servido por Express en `/panel`. **Sin build step.** Deploy por SFTP (`deploy-gastos-wt.js`).
- Identidad: tema **oscuro** (`#121414`, `#292a2a`) + acento **dorado `#ffd700`** (logo, tabs activas, botones). Fuentes Inter/Outfit/Hanken/JetBrains/Material Symbols. **Tailwind por CDN** (`cdn.tailwindcss.com`), **Chart.js por CDN**.
- Layout: pantalla de **login** (card centrada) → `#appView` con **sidebar** (izq., tabs Gastos/Empleados/Productos/Auxiliares/Ajustes/Contabilidad/CRM/Agente IA) + área de contenido con tarjetas.
- ⚠️ Este archivo es **el que Antigravity edita más**; el usuario confirmó que **Antigravity pausó/terminó el panel** → seguro editarlo ahora. Al terminar, commitear y avisar para que Antigravity retome.

## Decisiones (del usuario, vía brainstorming)
1. **Coordinación:** Antigravity terminó con el panel → tomo `index.html`, hago el cambio, commiteo y aviso.
2. **Ubicación:** el shader va de **fondo detrás de TODO** el panel; tarjetas y sidebar flotan encima con efecto glass.
3. **Paleta:** **cian/naranja tal cual el original** (`#000000 · #06b6d4 · #0891b2 · #164e63 · #f97316`). No recolorear a dorado.
4. **Técnica:** **shader WebGL propio embebido** (fragment shader vanilla, sin librería externa ni CDN), con fallback.

## Diseño

### 1. Canvas de fondo (`#heroShader`)
- Un `<canvas id="heroShader">` con `position:fixed; inset:0; width:100vw; height:100vh; z-index:0; pointer-events:none;` como primer elemento del `<body>` (detrás de todo).
- Render: **WebGL** (contexto `webgl`), un quad de pantalla completa + un **fragment shader** que produce un mesh-gradient animado mezclando negro + los 4 colores cian/teal/naranja con campos de seno/ruido suaves, desplazados por un uniform `u_time`. Una segunda capa sutil (líneas/wireframe tenue) como el `MeshGradient` secundario del original (baja opacidad), lograda dentro del mismo shader.
- Loop con `requestAnimationFrame`; `u_time` avanza lento (equivalente a `speed≈0.3`).

### 2. Layering / "detrás de todo"
- El contenido del panel (login + `#appView`) queda en `z-index ≥ 1` (posicionado sobre el canvas).
- Para que el shader se VEA, los fondos opacos del área principal y el `<body>` se vuelven **transparentes**; sidebar y tarjetas adoptan look **glass** (fondo semi-transparente `rgba(...)` + `backdrop-filter: blur()`), reutilizando el patrón `glass-card` ya presente. Donde un fondo deba seguir sólido por legibilidad, se baja la opacidad lo justo.

### 3. Scrim de legibilidad
- Una capa fija `#heroScrim` (`position:fixed; inset:0; z-index:0; pointer-events:none;`) por encima del canvas y por debajo del contenido, con un degradado/te oscuro semi-transparente (~`rgba(8,10,14,0.55)`, ajustable) para garantizar contraste de textos/números sobre el fondo en movimiento. Se calibra hasta que todo se lea bien.

### 4. Rendimiento y robustez
- **Pausa en segundo plano:** `document.visibilitychange` → cancelar el `requestAnimationFrame` cuando la pestaña está oculta; reanudar al volver.
- **Resolución acotada:** render a `devicePixelRatio` limitado (`min(dpr, 2)`), o a una fracción del tamaño para abaratar fill-rate.
- **`prefers-reduced-motion: reduce`:** dibujar **un solo frame estático** (sin loop).
- **Fallback sin WebGL:** si `getContext('webgl')` falla, no se crea el canvas y el `<body>`/scrim muestran un **gradiente CSS estático** cian/naranja (clase fallback), de modo que el panel nunca queda en negro plano ni roto.
- Shader barato (pocas instrucciones) por correr detrás de un dashboard de larga vida.

### 5. Fuera de alcance (lo del componente que NO se trae)
- Copy de marketing ("Beautiful Shader Experiences"), nav Features/Pricing/Docs, botón Login "gooey", y el texto rotante "21st.dev / Loxt-Mozzi" — son de una landing, no del panel.
- Orbe `PulsingBorder` decorativo abajo-derecha: **opcional, por defecto NO** (evita recargar el dashboard). Se puede agregar después como flourish (SVG + CSS).
- No se toca `lib.js`, ni la lógica, ni los endpoints, ni las pestañas/tarjetas (solo su estilo de fondo para volverse glass).

### Componentes / archivos
- `gastos/public/panel/index.html` — único archivo modificado: (a) `<canvas id="heroShader">` + `#heroScrim` al inicio del body; (b) un `<style>` con el layering (z-index), el glass de superficies, el scrim y el fallback CSS; (c) un `<script>` (vanilla, al final del body) con el init WebGL + shader + loop + guardas (visibility, reduced-motion, fallback).
- Sin dependencias nuevas, sin build, sin cambios de backend.

### Manejo de errores
- Cualquier fallo del WebGL (contexto, compilación de shaders) → `try/catch` → activar fallback CSS, nunca romper el panel.
- El canvas es `pointer-events:none` → no interfiere con clicks del panel.

### Testing / verificación
- El panel **no tiene tests automáticos** (HTML estático). Verificación **manual en navegador** (Chrome MCP) antes y después del deploy:
  - El shader anima (cian/naranja fluido) de fondo.
  - Login y dashboard se renderizan encima y se **leen bien** (contraste OK con el scrim).
  - Las pestañas/tarjetas/charts siguen funcionando (no se rompió el layout ni la lógica).
  - Sin errores en consola.
  - Fallback: con `prefers-reduced-motion` → frame estático; sin WebGL → gradiente CSS.
- Deploy con `deploy-gastos-wt.js` (SFTP, no compila). Avisar a Antigravity al terminar.

## Siguiente paso
Aprobar → `writing-plans`.
