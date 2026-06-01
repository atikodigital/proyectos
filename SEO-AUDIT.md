# AuditorÃ­a SEO â€” Agencia Atiko

**Sitio:** Agencia Atiko (no publicado aÃºn)
**UbicaciÃ³n:** Santiago, Chile
**Servicios:** PÃ¡ginas Web Â· Agentes IA Â· Marketing Digital
**Fecha auditorÃ­a:** 2026-05-21
**Archivos analizados:** `index.html` (924 lÃ­neas, 40 KB), `logo.svg`

---

## TL;DR â€” Veredicto

El sitio es **visualmente excelente** (scroll cinematogrÃ¡fico con canvas + frames, dark mode dorado, tipografÃ­a coherente), pero como pieza SEO estÃ¡ **en estado crÃ­tico**. En su forma actual, Google indexarÃ¡ una pÃ¡gina casi vacÃ­a con tÃ­tulo y dos headings, sin descripciÃ³n, sin datos estructurados, sin Open Graph, sin sitemap, y con un bug fatal: **los frames del fondo se cargan desde `file:///C:/Users/josea/Downloads/...`**, lo que significa que el sitio **no funcionarÃ¡ para nadie excepto en tu PC**.

**Prioridad de trabajo:**
1. ðŸ”´ Arreglar el bug de los frames (sin esto nada mÃ¡s importa)
2. ðŸ”´ Meta description + Open Graph + favicon
3. ðŸŸ  Contenido textual real indexable + H1/H2 con keywords
4. ðŸŸ  Datos estructurados (LocalBusiness / Organization)
5. ðŸŸ¡ Arquitectura: pasar de single-page a multi-page con landings por servicio
6. ðŸŸ¡ robots.txt + sitemap.xml + Search Console

---

## 1. Hallazgos por severidad

### ðŸ”´ CRÃTICOS â€” bloquean publicaciÃ³n

#### C1. Frames cargados desde rutas locales del PC (lÃ­neas 519â€“539)

```js
const HQ_PATH  = 'file:///C:/Users/josea/Downloads/frames_hq/';
const FK4_PATH = 'file:///C:/Users/josea/Downloads/frames_4k/';
const WA_PATH  = 'file:///C:/Users/josea/Downloads/frames_wa/';
const K22_PATH = 'file:///C:/Users/josea/Downloads/frames_4k2/';
const MAX_PATH = 'file:///C:/Users/josea/Downloads/frames_max_jpg/';
const CURATED_PATH = 'file:///C:/Users/josea/Downloads/frames_atiko_clean/frames_atiko2/';
```

**Impacto:** El sitio se rompe completamente al publicarlo. Los navegadores bloquean `file://` desde sitios HTTP/HTTPS. Adicionalmente, son ~907 frames (160+245+144+240+118+~6) que pesan probablemente cientos de MB.

**Fix:**
- Mover los frames a `/assets/frames/<grupo>/` dentro del proyecto.
- Cambiar las rutas a relativas: `'assets/frames/hq/'`.
- **Comprimir agresivamente** los JPGs (calidad 70â€“80, redimensionar a la resoluciÃ³n mÃ¡xima que se va a renderizar â€” 1920px de ancho probablemente suficiente).
- Considerar convertir a **WebP** o **AVIF** para reducir 30â€“50% mÃ¡s.
- Cargar HQ de forma bloqueante (loader) y los demÃ¡s con `loading="lazy"` o por demanda segÃºn capÃ­tulo.

#### C2. Sin meta description

Solo tienes `<meta charset>` y `<meta viewport>`. Google generarÃ¡ un snippet automÃ¡tico y a veces malo. EstÃ¡s perdiendo CTR antes incluso de empezar.

**Fix (pegar dentro de `<head>`):**

```html
<meta name="description" content="Agencia Atiko Â· Santiago, Chile. DiseÃ±amos pÃ¡ginas web, agentes de IA y campaÃ±as de marketing digital que generan resultados reales. Cotiza tu proyecto.">
```

Reglas: 150â€“160 caracteres, keyword principal al inicio, una propuesta de valor clara, CTA al final.

#### C3. Sin Open Graph ni Twitter Cards

Al compartir en WhatsApp, LinkedIn, X, Slack, etc., aparece sin preview. Para una agencia digital esto es especialmente grave: la marca **es** el producto.

**Fix:**

```html
<meta property="og:type" content="website">
<meta property="og:locale" content="es_CL">
<meta property="og:site_name" content="Agencia Atiko">
<meta property="og:title" content="Agencia Atiko â€” PÃ¡ginas Web Â· Agentes IA Â· Marketing Digital">
<meta property="og:description" content="DiseÃ±amos presencias digitales que marcan la diferencia. Santiago, Chile.">
<meta property="og:url" content="https://atikodigital.cl/">
<meta property="og:image" content="https://atikodigital.cl/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Agencia Atiko â€” PÃ¡ginas Web Â· Agentes IA Â· Marketing Digital">
<meta name="twitter:description" content="DiseÃ±amos presencias digitales que marcan la diferencia.">
<meta name="twitter:image" content="https://atikodigital.cl/og-image.jpg">
```

Crea una imagen 1200Ã—630 (`og-image.jpg`) con el logo + tagline sobre fondo negro/dorado. PÃ©sala bajo 500 KB.

#### C4. Sin favicon ni manifest

```html
<link rel="icon" type="image/svg+xml" href="/logo.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#000000">
```

#### C5. Contenido indexable casi inexistente

Google ve un `<body>` con:
- 1 `<h1>` con texto roto por `<br>` ("TRANSFOR-MAMOS TU NEGOCIO")
- 1 `<h2>` ("HABLEMOS DE TU PROYECTO")
- ~12 lÃ­neas de texto en overlays
- 0 pÃ¡rrafos extensos
- 0 imÃ¡genes con alt descriptivo (las 2 que existen dicen `alt="Atiko"`)
- Toda la "ficha" visual estÃ¡ en `<canvas>` â€” **no indexable**

**Densidad de palabra clave de tus servicios:** "pÃ¡ginas web" aparece 3 veces, "agentes IA" 2, "marketing digital" 2. Es muy poco para rankear contra agencias establecidas.

**Fix mÃ­nimo:** aÃ±ade una secciÃ³n textual debajo del fold de cada servicio con 150â€“250 palabras explicando: quÃ© incluye, para quiÃ©n es, casos tÃ­picos, tecnologÃ­as. Puede estar visualmente discreta o incluso colapsable, pero **debe estar en el DOM**.

---

### ðŸŸ  ALTOS â€” corregir antes de promocionar el sitio

#### A1. Bug semÃ¡ntico en el H1

```html
<h1 class="ph glow sg" style="margin-top:.7rem">
  TRANSFOR-<br>MAMOS TU<br><span class="grad">NEGOCIO</span>
</h1>
```

El `<br>` parte la palabra "TRANSFORMAMOS" en "TRANSFOR" + "MAMOS". Google lee literalmente eso. Peor: el H1 estÃ¡ en el capÃ­tulo 2 (Propuesta), no en el hero â€” deberÃ­a estar arriba.

**Fix:**
```html
<!-- En el hero (#ch0), encima del badge -->
<h1 class="visually-hidden">Agencia Atiko â€” PÃ¡ginas Web, Agentes IA y Marketing Digital en Santiago, Chile</h1>
```
Y en el capÃ­tulo Propuesta, convierte el actual H1 a H2 (o usa CSS `word-break` correcto sin partir la palabra):
```html
<h2 class="ph glow sg">Transformamos tu <span class="grad">negocio</span></h2>
```

Para que el H1 sea visualmente oculto pero indexable:
```css
.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
```

#### A2. Enlaces con `href="#"` rompen accesibilidad y SEO

```html
<a href="#" class="nav-logo">
<li><a href="#" onclick="goC(2);return false">Servicios</a></li>
```

Google evalÃºa el grafo interno por `href`. Todos tus enlaces internos apuntan a `#`, lo que es ruido.

**Fix:** usa fragmentos reales:
```html
<a href="/" class="nav-logo">
<li><a href="#servicios" onclick="goC(2);return false">Servicios</a></li>
<li><a href="#proceso"   onclick="goC(3);return false">Proceso</a></li>
<li><a href="#contacto"  onclick="goC(5);return false">Contacto</a></li>
<a href="#cotizar" class="nav-cta" onclick="goC(4);return false">Cotiza tu proyecto</a>
```
Y aÃ±ade `id="servicios"`, `id="proceso"`, etc., a los respectivos `<div>` de capÃ­tulos.

#### A3. Sin datos estructurados (Schema.org)

Una agencia local sin `LocalBusiness` schema desperdicia el rich result de Google.

**Fix:** pegar antes de `</head>`:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  "name": "Agencia Atiko",
  "url": "https://atikodigital.cl",
  "logo": "https://atikodigital.cl/logo.svg",
  "image": "https://atikodigital.cl/og-image.jpg",
  "description": "Agencia digital especializada en pÃ¡ginas web, agentes de IA y marketing digital.",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Santiago",
    "addressCountry": "CL"
  },
  "telephone": "+56-9-2713-0792",
  "email": "atikodigital@gmail.com",
  "areaServed": { "@type": "Country", "name": "Chile" },
  "sameAs": [
    "https://wa.me/56927130792"
  ],
  "hasOfferCatalog": {
    "@type": "OfferCatalog",
    "name": "Servicios",
    "itemListElement": [
      { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "DiseÃ±o de pÃ¡ginas web" }},
      { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Agentes de IA y automatizaciÃ³n" }},
      { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Marketing Digital" }}
    ]
  }
}
</script>
```

Valida despuÃ©s en [Schema Markup Validator](https://validator.schema.org/) y [Rich Results Test](https://search.google.com/test/rich-results).

#### A4. Sin canonical

```html
<link rel="canonical" href="https://atikodigital.cl/">
```

Previene contenido duplicado por parÃ¡metros de tracking (`?utm_source=...`).

#### A5. `lang="es"` deberÃ­a ser `lang="es-CL"`

Mejora el geo-targeting de Google y la voz adecuada para lectores de pantalla.

```html
<html lang="es-CL">
```

#### A6. Sin robots.txt ni sitemap.xml

Crea `/robots.txt`:
```
User-agent: *
Allow: /

Sitemap: https://atikodigital.cl/sitemap.xml
```

Crea `/sitemap.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://atikodigital.cl/</loc>
    <lastmod>2026-05-21</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```

#### A7. WhatsApp link inseguro

```html
<a href="https://wa.me/56927130792" class="btn-gh">WhatsApp</a>
```

**Fix:** aÃ±ade `rel="noopener noreferrer"` y `target="_blank"`:
```html
<a href="https://wa.me/56927130792" target="_blank" rel="noopener noreferrer" class="btn-gh">WhatsApp</a>
```

#### A8. Performance: Google Fonts bloqueantes

Cargas Bebas Neue + Space Grotesk (7 pesos) sin `display=swap` Ã³ptimo y sin self-hosting. Google Fonts aÃ±ade ~200â€“400 ms de delay y empuja LCP.

**Fix recomendado (self-host):**
1. Descargar las fuentes desde [google-webfonts-helper](https://gwfh.mranftl.com/fonts).
2. Servirlas desde `/assets/fonts/` con `font-display: swap`.
3. Solo cargar los pesos que usas (revisÃ©: usas 400/500/600/700 de Space Grotesk + 400 de Bebas â€” son 5 archivos, no 7).
4. AÃ±adir `<link rel="preload" as="font" type="font/woff2" crossorigin>` para los crÃ­ticos.

#### A9. Performance: imÃ¡genes pesadas sin priorizaciÃ³n

Cargas 5 colecciones de frames en paralelo desde `loadFrames()`, antes de que el usuario llegue a esos capÃ­tulos. Si las imÃ¡genes pesan 100 KB cada una, eso son **~90 MB** sirviÃ©ndose en background.

**Fix:**
- Cargar solo HQ al inicio (bloqueante).
- Esperar a que el usuario llegue al capÃ­tulo anterior para precargar el siguiente.
- Reducir el nÃºmero de frames (Â¿de verdad necesitas 245 frames a 4K para un capÃ­tulo? Probablemente con 80 funciona idÃ©ntico a 60 fps).

---

### ðŸŸ¡ MEDIOS â€” pulir tras lanzar

#### M1. Alt text repetitivo

Las 2 `<img>` dicen `alt="Atiko"`. Una estÃ¡ en el loader y otra en el nav. El alt debe describir el contexto:

```html
<img src="logo.svg" alt="Logotipo Atiko" class="ls-svg">
<img src="logo.svg" alt="Inicio â€” Agencia Atiko" class="nav-logo-img">
```

#### M2. Falta `<noscript>`

Todo el contenido depende de JS. Si JS falla o un crawler primitivo no lo ejecuta (Googlebot sÃ­, pero Bing y bots de redes sociales son menos confiables), no ve nada.

```html
<noscript>
  <div style="padding:2rem;color:#fff;background:#000;font-family:sans-serif">
    <h1>Agencia Atiko</h1>
    <p>DiseÃ±amos pÃ¡ginas web, agentes de IA y campaÃ±as de marketing digital. Santiago, Chile.</p>
    <p>Contacto: <a href="mailto:atikodigital@gmail.com">atikodigital@gmail.com</a> Â· <a href="https://wa.me/56927130792">+56 9 2713 0792</a></p>
  </div>
</noscript>
```

#### M3. Sin Google Analytics / GTM / Search Console

Sin mediciÃ³n no hay SEO. Conecta al menos:
- **Google Search Console** (verifica el dominio con DNS o meta tag)
- **Google Analytics 4** (GA4) o un equivalente privacy-first como **Plausible**

Meta tag de verificaciÃ³n (Search Console):
```html
<meta name="google-site-verification" content="TU_TOKEN_AQUI">
```

#### M4. Single-page sin segmentaciÃ³n de keywords

Toda tu propuesta vive en una sola URL. Eso te impide rankear con pÃ¡ginas distintas para keywords distintas (ver SecciÃ³n 2 â€” Arquitectura).

#### M5. `#track` con 700vh vacÃ­o

```html
<div id="track"></div>
<style>#track{height:700vh;width:100%}</style>
```

Es necesario para el scroll, pero Google ve un `<div>` enorme vacÃ­o. Considera anidar el contenido textual dentro de Ã©l como secciones reales (no solo overlays absolutos) para que el orden semÃ¡ntico sea claro.

#### M6. `<title>` con guiÃ³n largo `â€”` (em-dash)

```
Agencia Atiko â€” PÃ¡ginas Web Â· Agentes IA Â· Marketing Digital
```

EstÃ¡ bien estÃ©ticamente, pero pierdes una keyword localizadora. Sugerencia:
```
Agencia Atiko | PÃ¡ginas Web, Agentes IA y Marketing Digital en Chile
```
55â€“60 caracteres es el sweet spot.

#### M7. Email visible sin protecciÃ³n

`atikodigital@gmail.com` aparece en el HTML estÃ¡tico. Lo van a scrapear bots de spam en cuanto publiques. Opciones:
- Aceptarlo y usar filtros agresivos en Gmail.
- Ofuscar con JS al hacer click.
- Reemplazar por un formulario.

#### M8. `<meta name="author">` y `<meta name="generator">` ausentes (opcional, baja prioridad)

---

### ðŸŸ¢ BAJOS â€” nice-to-have

- **Breadcrumbs schema** una vez tengas multi-page.
- **FAQ schema** si aÃ±ades secciÃ³n de preguntas frecuentes.
- **Reviews/AggregateRating schema** cuando tengas testimonios.
- **Imagen del logo en formato PNG ademÃ¡s de SVG** para compatibilidad con crawlers viejos.
- **Sitemap.xml dinÃ¡mico** cuando tengas blog.
- **Preload de imÃ¡genes crÃ­ticas** (`<link rel="preload" as="image">`).

---

## 2. Arquitectura â€” Recomendaciones estratÃ©gicas

### Estado actual

```
atikodigital.cl/
â””â”€â”€ index.html  (todo en una sola URL, todo en un solo <h1>/<h2>)
```

**Problema:** intentas rankear con una sola URL contra **tres mercados distintos**:
- "diseÃ±o de pÃ¡ginas web santiago"
- "agencia de IA chile"
- "agencia de marketing digital chile"

Estos son tres clusters de keywords con intenciÃ³n y competencia distinta. Una pÃ¡gina Ãºnica no gana contra agencias con landings dedicadas.

### Arquitectura recomendada (multi-page)

```
atikodigital.cl/
â”œâ”€â”€ /                              â†’ Home (la pieza visual cinemÃ¡tica actual)
â”œâ”€â”€ /servicios/
â”‚   â”œâ”€â”€ paginas-web/               â†’ Landing dedicada Â· keyword: "diseÃ±o web santiago"
â”‚   â”œâ”€â”€ agentes-ia/                â†’ Landing dedicada Â· keyword: "chatbot ia chile"
â”‚   â””â”€â”€ marketing-digital/         â†’ Landing dedicada Â· keyword: "agencia marketing digital"
â”œâ”€â”€ /proceso/                      â†’ CÃ³mo trabajamos (detalle)
â”œâ”€â”€ /casos/                        â†’ Portfolio (1 pÃ¡gina por caso)
â”‚   â”œâ”€â”€ /casos/cliente-1/
â”‚   â””â”€â”€ /casos/cliente-2/
â”œâ”€â”€ /nosotros/                     â†’ Sobre el equipo, valores
â”œâ”€â”€ /blog/                         â†’ Contenido de captaciÃ³n SEO
â”‚   â””â”€â”€ /blog/[slug]/
â”œâ”€â”€ /contacto/
â”œâ”€â”€ /robots.txt
â”œâ”€â”€ /sitemap.xml
â””â”€â”€ /og-image.jpg
```

### Por quÃ© este split

| PÃ¡gina | Keyword principal | Volumen estimado (CL) | IntenciÃ³n |
|--------|-------------------|----------------------|-----------|
| `/servicios/paginas-web/` | diseÃ±o de pÃ¡ginas web santiago | medio-alto | comercial |
| `/servicios/agentes-ia/` | agentes ia chile / chatbot ia | bajo pero creciente | comercial / exploratoria |
| `/servicios/marketing-digital/` | agencia marketing digital chile | alto | comercial |
| `/blog/como-elegir-agencia-web/` | (long-tail informativas) | medio | informativa |

Cada landing debe tener:
- H1 con keyword exacta + variante geogrÃ¡fica
- 800â€“1.500 palabras de contenido Ãºnico
- 3â€“5 imÃ¡genes con alt descriptivo
- CTA hacia formulario o WhatsApp
- Schema `Service` especÃ­fico
- Internal link a 2â€“3 pÃ¡ginas relacionadas

### Plan de blog (12 posts iniciales, captaciÃ³n)

Sugerencias de tÃ­tulos basadas en intenciÃ³n de bÃºsqueda en Chile:

1. Â¿CuÃ¡nto cuesta una pÃ¡gina web en Chile? (2026)
2. WordPress vs Webflow vs cÃ³digo a medida: Â¿quÃ© le conviene a tu pyme?
3. CÃ³mo un agente de IA puede atender 80% de tus consultas en WhatsApp
4. SEO local en Santiago: guÃ­a paso a paso
5. Meta Ads vs Google Ads para servicios profesionales en Chile
6. CÃ³mo medir el ROI real de tu marketing digital
7. 7 errores comunes al pedir una pÃ¡gina web (y cÃ³mo evitarlos)
8. Automatizaciones que ahorran 20 horas semanales a una pyme
9. Casos de uso reales de agentes IA en e-commerce chileno
10. Velocidad web y conversiÃ³n: por quÃ© cada segundo cuesta ventas
11. Checklist tÃ©cnico antes de lanzar un sitio nuevo
12. CÃ³mo escribir un brief que tu agencia agradezca

### Mantener el "wow factor"

La home cinemÃ¡tica puede quedarse como estÃ¡ (es tu mejor pieza de marca), pero **debe enlazar** a las landings. AÃ±ade un enlace claro en el menÃº: cuando el usuario clickea "Servicios", lo llevas al hash de la home **y** ofreces enlaces a `/servicios/paginas-web/`, `/servicios/agentes-ia/`, `/servicios/marketing-digital/`.

---

## 3. Checklist accionable (orden recomendado)

### Semana 1 â€” Bloqueadores antes de publicar

- [ ] Mover frames a `/assets/frames/` y cambiar rutas a relativas
- [ ] Comprimir frames (calidad 75, redimensionar a 1920px mÃ¡x, convertir a WebP)
- [ ] Cargar solo capÃ­tulo actual + siguiente; resto lazy
- [ ] AÃ±adir `<meta name="description">`
- [ ] AÃ±adir Open Graph + Twitter Cards completos
- [ ] Crear `og-image.jpg` (1200Ã—630)
- [ ] AÃ±adir favicon (SVG + 32Ã—32 PNG + apple-touch-icon)
- [ ] AÃ±adir `<link rel="canonical">`
- [ ] Cambiar `lang="es"` â†’ `lang="es-CL"`
- [ ] AÃ±adir JSON-LD `ProfessionalService`
- [ ] Mover H1 al hero (oculto con visually-hidden si no se quiere visible)
- [ ] Reemplazar todos los `href="#"` por anchors reales (`#servicios`, etc.)
- [ ] AÃ±adir `rel="noopener noreferrer"` al link de WhatsApp
- [ ] AÃ±adir `<noscript>` con contenido mÃ­nimo
- [ ] Self-host de Google Fonts con `font-display: swap`

### Semana 2 â€” IndexaciÃ³n

- [ ] Crear `/robots.txt`
- [ ] Crear `/sitemap.xml`
- [ ] Verificar dominio en Google Search Console
- [ ] Conectar Google Analytics 4 (o Plausible)
- [ ] Validar con [PageSpeed Insights](https://pagespeed.web.dev/) â€” objetivo: LCP < 2.5s, CLS < 0.1, INP < 200ms
- [ ] Validar con [Rich Results Test](https://search.google.com/test/rich-results)
- [ ] Enviar sitemap a Search Console

### Semana 3â€“4 â€” Contenido y arquitectura

- [ ] Crear landings dedicadas por servicio (3 URLs)
- [ ] AÃ±adir pÃ¡gina `/nosotros/`
- [ ] AÃ±adir 2 casos de estudio (`/casos/...`)
- [ ] Estructurar blog (`/blog/`)
- [ ] Publicar 3 primeros posts (ver lista en secciÃ³n 2)
- [ ] Configurar internal linking entre landings y blog

### Mes 2+ â€” Sostenido

- [ ] 1â€“2 posts de blog por semana
- [ ] Monitorear posiciones con Search Console
- [ ] A/B test de CTAs principales
- [ ] Conseguir backlinks: directorios chilenos (paginaspro.cl, mercadolibre, hotfrog), Clutch, Sortlist
- [ ] ReseÃ±as en Google Business Profile (clave para SEO local)

---

## 4. ApÃ©ndice â€” Quick wins copy-paste

### A. `<head>` completo recomendado

```html
<!DOCTYPE html>
<html lang="es-CL">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>Agencia Atiko | PÃ¡ginas Web, Agentes IA y Marketing Digital en Chile</title>
<meta name="description" content="Agencia Atiko Â· Santiago, Chile. DiseÃ±amos pÃ¡ginas web, agentes de IA y campaÃ±as de marketing digital que generan resultados reales. Cotiza tu proyecto.">

<link rel="canonical" href="https://atikodigital.cl/">

<!-- Favicon / manifest -->
<link rel="icon" type="image/svg+xml" href="/logo.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#000000">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:locale" content="es_CL">
<meta property="og:site_name" content="Agencia Atiko">
<meta property="og:title" content="Agencia Atiko â€” PÃ¡ginas Web Â· Agentes IA Â· Marketing Digital">
<meta property="og:description" content="DiseÃ±amos presencias digitales que marcan la diferencia. Santiago, Chile.">
<meta property="og:url" content="https://atikodigital.cl/">
<meta property="og:image" content="https://atikodigital.cl/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Agencia Atiko â€” PÃ¡ginas Web Â· Agentes IA Â· Marketing Digital">
<meta name="twitter:description" content="DiseÃ±amos presencias digitales que marcan la diferencia.">
<meta name="twitter:image" content="https://atikodigital.cl/og-image.jpg">

<!-- Fuentes self-hosted (mover Google Fonts a /assets/fonts/) -->
<link rel="preload" as="font" type="font/woff2" href="/assets/fonts/space-grotesk-500.woff2" crossorigin>

<!-- JSON-LD -->
<script type="application/ld+json">
{ /* ... ProfessionalService de la secciÃ³n A3 ... */ }
</script>
</head>
```

### B. `robots.txt`

```
User-agent: *
Allow: /

Sitemap: https://atikodigital.cl/sitemap.xml
```

### C. `site.webmanifest`

```json
{
  "name": "Agencia Atiko",
  "short_name": "Atiko",
  "icons": [
    { "src": "/favicon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/favicon-512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "theme_color": "#000000",
  "background_color": "#000000",
  "display": "standalone"
}
```

### D. CSS para `visually-hidden`

```css
.visually-hidden{
  position:absolute;width:1px;height:1px;
  padding:0;margin:-1px;overflow:hidden;
  clip:rect(0,0,0,0);white-space:nowrap;border:0;
}
```

---

## 5. Recursos para seguir

- [Google Search Console](https://search.google.com/search-console) â€” verificaciÃ³n + sitemap
- [PageSpeed Insights](https://pagespeed.web.dev/) â€” Core Web Vitals
- [Rich Results Test](https://search.google.com/test/rich-results) â€” validar schema
- [Schema Markup Validator](https://validator.schema.org/) â€” validar JSON-LD
- [Squoosh](https://squoosh.app/) â€” comprimir imÃ¡genes en el navegador
- [google-webfonts-helper](https://gwfh.mranftl.com/fonts) â€” self-host de Google Fonts
- [Ahrefs Keyword Generator (gratis)](https://ahrefs.com/keyword-generator) â€” keywords para Chile

---

**Si quieres, puedo:**
1. Aplicar directamente los fixes ðŸ”´ crÃ­ticos al `index.html` (head completo + schema + ajustes en H1 y links).
2. Generar `robots.txt`, `sitemap.xml`, `site.webmanifest` y un `og-image.jpg` placeholder.
3. Escribir las 3 landings dedicadas (`/servicios/paginas-web/index.html`, etc.) con copy SEO-optimizado.

AvÃ­same por dÃ³nde quieres empezar.

