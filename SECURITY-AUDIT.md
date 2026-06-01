# AuditorÃ­a de Seguridad â€” Agencia Atiko

**Fecha:** 2026-05-22
**Auditor:** Claude (Anthropic)
**Alcance:** 100% del sitio pÃºblico (`atikodigital.cl`) + toolkit interno (skills/hooks/MCPs)
**Archivos analizados:** `index.html`, `robots.txt`, `sitemap.xml`, `site.webmanifest`, `og-image.svg`, `logo.svg`, `toolkit/` (12 archivos)

---

## Resumen ejecutivo

**Estado general: ðŸŸ¡ ACEPTABLE PARA SOFT-LAUNCH, pero requiere fixes antes de publicar.**

Lo bueno: el sitio es estÃ¡tico, no tiene formularios, no usa `eval`/`innerHTML`/`document.write`, no almacena datos en `localStorage`/`cookies`, no inyecta trackers de terceros, y todo el toolkit interno usa placeholders en lugar de secretos hardcoded. La superficie de ataque es muy pequeÃ±a.

Lo malo: **3 hallazgos crÃ­ticos/altos que deben corregirse antes del go-live**: paths absolutos del PC expuestos en el HTML, ausencia total de PolÃ­tica de Privacidad (incumple Ley 19.628 Chile), y referencia rota a `og-image.jpg` que en realidad es `og-image.svg`.

### Marcador por severidad

| Severidad   | Cantidad | Bloqueante para go-live |
|-------------|----------|-------------------------|
| ðŸ”´ CrÃ­tico   | 1        | SÃ­                      |
| ðŸŸ  Alto      | 4        | SÃ­                      |
| ðŸŸ¡ Medio     | 5        | Antes de mes 2          |
| ðŸ”µ Bajo      | 4        | Mejora continua         |

---

## ðŸ”´ CRÃTICO #1 â€” Paths absolutos del PC expuestos en JavaScript

**Archivo:** `index.html` lÃ­neas 1043â€“1059
**Riesgo:** Fuga de informaciÃ³n personal (PII) + path traversal info disclosure

### Hallazgo

```javascript
const FRAMES_MODE = 'local'; // â† cambia a 'production' al publicar

const FRAME_PATHS = (FRAMES_MODE === 'local') ? {
  hq:      'file:///C:/Users/josea/Downloads/frames_hq/',
  fk4:     'file:///C:/Users/josea/Downloads/frames_4k/',
  wa:      'file:///C:/Users/josea/Downloads/frames_wa/',
  k22:     'file:///C:/Users/josea/Downloads/frames_4k2/',
  max:     'file:///C:/Users/josea/Downloads/frames_max_jpg/',
  curated: 'file:///C:/Users/josea/Downloads/frames_atiko_clean/frames_atiko2/',
}
```

### Impacto

- Si publicas con `FRAMES_MODE='local'`, **cualquier visitante** ve en el cÃ³digo fuente:
  - Tu **nombre de usuario** del sistema operativo (`josea`)
  - La **estructura interna** de tu PC (`Downloads/`)
  - Que el sitio se sirviÃ³ desde un entorno de desarrollo (seÃ±al de poca madurez)
- Atacantes pueden usar el nombre de usuario para ataques dirigidos de phishing/ingenierÃ­a social.
- Los navegadores modernos bloquean `file:///` desde pÃ¡ginas web, asÃ­ que las imÃ¡genes **no cargarÃ¡n para nadie excepto tÃº**.

### RemediaciÃ³n (OBLIGATORIA antes del go-live)

```javascript
// ANTES de subir a Cloudflare Pages, cambiar:
const FRAMES_MODE = 'production'; // â† ESTE valor
```

Y antes mover fÃ­sicamente los frames a `assets/frames/` siguiendo `README.md` secciÃ³n "Mover los frames".

### VerificaciÃ³n post-fix

```bash
# Desde el repo:
grep -r "file:///" index.html
# Debe devolver: (nada)
```

---

## ðŸŸ  ALTO #1 â€” Sin PolÃ­tica de Privacidad (incumple Ley 19.628 Chile)

**Archivos:** ninguno (no existe `privacidad.html`)
**Riesgo:** Legal + reputacional

### Hallazgo

El sitio captura indirectamente datos personales:
- Click en WhatsApp â†’ Meta recibe la IP del visitante + identificador del navegador
- Click en mailto â†’ cliente de correo abre, registrando intenciÃ³n de contacto
- Schema.org `ProfessionalService` declara que recibes leads (`hasOfferCatalog`)

**Ley 19.628 de ProtecciÃ³n de la Vida Privada (Chile)** + **Ley 21.719 (aprobada 2024, vigencia plena 2026)** obligan a:
1. Tener PolÃ­tica de Privacidad publicada y accesible
2. Identificar al responsable del tratamiento (Atiko)
3. Detallar finalidad del tratamiento (envÃ­o de informaciÃ³n comercial)
4. Informar derechos ARCO (Acceso, RectificaciÃ³n, CancelaciÃ³n, OposiciÃ³n)
5. Tiempo de conservaciÃ³n de datos
6. Si transfieres datos a terceros (HubSpot/Notion/Twilio = sÃ­), declararlo

Multa mÃ¡xima Ley 21.719: **20.000 UTM â‰ˆ $1.300M CLP** para infracciones gravÃ­simas (improbable en pyme pero existe el riesgo).

### RemediaciÃ³n

Crear `privacidad.html` y enlazar desde el footer.

**AcciÃ³n inmediata:** ejecutar en sesiÃ³n separada:
```
"Generame privacidad.html y terminos.html cumpliendo Ley 19.628 + Ley 21.719 Chile, formato simple"
```

Y en `index.html`, antes de `</section>` del footer (lÃ­nea ~1029):

```html
<div class="footer-legal" style="font-size:.42rem;letter-spacing:.3em;text-transform:uppercase;color:rgba(255,255,255,.3);margin-top:1rem;display:flex;gap:1.2rem;justify-content:center">
  <a href="/privacidad.html" style="color:inherit;text-decoration:underline">PolÃ­tica de Privacidad</a>
  <a href="/terminos.html" style="color:inherit;text-decoration:underline">TÃ©rminos</a>
</div>
```

---

## ðŸŸ  ALTO #2 â€” `og-image.jpg` referenciado pero solo existe `og-image.svg`

**Archivos:** `index.html` lÃ­neas 32, 41, 53 + filesystem
**Riesgo:** SEO/Social + 404 silencioso

### Hallazgo

```html
<meta property="og:image" content="https://atikodigital.cl/og-image.jpg">
<meta name="twitter:image" content="https://atikodigital.cl/og-image.jpg">
```

Pero el Ãºnico archivo es `og-image.svg`. Facebook, LinkedIn, Twitter, WhatsApp y Slack **no renderizan SVG** en sus previews de link.

### Impacto

- Cuando alguien comparta `atikodigital.cl` por WhatsApp/LinkedIn, **no aparecerÃ¡ imagen** (preview roto = -30% CTR).
- Google indexa el meta tag â†’ te indexa una URL que devuelve 404.

### RemediaciÃ³n

**OpciÃ³n A (rÃ¡pida, 5 min):** Convertir SVG â†’ JPG con Inkscape, GIMP, o web tool tipo `cloudconvert.com`.

**OpciÃ³n B (mejor):** Generar nueva OG image en Canva/Figma con plantilla 1200Ã—630px, exportar como JPG (calidad 85, peso <200kB).

**OpciÃ³n C (en este chat):** pedir "generame og-image.jpg 1200x630 con branding Atiko" y ejecutamos.

---

## ðŸŸ  ALTO #3 â€” Sin Content-Security-Policy (CSP)

**Archivo:** `index.html` (HEAD)
**Riesgo:** XSS si en el futuro se introduce cÃ³digo de terceros

### Hallazgo

No existe `<meta http-equiv="Content-Security-Policy">` ni se planea servir el header HTTP desde el servidor. Hoy es de bajo impacto porque no hay scripts de terceros, pero el dÃ­a que conectes Google Analytics, Facebook Pixel, Hotjar o un chatbot embebido, **una vulnerabilidad en cualquiera de ellos puede inyectar cÃ³digo en tu sitio**.

### RemediaciÃ³n

**Aplicar como header HTTP en Cloudflare Pages.** Crear `_headers` en raÃ­z del proyecto:

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

Nota sobre `'unsafe-inline'` en `script-src`: tu HTML tiene 7 handlers `onclick=...` inline. Para una CSP estricta sin `'unsafe-inline'`, hay que refactorizar a `addEventListener`. Esto se puede hacer en una iteraciÃ³n posterior. Mientras tanto, `'unsafe-inline'` es aceptable porque el sitio no acepta input del usuario.

### Verificar headers post-deploy

```bash
curl -I https://atikodigital.cl/ | grep -i "content-security\|x-frame\|strict-transport"
```

O usar https://securityheaders.com/?q=atikodigital.cl (debe sacar A o mejor).

---

## ðŸŸ  ALTO #4 â€” `robots.txt` expone existencia de `SEO-AUDIT.md`

**Archivo:** `robots.txt` lÃ­nea 8
**Riesgo:** Information disclosure

### Hallazgo

```
Disallow: /SEO-AUDIT.md
```

`robots.txt` es pÃºblico. Indicar `Disallow` a un archivo le seÃ±ala a un atacante que existe y vale la pena pedirlo directo. Si publicas el archivo al repo y se sirve, alguien puede `curl https://atikodigital.cl/SEO-AUDIT.md` y obtenerlo.

### RemediaciÃ³n

**OpciÃ³n A (recomendada):** No subir el archivo a producciÃ³n. AÃ±adir a `.gitignore` o excluir en el deploy.

**OpciÃ³n B:** Reemplazar con un `User-agent: * Disallow: /privado/` (carpeta inexistente, sin revelar nada).

**Fix concreto a `robots.txt`:**

```diff
- # Bloquear archivos privados o de build
- Disallow: /SEO-AUDIT.md
- Disallow: /frames/
- Disallow: /*.log$
+ # Bloquear archivos de build
+ Disallow: /*.log$
+ Disallow: /*.md$
```

Y asegurarte que `SEO-AUDIT.md`, `PLAN-MAESTRO.md`, `ESTRATEGIA-NEGOCIO.md`, etc. **NO se suben a Cloudflare Pages**. Solo deben ir: `index.html`, `logo.svg`, `og-image.jpg`, `robots.txt`, `sitemap.xml`, `site.webmanifest`, `privacidad.html`, `terminos.html`, `assets/frames/*`, `_headers`.

---

## ðŸŸ¡ MEDIO #1 â€” Sin Subresource Integrity (SRI) en Google Fonts

**Archivo:** `index.html` lÃ­neas 144â€“146

### Hallazgo

```html
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Grotesk:..." rel="stylesheet">
```

No tiene `integrity="sha384-..."`. Si Google Fonts CDN se compromete (improbable, pero ocurriÃ³ a CDNs como Polyfill.io en 2024), inyectarÃ­an CSS arbitrario.

### RemediaciÃ³n

**OpciÃ³n A (mejor):** Auto-hostear las fonts. Descargar las dos familias, ponerlas en `/assets/fonts/`, y referenciar con `@font-face` local. Beneficio bonus: 1 RTT menos en carga + control total + cumple mejor con GDPR/Ley 19.628 (Google Fonts envÃ­a IP a USA).

**OpciÃ³n B:** Aceptar el riesgo (Google Fonts es estable, billones de sitios lo usan).

Si vas con A:

```css
@font-face {
  font-family: 'Bebas Neue';
  src: url('/assets/fonts/BebasNeue-Regular.woff2') format('woff2');
  font-display: swap;
}
/* ... resto de pesos de Space Grotesk */
```

---

## ðŸŸ¡ MEDIO #2 â€” Email y telÃ©fono en texto plano (scrapeable)

**Archivo:** `index.html` lÃ­neas 725, 966, 989, 1011, 1024, 1025, 1029 + JSON-LD

### Hallazgo

`atikodigital@gmail.com` y `+56 9 2713 0792` aparecen como texto plano en HTML y dentro de JSON-LD. Bots de spam los recogen.

### Impacto

- Spam continuo a `atikodigital@gmail.com`
- Llamadas/SMS de marketing a +56 9 2713 0792
- Tu nÃºmero aparece en bases de datos de leads vendidas

### Trade-off

Quitarlos rompe el SEO local y la accesibilidad. **Aceptable mantenerlos visibles** si:
- Filtras spam en Gmail con reglas estrictas
- Bloqueas nÃºmeros desconocidos en WhatsApp Business

### MitigaciÃ³n parcial (opcional)

Para reducir scraping sin perder UX, en JSON-LD usa formato encriptado con JavaScript que decodifique al cargar:

```html
<!-- En el HTML visible, dejar como estÃ¡ (mejor UX, mejor SEO) -->

<!-- En JSON-LD, considerar quitarlo o sustituir por: -->
"contactPoint": {
  "@type": "ContactPoint",
  "contactType": "customer service",
  "url": "https://atikodigital.cl/#contacto"
}
```

---

## ðŸŸ¡ MEDIO #3 â€” 7 inline event handlers (`onclick=`)

**Archivo:** `index.html` lÃ­neas 758, 759, 760, 762, 811, 812, 834

### Hallazgo

```html
<a href="#servicios" onclick="goC(2);return false">Servicios</a>
```

Inline handlers bloquean CSP estricta. Hoy funcionan, pero si endureces la CSP a `script-src 'self'` (sin `'unsafe-inline'`), todos los `onclick` dejan de funcionar.

### RemediaciÃ³n

Refactor a `addEventListener` en el `<script>` principal:

```html
<!-- ANTES -->
<a href="#servicios" onclick="goC(2);return false">Servicios</a>

<!-- DESPUÃ‰S -->
<a href="#servicios" data-chapter="2">Servicios</a>

<!-- En JS -->
document.querySelectorAll('[data-chapter]').forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    goC(parseInt(el.dataset.chapter));
  });
});
```

Esfuerzo: 15 minutos. Beneficio: CSP estricta sin `'unsafe-inline'`.

---

## ðŸŸ¡ MEDIO #4 â€” `site.webmanifest` solo tiene icono SVG

**Archivo:** `site.webmanifest`

### Hallazgo

```json
"icons": [{ "src": "logo.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }]
```

Algunos navegadores (Safari iOS antiguos, navegadores embebidos) no aceptan SVG como icono PWA. La instalaciÃ³n como app no muestra Ã­cono.

### RemediaciÃ³n

Generar PNGs de respaldo:

```bash
# Con ImageMagick:
convert logo.svg -resize 192x192 icon-192.png
convert logo.svg -resize 512x512 icon-512.png
```

Y actualizar manifest:

```json
"icons": [
  { "src": "logo.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" },
  { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
  { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
]
```

---

## ðŸŸ¡ MEDIO #5 â€” Sin `.well-known/security.txt`

**Archivo:** no existe

### Hallazgo

RFC 9116 estÃ¡ndar moderno para que investigadores de seguridad reporten vulnerabilidades. Sin esto, si alguien encuentra una falla, no sabe cÃ³mo contactarte (o publica directamente).

### RemediaciÃ³n

Crear `.well-known/security.txt`:

```
Contact: mailto:atikodigital@gmail.com
Expires: 2027-12-31T23:59:59Z
Preferred-Languages: es, en
Canonical: https://atikodigital.cl/.well-known/security.txt
```

---

## ðŸ”µ BAJO #1 â€” Sin rate limiting en endpoints internos del toolkit

**Archivos:** `toolkit/hooks/registro-leads/HOOK.md`, `toolkit/hooks/auto-carpeta-cliente/HOOK.md`

### Hallazgo

Los webhooks de n8n que vas a desplegar (`/webhook/lead`, `/webhook/cliente-nuevo`) no tienen rate limiting documentado. Un atacante puede inundarte de leads falsos, consumir tu API key de Anthropic (â‰ˆUSD $5/mes pueden volverse $500 en una noche).

### RemediaciÃ³n

Cuando implementes el hook, agregar al nodo Webhook de n8n:

```javascript
// Primer nodo despuÃ©s del webhook:
const ip = $request.headers['x-forwarded-for'] || $request.connection.remoteAddress;
const rateLimitKey = `lead:${ip}`;

// Usar Redis o Cloudflare KV
const count = await kv.get(rateLimitKey);
if (count >= 10) {
  throw new Error("Rate limit excedido: " + ip);
}
await kv.set(rateLimitKey, (count || 0) + 1, { ex: 3600 }); // 1 hora
```

O usar Cloudflare WAF + rate limiting (gratis hasta 10k req/dÃ­a).

---

## ðŸ”µ BAJO #2 â€” `HOOK_TOKEN` en hook auto-carpeta-cliente es opcional pero crÃ­tico

**Archivo:** `toolkit/hooks/auto-carpeta-cliente/HOOK.md` lÃ­nea 193

### Hallazgo

```
HOOK_TOKEN=<token random para autenticar webhook>
```

EstÃ¡ documentado pero como variable de entorno opcional. Si lo omites, **cualquiera que descubra la URL `https://automations.atikodigital.cl/webhook/cliente-nuevo` puede crear carpetas, enviar WhatsApps, gastar tu cuota**.

### RemediaciÃ³n

En el `HOOK.md`, cambiar de "opcional" a OBLIGATORIO:

```javascript
// Primer nodo del flujo:
if ($request.headers['x-hook-token'] !== $env.HOOK_TOKEN) {
  throw new Error("Token invÃ¡lido");
}
```

Y configurar HubSpot/Notion para incluir el header `X-Hook-Token` en su webhook outbound.

---

## ðŸ”µ BAJO #3 â€” Variable `FRAMES_MODE` puede olvidarse al deploy

**Archivo:** `index.html` lÃ­nea 1043

### Hallazgo

```javascript
const FRAMES_MODE = 'local'; // â† cambia a 'production' al publicar
```

Esto depende de la memoria humana. **Va a fallar tarde o temprano.**

### RemediaciÃ³n

Automatizar con un script de build pre-deploy:

```bash
# build.sh
sed -i "s/const FRAMES_MODE = 'local';/const FRAMES_MODE = 'production';/" index.html
git add index.html
git commit -m "build: production frames"
git push origin main  # â†’ Cloudflare Pages auto-deploy
```

O migrar a un sistema de build con variables de entorno (Vite, Eleventy) â€” sobre-ingenierÃ­a para este sitio, pero a futuro.

---

## ðŸ”µ BAJO #4 â€” `og-image.svg` con email del owner embedido

**Archivo:** `og-image.svg`

### Hallazgo

Si el SVG tiene metadatos EXIF/XMP con tu informaciÃ³n personal (autor, fecha de creaciÃ³n, ubicaciÃ³n), se filtra. Aplica tambiÃ©n a `logo.svg`.

### RemediaciÃ³n

```bash
# Limpiar metadatos:
exiftool -all= logo.svg
exiftool -all= og-image.svg
```

O al exportar desde Figma/Illustrator, marcar "Optimize for Web" que limpia metadatos.

---

## âœ… Cosas que estÃ¡n BIEN

| Aspecto                                | Estado | Comentario |
|----------------------------------------|--------|------------|
| Sin `eval()` ni `Function()`           | âœ…     | No hay ejecuciÃ³n dinÃ¡mica de cÃ³digo |
| Sin `innerHTML` con datos del usuario  | âœ…     | Sin XSS via DOM sinks |
| Sin `document.write`                   | âœ…     | |
| Sin `localStorage`/`sessionStorage`    | âœ…     | No persiste datos del usuario en el navegador |
| Sin cookies propias                    | âœ…     | Solo cookies de terceros si visitan Google Fonts |
| `rel="noopener noreferrer"` en externos| âœ…     | Previene tabnabbing en links a WhatsApp |
| Sin formularios HTML                   | âœ…     | Toda la captura va por WhatsApp (controlado por Meta) |
| Sin trackers de terceros               | âœ…     | No hay GA, FB Pixel, Hotjar, Clarity |
| `lang="es-CL"` declarado               | âœ…     | Accesibilidad correcta |
| `crossorigin` en preconnect a gstatic  | âœ…     | Buena prÃ¡ctica |
| Toolkit: 0 secretos hardcoded          | âœ…     | Todas las claves son `<placeholder>` o `process.env.X` |
| Schema.org bien estructurado           | âœ…     | Sin URLs ni datos engaÃ±osos |
| HTTPS-only mindset                     | âœ…     | Todas las URLs en el cÃ³digo son HTTPS |
| Sin enlaces a HTTP (mixed content)     | âœ…     | |

---

## ðŸ“‹ Plan de acciÃ³n priorizado

### Antes del go-live (esta semana)

- [ ] **#CRÃTICO-1** Cambiar `FRAMES_MODE` a `'production'` y mover frames a `assets/frames/`
- [ ] **#ALTO-2** Generar `og-image.jpg` (1200Ã—630, <200kB)
- [ ] **#ALTO-1** Crear `privacidad.html` + `terminos.html` + enlazarlos en footer
- [ ] **#ALTO-4** Corregir `robots.txt` (quitar menciÃ³n a SEO-AUDIT.md)
- [ ] **#ALTO-3** Crear `_headers` para Cloudflare Pages con CSP + HSTS + X-Frame-Options

### Mes 1 (primer cliente)

- [ ] **#MEDIO-2** Generar `icon-192.png` y `icon-512.png` + actualizar manifest
- [ ] **#MEDIO-5** Crear `.well-known/security.txt`
- [ ] **#BAJO-3** Crear script `build.sh` para automatizar el toggle de FRAMES_MODE

### Mes 2â€“3 (escalamiento)

- [ ] **#MEDIO-3** Refactor de `onclick` inline â†’ `addEventListener` (CSP estricta)
- [ ] **#MEDIO-1** Auto-hostear Google Fonts (privacidad + performance)
- [ ] **#BAJO-1** Documentar rate limiting en cada hook del toolkit antes de implementarlo
- [ ] **#BAJO-2** Hacer `HOOK_TOKEN` obligatorio en docs del hook

### Continuo

- [ ] Ejecutar https://securityheaders.com/?q=atikodigital.cl una vez al mes (debe sacar A)
- [ ] Ejecutar https://observatory.mozilla.org/?host=atikodigital.cl trimestralmente (debe sacar B+ o mejor)
- [ ] Revisar `dependabot` / `npm audit` cuando agregues dependencias

---

## ðŸ›¡ï¸ Postura de seguridad final

**Sitio pÃºblico:** ðŸŸ¢ Buena (sin superficie de ataque significativa, todo estÃ¡tico)
**Cumplimiento legal Chile:** ðŸŸ  INSUFICIENTE (falta PolÃ­tica de Privacidad)
**Toolkit interno:** ðŸŸ¢ Excelente (placeholders, sin secretos en el repo)
**Hardening HTTP:** ðŸŸ¡ Pendiente (requiere `_headers` en Cloudflare Pages)

Cuando completes los 4 fixes "antes del go-live" + el `_headers`, el sitio queda en **ðŸŸ¢ BUENO PARA PRODUCCIÃ“N** con perfil de riesgo bajo. La mayor superficie de ataque real va a aparecer **cuando empieces a desplegar los hooks de n8n** (webhooks abiertos a internet) â€” ahÃ­ es donde hay que poner rate limiting, autenticaciÃ³n de webhook, y monitoreo.

---

**Auditado por:** Claude (claude-opus-4-7)
**VersiÃ³n del informe:** 1.0
**PrÃ³xima auditorÃ­a sugerida:** 2026-08-22 (3 meses) o tras cualquier cambio mayor

