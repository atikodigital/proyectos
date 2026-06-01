# Agencia Atiko â€” Sitio Web

Sitio one-page cinematogrÃ¡fico para Agencia Atiko (Santiago, Chile).
Servicios: **DiseÃ±o Web Â· Agentes IA para WhatsApp Â· Marketing Digital**.

---

## âš ï¸ Antes de publicar â€” pasos OBLIGATORIOS

### 1. Mover los frames del fondo

Los frames estÃ¡n actualmente en `C:\Users\josea\Downloads\`. El sitio ya no apunta ahÃ­ (rutas absolutas no funcionan en producciÃ³n), asÃ­ que **debes moverlos al proyecto**.

#### Estructura esperada

```
atiko/
â”œâ”€â”€ index.html
â”œâ”€â”€ logo.svg
â”œâ”€â”€ og-image.svg
â”œâ”€â”€ robots.txt
â”œâ”€â”€ sitemap.xml
â”œâ”€â”€ site.webmanifest
â””â”€â”€ assets/
    â””â”€â”€ frames/
        â”œâ”€â”€ hq/        â† desde C:\Users\josea\Downloads\frames_hq\
        â”œâ”€â”€ 4k/        â† desde C:\Users\josea\Downloads\frames_4k\
        â”œâ”€â”€ wa/        â† desde C:\Users\josea\Downloads\frames_wa\
        â”œâ”€â”€ 4k2/       â† desde C:\Users\josea\Downloads\frames_4k2\
        â”œâ”€â”€ max/       â† desde C:\Users\josea\Downloads\frames_max_jpg\
        â””â”€â”€ curated/   â† desde C:\Users\josea\Downloads\frames_atiko_clean\frames_atiko2\
```

#### Comandos PowerShell (copiar y pegar en Windows)

```powershell
# Ir a la carpeta del proyecto
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko"

# Crear estructura
mkdir assets\frames\hq, assets\frames\4k, assets\frames\wa, assets\frames\4k2, assets\frames\max, assets\frames\curated -ErrorAction SilentlyContinue

# Copiar frames (ajusta las rutas si los tienes en otra ubicaciÃ³n)
Copy-Item "$HOME\Downloads\frames_hq\*"        assets\frames\hq\      -Recurse
Copy-Item "$HOME\Downloads\frames_4k\*"        assets\frames\4k\      -Recurse
Copy-Item "$HOME\Downloads\frames_wa\*"        assets\frames\wa\      -Recurse
Copy-Item "$HOME\Downloads\frames_4k2\*"       assets\frames\4k2\     -Recurse
Copy-Item "$HOME\Downloads\frames_max_jpg\*"   assets\frames\max\     -Recurse
Copy-Item "$HOME\Downloads\frames_atiko_clean\frames_atiko2\*" assets\frames\curated\ -Recurse
```

### 2. Comprimir los frames antes de subir

Total actual: ~907 frames. Si pesan 100 KB c/u son **~90 MB** descargÃ¡ndose. Eso es inaceptable.

**RecomendaciÃ³n urgente:**
- ResoluciÃ³n mÃ¡xima: **1920px de ancho** (no necesitas 4K en web).
- Calidad JPG: **70-75** (no mÃ¡s).
- Considerar **WebP** para reducir 30-50%.

#### Comprimir con Squoosh CLI (recomendado)

```powershell
# Instalar squoosh-cli
npm install -g @squoosh/cli

# Comprimir todas las carpetas a WebP calidad 72
@("hq","4k","wa","4k2","max","curated") | ForEach-Object {
  squoosh-cli --webp '{"quality":72}' --resize '{"width":1920}' -d "assets\frames\$_-webp" "assets\frames\$_\*.jpg"
}
```

DespuÃ©s en `index.html` cambia las extensiones `.jpg` por `.webp` en la funciÃ³n `loadFrames()` (lÃ­nea ~530).

### 3. Reemplazar el dominio `atikodigital.cl` si vas a usar otro

Si tu dominio final es distinto, busca y reemplaza en estos archivos:

```powershell
# Cambiar TODOS los "atikodigital.cl" por tu dominio real
$dominio = "tudominio.cl"  # â† cambia aquÃ­
@("index.html","sitemap.xml","robots.txt","site.webmanifest","ESTRATEGIA-NEGOCIO.md","KEYWORDS-RESEARCH.md","SEO-AUDIT.md") | ForEach-Object {
  (Get-Content $_) -replace 'atiko\.cl', $dominio | Set-Content $_
}
```

### 4. Crear `og-image.jpg` (1200Ã—630)

Hay un `og-image.svg` de placeholder, pero **WhatsApp / LinkedIn / Slack no muestran SVG en previews**. Convierte a JPG:

- **Online:** [cloudconvert.com](https://cloudconvert.com/svg-to-jpg) o [convertio.co](https://convertio.co/svg-jpg/)
- **DiseÃ±o propio:** crea uno en Canva 1200Ã—630 con fondo negro + logo dorado + tagline.

Reemplaza `og-image.svg` por `og-image.jpg` cuando estÃ© listo.

### 5. Verificar antes de publicar

```powershell
# Abrir en navegador local (servidor estÃ¡tico rÃ¡pido)
npx serve .
# Abre http://localhost:3000
```

Si funciona perfecto local con rutas relativas, estÃ¡ listo para subir.

---

## Hosting recomendado

| Hosting | Costo | Pro |
|---------|-------|-----|
| **Cloudflare Pages** | Gratis | RÃ¡pido CDN global, SSL auto |
| **Vercel** | Gratis | Deploy desde Git en 30 seg |
| **Netlify** | Gratis | FÃ¡cil drag-and-drop |
| **Hostinger** | ~$3 USD/mes | Si quieres CL hosting tradicional |

Para una landing one-page como esta, **Cloudflare Pages o Vercel** son lo ideal (rÃ¡pido + gratis + dominio .cl funciona).

---

## DespuÃ©s de publicar

1. **Google Search Console:** verifica el dominio â†’ envÃ­a `sitemap.xml`.
2. **Google Analytics 4:** crea propiedad, pega el snippet en `<head>`.
3. **Google Business Profile:** crea o reclama el perfil de "Agencia Atiko" â€” **CRÃTICO para SEO local en Chile**.
4. **Validar OG:** prueba en [opengraph.xyz](https://www.opengraph.xyz/) y [Twitter Card Validator](https://cards-dev.twitter.com/validator).
5. **Validar Schema:** [Rich Results Test](https://search.google.com/test/rich-results) â€” deberÃ­a mostrar tu `ProfessionalService` + 3 ofertas.
6. **PageSpeed Insights:** [pagespeed.web.dev](https://pagespeed.web.dev/) â€” objetivo: 80+ mÃ³vil, 90+ desktop.

---

## Estructura del proyecto

| Archivo | FunciÃ³n |
|---------|---------|
| `index.html` | Sitio principal (one-page con scroll cinemÃ¡tico) |
| `logo.svg` | Logotipo vectorial |
| `og-image.svg` | Imagen para previews en redes (convertir a JPG antes de publicar) |
| `robots.txt` | Reglas para crawlers de Google + IA |
| `sitemap.xml` | Mapa del sitio para Google |
| `site.webmanifest` | PWA bÃ¡sica |
| `SEO-AUDIT.md` | AuditorÃ­a SEO completa (interno) |
| `KEYWORDS-RESEARCH.md` | InvestigaciÃ³n de keywords del mercado chileno (interno) |
| `ESTRATEGIA-NEGOCIO.md` | Precios, servicios y segmentaciÃ³n B2B (interno) |
| `README.md` | Este archivo |

> **Nota:** los archivos `.md` son documentaciÃ³n interna. No los subas al hosting pÃºblico â€” ya estÃ¡n excluidos en `robots.txt`.

---

## PrÃ³ximos pasos sugeridos

- [ ] Mover frames a `assets/frames/` y comprimir
- [ ] Crear `og-image.jpg`
- [ ] Comprar dominio (`atikodigital.cl` sugerido) en NIC.cl
- [ ] Configurar hosting (Cloudflare Pages recomendado)
- [ ] Verificar Google Search Console
- [ ] Conectar Google Analytics 4
- [ ] Crear Google Business Profile
- [ ] Empezar primeros 3 posts del blog (ver `KEYWORDS-RESEARCH.md`)
- [ ] Conseguir 3 primeros clientes con el plan **Atiko Start** ($89.000/mes) para portafolio

---

**Contacto agencia:**
- Email: atikodigital@gmail.com
- WhatsApp: +56 9 2713 0792
- UbicaciÃ³n: Santiago, Chile

