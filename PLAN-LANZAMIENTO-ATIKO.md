# ðŸš€ Plan de Lanzamiento Â· Atiko

**Fecha del plan:** 2026-05-24
**Owner:** JosÃ© Antonio OlguÃ­n
**Meta a 90 dÃ­as:** Atiko publicado, indexado, con 3-5 leads orgÃ¡nicos/semana y al menos 1 cliente pagado.

---

## ðŸ“‹ Resumen ejecutivo en 60 segundos

El sitio estÃ¡ construido. Lo que falta es:

1. **Comprar el dominio** (`atikodigital.cl` en NIC, ~$10.000 CLP/aÃ±o)
2. **Subirlo a Cloudflare Pages** (gratis, ~30 min)
3. **Indexarlo en Google + Bing** (gratis, ~1 hora)
4. **Crear Google Business Profile** (gratis, ~30 min, +30% trÃ¡fico local)
5. **Conectar tracking** (Analytics + Search Console, gratis)
6. **Soft launch** a cÃ­rculo cercano para conseguir 3 clientes fundadores
7. **Empezar a publicar contenido** (2 artÃ­culos del blog por semana)

**Costo total para lanzar:** ~$15.000 CLP (solo el dominio + opcional droplet n8n USD $6/mes cuando llegue primer cliente)

**Tiempo total real:** 2-3 dÃ­as de trabajo full-time tuyo, distribuidos en 1-2 semanas.

---

## ðŸ—“ï¸ Timeline general

```
DÃA 1-2 (Pre-deploy)        Comprar dominio + preparar archivos
DÃA 3 (Deploy)              Subir a Cloudflare Pages
DÃA 4 (IndexaciÃ³n)          GSC + GA4 + Bing + sitemap submit
DÃA 5 (Local SEO)           Google Business Profile + directorios
DÃA 6-7 (Tracking + QA)     Verificar todo + corregir errores
SEM 2 (Soft launch)         Avisar contactos + feedback
SEM 3-8 (Outbound)          Contactar 50 pymes target
SEM 3-12 (Contenido)        2 artÃ­culos/semana en el blog
MES 3 (Iterar)              AnÃ¡lisis y ajustes segÃºn data real
```

---

## âœ… FASE 1 Â· Pre-deploy (DÃ­a 1-2)

### 1.1 Â· Comprar el dominio `atikodigital.cl`

**DÃ³nde:** [nic.cl](https://www.nic.cl) (Ãºnica opciÃ³n oficial para `.cl`)

**Pasos:**
1. Crear cuenta con tu RUT en nic.cl
2. Buscar disponibilidad de `atikodigital.cl`
3. Si estÃ¡ libre: registrar por 1 o 2 aÃ±os (1 aÃ±o = $9.940 CLP)
4. Pagar con tarjeta o transferencia
5. Verificar email de confirmaciÃ³n de NIC

**Tiempo:** 20 minutos
**Costo:** $9.940 CLP/aÃ±o
**Resultado:** dominio en tu nombre, listo para apuntar a Cloudflare

> **Alternativas si `atikodigital.cl` estÃ¡ ocupado:** `atikodigital.cl`, `atiko.com` (mÃ¡s caro pero internacional), `atikoia.cl`, `agencia-atikodigital.cl`. Decide rÃ¡pido.

### 1.2 Â· Preparar los frames del home

**Problema actual:** los frames del canvas (~907 imÃ¡genes) estÃ¡n en `C:\Users\josea\Downloads\frames_*` con paths `file:///`. No funcionan online.

**SoluciÃ³n:**

```powershell
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko"
mkdir -p assets\frames\hq assets\frames\4k assets\frames\wa assets\frames\4k2 assets\frames\max assets\frames\curated

# Copiar (no mover, por seguridad)
robocopy "C:\Users\josea\Downloads\frames_hq" "assets\frames\hq" /E
robocopy "C:\Users\josea\Downloads\frames_4k" "assets\frames\4k" /E
robocopy "C:\Users\josea\Downloads\frames_wa" "assets\frames\wa" /E
robocopy "C:\Users\josea\Downloads\frames_4k2" "assets\frames\4k2" /E
robocopy "C:\Users\josea\Downloads\frames_max_jpg" "assets\frames\max" /E
robocopy "C:\Users\josea\Downloads\frames_atiko_clean\frames_atiko2" "assets\frames\curated" /E
```

**VerificaciÃ³n:**
```powershell
# Cuenta archivos
Get-ChildItem assets\frames -Recurse -File | Measure-Object
# DeberÃ­a dar ~907 archivos
```

**Tiempo:** 10-20 min (depende del tamaÃ±o total)
**TamaÃ±o esperado:** ~500MB-2GB de imÃ¡genes

> âš ï¸ **IMPORTANTE:** Cloudflare Pages tiene lÃ­mite de 25.000 archivos por deploy y 26MB por archivo individual. Si tus frames son JPG pesados, todo OK. Si superas 25k archivos, hay que reducir.

### 1.3 Â· Activar modo producciÃ³n

Ejecuta el `build.sh` que ya creÃ©, o manualmente:

**Archivo:** `index.html` lÃ­nea 1043
```javascript
// ANTES
const FRAMES_MODE = 'local';
// DESPUÃ‰S
const FRAMES_MODE = 'production';
```

O ejecuta:
```powershell
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko"
bash build.sh
# (o si no tienes bash, edita manualmente la lÃ­nea)
```

### 1.4 Â· Limpiar archivos privados que NO se suben

Los siguientes archivos `.md` son internos y no deben subirse a producciÃ³n. El `.gitignore` ya los excluye, pero verifica:

```
SEO-AUDIT.md
SECURITY-AUDIT.md
KEYWORDS-RESEARCH.md
ESTRATEGIA-NEGOCIO.md
AUTOMATIZACIONES.md
PLAN-MAESTRO.md
PLAN-LANZAMIENTO-ATIKO.md  â† este mismo
REORIENTACION-IA-AUTOMATIZACION.md
ARQUITECTURA-SITIO.md
README.md
toolkit/  â† carpeta entera
build.sh
```

### 1.5 Â· Smoke test local

```powershell
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko"
python -m http.server 8000
```

Abrir `http://localhost:8000/` y verificar:
- [ ] La home carga con todos los frames
- [ ] Los hubs `/agentes-ia/` y `/automatizaciones/` se ven con el look cinematogrÃ¡fico
- [ ] Los precios cargan correctamente
- [ ] El blog cargan con artÃ­culos
- [ ] Mobile-friendly (Chrome DevTools â†’ toggle device toolbar)
- [ ] Click WhatsApp abre WhatsApp con mensaje pre-armado
- [ ] Footer tiene link a privacidad y tÃ©rminos

---

## ðŸŒ FASE 2 Â· Deploy tÃ©cnico (DÃ­a 3)

### 2.1 Â· Crear cuenta en Cloudflare (5 min)

1. Ir a [dash.cloudflare.com](https://dash.cloudflare.com)
2. Sign up con email
3. Verificar email
4. Pasar el tutorial inicial (saltable)

**Costo:** Gratis

### 2.2 Â· Conectar dominio `atikodigital.cl` a Cloudflare (15 min)

**Por quÃ© Cloudflare en lugar de hosting tradicional:**
- Hosting estÃ¡tico gratis (Cloudflare Pages)
- CDN global incluido (rÃ¡pido en todo el mundo)
- SSL/HTTPS automÃ¡tico gratis
- DDoS protection gratis
- Analytics simple gratis
- Edge functions si necesitas algo serverless despuÃ©s

**Pasos:**

1. En Cloudflare dashboard â†’ "Add a Site"
2. Ingresar `atikodigital.cl`
3. Elegir plan **Free**
4. Cloudflare te muestra 2 nameservers tipo `xxx.ns.cloudflare.com`
5. Volver a [nic.cl](https://www.nic.cl) â†’ tu cuenta â†’ tu dominio â†’ "Modificar"
6. Cambiar los nameservers de NIC por los de Cloudflare
7. Guardar (la propagaciÃ³n toma 1-24 horas, generalmente <1h)
8. En Cloudflare aparecerÃ¡ "Active" cuando estÃ© lista

### 2.3 Â· Crear repositorio Git (opcional pero recomendado)

**Por quÃ©:** te permite hacer cambios fÃ¡ciles en el futuro con `git push` y Cloudflare auto-deploya.

**OpciÃ³n A Â· GitHub (gratis)**
1. Crear cuenta en [github.com](https://github.com) si no tienes
2. Crear repo privado "atiko-web"
3. En tu PC:
```powershell
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko"
git init
git add .
git commit -m "initial commit Â· launch"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/atiko-web.git
git push -u origin main
```

**OpciÃ³n B Â· sin Git (subida directa)**
Si no quieres lidiar con Git ahora, puedes arrastrar la carpeta directo a Cloudflare Pages. MÃ¡s simple pero cada update requiere arrastrar de nuevo.

### 2.4 Â· Deploy en Cloudflare Pages (10 min)

1. Cloudflare dashboard â†’ "Workers & Pages" â†’ "Create application" â†’ "Pages" â†’ "Connect to Git" (o "Direct Upload" si no usas Git)
2. Si Git: autorizar GitHub, elegir el repo `atiko-web`
3. ConfiguraciÃ³n del build:
   - **Build command**: (vacÃ­o, es estÃ¡tico)
   - **Build output directory**: `/` (la raÃ­z)
   - **Root directory**: `/`
4. Click "Save and Deploy"
5. Espera 1-2 min al primer deploy
6. Cloudflare te da una URL tipo `atiko-web.pages.dev` â†’ Ã¡brela y verifica que se ve bien

### 2.5 Â· Conectar `atikodigital.cl` al deploy

1. En Cloudflare Pages â†’ tu proyecto â†’ "Custom domains"
2. "Set up a custom domain" â†’ `atikodigital.cl`
3. Cloudflare configura automÃ¡ticamente el DNS (porque ya estÃ¡ en tu cuenta)
4. Espera 1-5 minutos para que SSL se active
5. Abre `https://atikodigital.cl` â†’ deberÃ­a verse tu sitio

### 2.6 Â· Configurar `www` redirect (opcional)

Para que `www.atikodigital.cl` tambiÃ©n funcione:
1. En Cloudflare â†’ DNS â†’ Add record
2. Type: `CNAME`, Name: `www`, Target: `atikodigital.cl`, Proxy: On
3. En Pages â†’ Custom domains â†’ Add `www.atikodigital.cl`

### 2.7 Â· Verificar headers de seguridad

El archivo `_headers` que ya creÃ© se aplica automÃ¡ticamente. Verifica:

```bash
curl -I https://atikodigital.cl/ | grep -iE "content-security|x-frame|strict-transport"
```

O usar https://securityheaders.com/?q=atikodigital.cl â†’ debe sacar **A o A+**.

**Tiempo total Fase 2:** 30-45 minutos.

---

## ðŸ” FASE 3 Â· IndexaciÃ³n SEO (DÃ­a 4)

### 3.1 Â· Google Search Console (15 min) â€” CRÃTICO

**Esto es lo mÃ¡s importante de la fase. Si no haces esto, Google no sabe que existes.**

1. Ir a [search.google.com/search-console](https://search.google.com/search-console)
2. Iniciar sesiÃ³n con cuenta Google de Atiko (recomendaciÃ³n: crear cuenta dedicada, ej. `atikodigital@gmail.com`)
3. Add Property â†’ "URL Prefix" â†’ `https://atikodigital.cl/`
4. Verificar la propiedad. La forma mÃ¡s fÃ¡cil: **HTML tag**
5. Copia el meta tag que Google te da, lo agregamos al `<head>` del `index.html`

**Vas a ver algo como:**
```html
<meta name="google-site-verification" content="ABC123XYZ..." />
```

â†’ PegÃ¡melo en chat y te lo agrego al sitio.

6. Click "Verify" â†’ deberÃ­a decir "Ownership verified"
7. Ir a "Sitemaps" â†’ ingresar `sitemap.xml` â†’ Submit
8. Ir a "URL Inspection" â†’ ingresar `https://atikodigital.cl/` â†’ "Request Indexing"
9. Repetir indexing manual para las pÃ¡ginas mÃ¡s importantes:
   - `/agentes-ia/`
   - `/automatizaciones/`
   - `/precios/`
   - `/blog/que-es-un-agente-ia/`
   - `/blog/n8n-para-principiantes-pyme/`

> Google va a empezar a crawlear tu sitio en 24-72h. IndexaciÃ³n completa en 1-3 semanas.

### 3.2 Â· Google Analytics 4 (15 min) â€” CRÃTICO

**Para medir trÃ¡fico, conversiones a WhatsApp, fuentes de trÃ¡fico.**

1. Ir a [analytics.google.com](https://analytics.google.com)
2. Crear cuenta "Atiko"
3. Crear propiedad "atikodigital.cl"
4. Industry: Marketing/Advertising Â· Time zone: America/Santiago Â· Currency: CLP
5. Crear "Web data stream" con URL `https://atikodigital.cl`
6. Google te da un Measurement ID `G-XXXXXXXXXX`

â†’ PegÃ¡melo en chat y te lo agrego al `<head>` de todas las pÃ¡ginas con un script global.

### 3.3 Â· Bing Webmaster Tools (5 min)

Bing tiene 5-8% del market share, no es despreciable.

1. [bing.com/webmasters](https://www.bing.com/webmasters)
2. Sign in con cuenta Microsoft
3. "Add Site" â†’ `https://atikodigital.cl`
4. VerificaciÃ³n: la forma mÃ¡s rÃ¡pida es importar desde Google Search Console (1 click)
5. Submit sitemap

### 3.4 Â· Verificar Open Graph en redes

Antes de empezar a compartir el sitio, verifica que se vea bien al pegar el link:

- **Facebook/LinkedIn debugger:** [developers.facebook.com/tools/debug](https://developers.facebook.com/tools/debug/) â†’ pega `https://atikodigital.cl` â†’ "Debug" â†’ ver preview
- **Twitter Card validator:** [cards-dev.twitter.com/validator](https://cards-dev.twitter.com/validator)
- **WhatsApp preview:** simplemente mandate el link a ti mismo, ver cÃ³mo lo previsualiza

Si la imagen no aparece bien, hay que ajustar `og-image.jpg`.

**Tiempo total Fase 3:** ~45 minutos.

---

## ðŸ“ FASE 4 Â· Presencia local Chile (DÃ­a 5)

### 4.1 Â· Google Business Profile (45 min) â€” ALTO IMPACTO

**Por quÃ© importa:** el 46% de las bÃºsquedas locales (incluida "agencia digital santiago") priorizan negocios verificados en Maps. Sin esto perdÃ©s ~30-40% de trÃ¡fico cualificado.

**Pasos:**

1. Ir a [business.google.com](https://business.google.com)
2. "Add your business to Google"
3. Nombre: **Agencia Atiko**
4. CategorÃ­a primaria: **Marketing Agency**
5. CategorÃ­as secundarias: **Software Company Â· Business Consultant**
6. UbicaciÃ³n: âš ï¸ **decisiÃ³n crÃ­tica**
   - Si tenÃ©s oficina fÃ­sica: ingresÃ¡ la direcciÃ³n
   - Si trabajÃ¡s desde casa pero no querÃ©s mostrarla: marcÃ¡ "Yes, I deliver to customers at their location" + dejÃ¡ vacÃ­o "Business address" + agrega "Service area" = RegiÃ³n Metropolitana
7. TelÃ©fono: **+56 9 2713 0792**
8. Website: **https://atikodigital.cl**
9. VerificaciÃ³n: te van a pedir verificar por:
   - Postal (envÃ­an tarjeta en 1-2 semanas) â† mÃ¡s comÃºn
   - Video selfie (mÃ¡s rÃ¡pido, recientemente lanzado)
   - TelÃ©fono (a veces)
10. Cuando estÃ© verificado:
    - Agregar fotos: logo, captures del sitio, identidad visual
    - Configurar horarios de atenciÃ³n
    - Habilitar "Messages" (los clientes te escriben directo)
    - Habilitar "Booking" si querÃ©s que agenden cita desde Maps
    - Publicar primer "post" (anuncio de lanzamiento)

> **Tip pro:** Pedile a 5 amigos/familia que dejen review honesta. NecesitÃ¡s llegar a 4.5+ estrellas mÃ­nimo para que Google te muestre arriba.

### 4.2 Â· LinkedIn Company Page (20 min)

1. [linkedin.com/company/setup/new](https://www.linkedin.com/company/setup/new/)
2. Crear pÃ¡gina: "Agencia Atiko"
3. Industry: Internet Marketing
4. Size: 2-10
5. Type: Privately held
6. Logo + Cover image + Description
7. Habilitar "Page admin" para gestionar
8. Conectar con tu LinkedIn personal como "Empleado fundador"

**DespuÃ©s:** posteÃ¡ 2-3 veces por semana sobre IA + automatizaciÃ³n.

### 4.3 Â· PÃ¡ginas Amarillas Digital (10 min)

[paginasamarillas.cl](https://www.paginasamarillas.cl) â†’ "Agregar mi empresa" â†’ completar ficha.

Tiene ranking decente en Google para keywords locales chilenas.

### 4.4 Â· Listados secundarios (15 min)

Crear ficha en:
- [Yelp Chile](https://www.yelp.cl)
- [PÃ¡ginas Blancas (Pisanet)](https://www.pisanet.cl)
- [Foursquare for Business](https://business.foursquare.com)
- Grupo Facebook de pymes Chile (donde no estÃ© prohibida la auto-promociÃ³n)

### 4.5 Â· Crear cuentas redes sociales (20 min)

Reserva los handles de @atiko antes que otro:

- **Instagram:** @atikodigital.cl o @atikoagencia
- **LinkedIn empresa:** ya creada en 4.2
- **TikTok:** @atikodigital.cl
- **X/Twitter:** @atikodigital
- **YouTube:** Atiko Digital

No tenÃ©s que publicar todavÃ­a. Solo reservar.

**Tiempo total Fase 4:** ~2 horas.

---

## ðŸ“Š FASE 5 Â· Tracking y conversiones (DÃ­a 6)

### 5.1 Â· Configurar eventos custom en GA4

Por defecto GA4 mide pageviews. Vamos a sumar eventos importantes:

**Eventos a trackear:**
- `click_whatsapp` â€” cada vez que alguien hace click en un botÃ³n de WhatsApp
- `view_pricing` â€” cuando alguien llega a /precios/
- `view_agente_ia` â€” cuando alguien llega a /agentes-ia/
- `scroll_75` â€” quien hace scroll del 75% (engagement real)
- `outbound_link` â€” clicks a Instagram, LinkedIn, etc.

**CÃ³mo:** GA4 tiene "Enhanced Measurement" que captura algunos automÃ¡ticamente. Para el WhatsApp click, hay que agregar un poco de JS en cada CTA. Yo te lo agrego cuando tengas el Measurement ID.

### 5.2 Â· UTM parameters en WhatsApp

Para saber de dÃ³nde viene cada lead, agregamos UTM al link:

```
ANTES:
https://wa.me/56927130792?text=Hola

DESPUÃ‰S (por canal):
https://wa.me/56927130792?text=Hola%20vengo%20del%20sitio%20web
https://wa.me/56927130792?text=Hola%20vengo%20de%20instagram
```

Lo mÃ¡s simple: que cada botÃ³n de WhatsApp tenga el contexto en el `text=`. AsÃ­ cuando llegue, sabes en quÃ© pÃ¡gina estaba.

### 5.3 Â· Banner de cookies (si activas analytics)

GA4 estÃ¡ usando cookies. Para cumplir Ley 21.719:

Crear un banner sencillo que se muestre en primera visita pidiendo consentimiento. Yo te puedo agregar uno discreto en estilo Atiko.

### 5.4 Â· Pixel de Meta (opcional, para Ads futuro)

Si planeas hacer Meta Ads:
1. business.facebook.com â†’ Events Manager â†’ Create pixel
2. Te dan un script para pegar en el `<head>`

â†’ Lo agregamos cuando decidas correr campaÃ±as.

---

## ðŸŽ¯ FASE 6 Â· Soft launch (Semana 2)

### 6.1 Â· Lista de tu cÃ­rculo cercano (30 min)

HacÃ© una lista de **30-50 personas** en tu vida real que:
- Tienen pyme propia, o
- Conocen dueÃ±os de pyme, o
- Son amigos cercanos que te van a dar feedback honesto

CategorÃ­as:
- Familia con negocio
- CompaÃ±eros de trabajos anteriores
- CompaÃ±eros de universidad/colegio que emprenden
- Amigos del barrio que tienen local
- Profesionales independientes (contadores, abogados que conocÃ©s)

### 6.2 Â· Mensaje base de soft launch

Plantilla para WhatsApp:

```
Hola [Nombre],

LancÃ© recientemente Atiko, una agencia especializada en 
implementar agentes de IA y automatizaciÃ³n para pymes chilenas. 

Te dejo el link por si te interesa o conocÃ©s a alguien:
https://atikodigital.cl

Si tenÃ©s un momento, agradecerÃ­a tu opiniÃ³n honesta sobre 
el sitio (quÃ© se entiende, quÃ© no). 

Si te suma la idea para tu negocio o conocÃ©s a alguien que 
le pueda servir, te agradezco mil que me lo recomiendes.

Â¡Gracias!
JosÃ©
```

### 6.3 Â· Post LinkedIn personal de lanzamiento

```
DespuÃ©s de [X] meses construyendo, lanzo Atiko.

Una agencia chilena que ayuda a pymes a usar IA y 
automatizaciÃ³n en su dÃ­a a dÃ­a. No los buzzwords de Twitter, 
las cosas concretas:

â†’ Agentes IA en WhatsApp que atienden 24/7
â†’ Boletas SII emitidas automÃ¡ticamente
â†’ Cobranza WhatsApp sin quemar relaciones
â†’ Voucher de transferencia â†’ fila en Sheets en 15 segundos

Si conocÃ©s alguna pyme que estÃ¡ perdiendo horas en tareas 
manuales, recomendame el contacto. Los primeros 5 clientes 
obtienen 30% de descuento permanente como caso fundador.

atikodigital.cl

[1-2 imÃ¡genes del sitio]
```

### 6.4 Â· Story Instagram

Story simple con el logo + URL + "LancÃ© mi proyecto" + arrastra arriba.

### 6.5 Â· Recopilar feedback

Antes de hacer outbound serio, recopilÃ¡ feedback de las primeras 10-20 visitas:
- Â¿Se entiende quÃ© hace Atiko en los primeros 5 segundos?
- Â¿Los precios son claros?
- Â¿La diferencia entre los 3 planes es obvia?
- Â¿Inspira confianza?
- Â¿Te llamarÃ­a la atenciÃ³n si fueras una pyme?

AjustÃ¡ copy y diseÃ±o segÃºn lo que te digan. **No avances a outbound hasta que el sitio pase este filtro.**

---

## ðŸ“£ FASE 7 Â· Outbound a clientes objetivo (Semanas 3-8)

### 7.1 Â· Definir 50 pymes objetivo

Crear un Google Sheet con columnas:
- Nombre del negocio
- Industria (HORECA / dental / contable / e-commerce / servicios profesionales)
- TamaÃ±o aproximado
- WhatsApp / Instagram / web
- Â¿Dolor visible? (mucha actividad WhatsApp, web mala, sin chatbot)
- Owner contacto
- Estado: prospecto / contactado / en conversaciÃ³n / cerrado / perdido

### 7.2 Â· Fuentes para encontrarlos

- Instagram: buscar hashtag `#pymeschile`, `#emprendedoreschile`, `#delivery[ciudad]`
- Google Maps: buscar "restaurante en Las Condes", anotar los que tienen web mala o ninguna
- LinkedIn: filtrar Chile + tamaÃ±o 1-10 + industria
- PÃ¡ginas Amarillas: navegar por categorÃ­a
- Tu propio cÃ­rculo: pedir referidos

### 7.3 Â· Mensaje outbound (frÃ­o)

```
Hola [Nombre], soy JosÃ© de Atiko.

Vi tu [negocio/Instagram/cuenta] y me llamÃ³ la atenciÃ³n 
[ALGO ESPECÃFICO REAL, ej: "tu menÃº del dÃ­a siempre actualizado",
"la calidad de tus posts", "tu speed de respuesta"].

Estamos arrancando con Atiko, una agencia chilena enfocada 
en automatizar tareas repetitivas de pymes con IA. Por 
ejemplo: que la foto del voucher que te llega por WhatsApp 
quede registrada solo en una planilla, o que un agente IA 
atienda consultas bÃ¡sicas 24/7.

Â¿Te molestarÃ­a si te muestro en 15 min cÃ³mo se verÃ­a en 
tu negocio? Sin compromiso. Te dejo el link de Atiko: 
atikodigital.cl/agentes-ia/

Cualquier cosa estoy por acÃ¡. Saludos,
JosÃ©
```

> âš ï¸ **Reglas de outbound chileno:**
> - Personaliza cada mensaje (no copy-paste literal)
> - Menciona algo especÃ­fico que viste de su negocio
> - Da valor antes de pedir nada
> - No insistas mÃ¡s de 2 veces si no responde
> - Respeta horarios (10am-19h hÃ¡biles)

### 7.4 Â· MÃ©tricas a esperar (realistas)

De 50 mensajes outbound:
- 15-25 responden (30-50%)
- 5-10 agendan llamada (10-20%)
- 1-3 contratan (2-6%)

Eso es **bueno** para outbound frÃ­o. No esperes 50% de conversiÃ³n, eso solo pasa con trÃ¡fico orgÃ¡nico calificado.

---

## ðŸ“ FASE 8 Â· Contenido continuo (Semanas 3-12+)

### 8.1 Â· Calendario de blog (2 artÃ­culos/semana)

Ya tenÃ©s 3 artÃ­culos publicados + 6 prÃ³ximamente. Plan de los siguientes 8 semanas:

| Semana | ArtÃ­culo 1 | ArtÃ­culo 2 |
|--------|-----------|-----------|
| 3 | Claude vs GPT-4 vs Gemini para pymes | CuÃ¡nto cuesta un agente IA Chile 2026 |
| 4 | WhatsApp Business API vs WhatsApp normal | CÃ³mo cumplir Ley 21.719 con IA |
| 5 | 10 automatizaciones para restaurantes | Automatizar vs contratar: cÃ³mo decidir |
| 6 | Tutorial: Voucher SII automÃ¡tico con OpenFactura | Casos de Ã©xito: pymes que automatizaron |
| 7 | n8n vs Make vs Zapier: comparativa real | Privacidad de datos en agentes IA |
| 8 | 10 automatizaciones para clÃ­nicas dentales | CÃ³mo elegir agencia de IA en Chile |
| 9 | Tutorial Fintoc + n8n: conciliaciÃ³n bancaria | CuÃ¡ndo tu pyme NO necesita un agente IA |
| 10 | El estado de la IA en pymes chilenas (research) | CÃ³mo empezar a usar IA con $0 |

### 8.2 Â· Posts en LinkedIn (2-3/semana)

Tipos de contenido que funciona en LinkedIn Chile:
- "Caso real" (anÃ³nimo si no tienes permiso): "una pyme automatizÃ³ X y ahora hace Y"
- "Hot take" honesto: opiniones sobre el mercado, errores comunes
- Tutorial visual corto: 3-5 slides con un proceso
- Resumen del blog: "publiquÃ© [artÃ­culo], lo importante en 60 segundos"

### 8.3 Â· Reels en Instagram (1-2/semana)

- Demo del agente IA en vivo (15-30 seg)
- Antes/despuÃ©s de una automatizaciÃ³n
- Tip rÃ¡pido ("usÃ¡ esto para X")
- Mostrar el proceso de Atiko trabajando con un cliente

---

## ðŸ” FASE 9 Â· Monitoreo y ajuste (continuo, desde semana 4)

### 9.1 Â· MÃ©tricas semanales (cada lunes 30 min)

Revisar:
- **Google Search Console**: impresiones, clicks, position promedio, queries nuevas
- **Google Analytics**: visitas, fuentes (organic / direct / social), pÃ¡ginas top, tiempo en sitio
- **Conversion**: cuÃ¡ntos clicks a WhatsApp, cuÃ¡ntos terminaron en conversaciÃ³n
- **Backlinks** (con [ahrefs Backlink Checker](https://ahrefs.com/backlink-checker) gratis): nuevos enlaces apuntando a atikodigital.cl

### 9.2 Â· MÃ©tricas mensuales (Ãºltimo viernes)

- PosiciÃ³n promedio para keywords objetivo (usar [serps.com](https://serps.com) gratis o Ahrefs trial)
- Domain Authority de Atiko (con [Moz Free DA Checker](https://moz.com/domain-analysis))
- Total backlinks
- Nuevos clientes y revenue mensual recurrente (MRR)

### 9.3 Â· MÃ©tricas trimestrales (revisiÃ³n grande)

Hacer un anÃ¡lisis profundo y ajustar estrategia:
- Â¿QuÃ© keywords estÃ¡n funcionando mejor?
- Â¿QuÃ© artÃ­culos del blog atraen mÃ¡s trÃ¡fico?
- Â¿De quÃ© canales vienen los mejores clientes?
- Â¿QuÃ© hay que cambiar en pricing, en messaging, en producto?

---

## ðŸ’° Costos totales del lanzamiento

### Una vez
| Item | Costo |
|------|-------|
| Dominio `atikodigital.cl` (1 aÃ±o) | $9.940 CLP |
| VerificaciÃ³n NIC (si aplica) | $0 |
| **TOTAL ÃšNICO** | **$9.940 CLP** |

### Mensuales (cuando empieces a operar)
| Item | Costo mensual |
|------|---------------|
| Cloudflare Pages | $0 |
| Google Workspace (email atikodigital@) | $0 (gratis hasta 2026 con cuenta gmail) |
| Plan IA (Claude API) | USD $5-25 cuando llegue primer cliente |
| n8n en DigitalOcean | USD $6 cuando llegue primer cliente |
| WhatsApp Business API (Twilio) | USD $0-15 segÃºn volumen |
| Hosting de stock photos (Cloudinary free) | $0 |
| **TOTAL MENSUAL (primer mes con 0 clientes)** | **$0** |
| **TOTAL MENSUAL (con 1 cliente Pro activo)** | **~USD $20-30 (~$20-30k CLP)** |

### InversiÃ³n adicional opcional (mes 2-3)
- Logo profesional Canva Pro: $0 (free tier) o ~$10k/mes
- Stock photos premium (Unsplash+ o Pexels): $0 (gratis ambos)
- Email marketing (Mailchimp free hasta 500 contactos): $0
- Domain `atikodigital@gmail.com` o `hola@atikodigital.cl` (Google Workspace): USD $6/mes opcional

**ConclusiÃ³n: podÃ©s lanzar Atiko por ~$10.000 CLP totales** (solo el dominio). Todo lo demÃ¡s es gratis hasta tener flujo de clientes.

---

## ðŸŽ¯ Metas SMART por hito

### Mes 1 (junio 2026)
- âœ… Sitio publicado en `atikodigital.cl`
- âœ… Indexado en Google + Bing
- âœ… Google Business Profile verificado
- âœ… 5 piezas de contenido publicadas
- âœ… 30 mensajes de outbound enviados
- ðŸŽ¯ **1 cliente fundador firmado** (descuento 30%)

### Mes 2 (julio 2026)
- ðŸŽ¯ Ranking top 30 para "voucher whatsapp google sheets"
- ðŸŽ¯ 10 artÃ­culos en el blog
- ðŸŽ¯ 50 visitas orgÃ¡nicas/semana
- ðŸŽ¯ **2 clientes activos** (1 fundador + 1 nuevo)
- ðŸŽ¯ 3 reviews en Google Business Profile

### Mes 3 (agosto 2026)
- ðŸŽ¯ Ranking top 20 para "voucher whatsapp google sheets" + "automatizar boletas sii"
- ðŸŽ¯ 15 artÃ­culos en el blog
- ðŸŽ¯ 150 visitas orgÃ¡nicas/semana
- ðŸŽ¯ 5-8 conversaciones de venta abiertas
- ðŸŽ¯ **3-5 clientes activos**
- ðŸŽ¯ MRR: $400k-$800k CLP

### Mes 6 (noviembre 2026)
- ðŸŽ¯ Top 10 para 3 keywords nicho
- ðŸŽ¯ 25-30 artÃ­culos en el blog
- ðŸŽ¯ 500+ visitas orgÃ¡nicas/semana
- ðŸŽ¯ **8-12 clientes activos**
- ðŸŽ¯ MRR: $1.5M-$2.5M CLP
- ðŸŽ¯ 2-3 casos de estudio pÃºblicos

### Mes 12 (mayo 2027)
- ðŸŽ¯ Top 10 para "agentes ia chile" (la pelea grande)
- ðŸŽ¯ 60+ artÃ­culos
- ðŸŽ¯ 2000+ visitas orgÃ¡nicas/mes
- ðŸŽ¯ **20-30 clientes activos**
- ðŸŽ¯ MRR: $4M-$7M CLP
- ðŸŽ¯ Considerar contratar primer empleado

---

## âš ï¸ Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | MitigaciÃ³n |
|--------|--------------|---------|------------|
| Frames muy pesados rompen Cloudflare deploy | Media | Alto | Comprimir JPEG con quality 75-85 antes de subir |
| No llegan leads orgÃ¡nicos los primeros 3 meses | Alta | Medio | Outbound activo + soft launch a cÃ­rculo cercano |
| Primer cliente reclama porque algo no funciona | Media | Medio | Plan piloto a $0 con cliente fundador para detectar issues |
| Competencia barata aparece | Alta | Bajo-Medio | Foco en valor y casos reales, no en precio |
| Algoritmo de Google cambia y baja ranking | Baja | Alto | SEO white-hat, contenido genuino, sin trucos |
| Te quedas sin tiempo para contenido | Alta | Alto | Reservar 4h/semana fijas + delegar parte cuando haya $$ |
| Burnout sin ver resultados rÃ¡pidos | Media | Alto | Celebrar pequeÃ±as victorias, ROI real toma 6+ meses |

---

## ðŸ“‹ Checklist final Â· resumen accionable

### DÃ­a 1-2 Â· Pre-deploy
- [ ] Comprar dominio `atikodigital.cl` en nic.cl
- [ ] Mover frames de Downloads a `assets/frames/`
- [ ] Cambiar `FRAMES_MODE` a `'production'`
- [ ] Verificar localmente con `python -m http.server 8000`

### DÃ­a 3 Â· Deploy
- [ ] Crear cuenta Cloudflare
- [ ] Cambiar nameservers en nic.cl
- [ ] Crear repo GitHub (opcional)
- [ ] Deploy en Cloudflare Pages
- [ ] Conectar `atikodigital.cl` al deploy
- [ ] Verificar SSL + headers de seguridad

### DÃ­a 4 Â· IndexaciÃ³n
- [ ] Crear Google Search Console + verificar
- [ ] Submit `sitemap.xml`
- [ ] Request indexing manual de 5 pÃ¡ginas top
- [ ] Crear Google Analytics 4 (entregarme el ID)
- [ ] Submit a Bing Webmaster Tools

### DÃ­a 5 Â· Local SEO
- [ ] Crear Google Business Profile (iniciar verificaciÃ³n)
- [ ] Crear LinkedIn Company Page
- [ ] Subir a PÃ¡ginas Amarillas
- [ ] Reservar @atiko en Instagram, TikTok, X

### DÃ­a 6-7 Â· Tracking + QA
- [ ] Verificar GA4 estÃ¡ recibiendo data
- [ ] Probar todos los CTAs de WhatsApp
- [ ] Verificar mobile responsive en celular real
- [ ] Verificar preview en WhatsApp/Facebook/LinkedIn

### Semana 2 Â· Soft launch
- [ ] Lista de 30-50 contactos cercanos
- [ ] Mensaje WhatsApp a todos
- [ ] Post LinkedIn personal
- [ ] Story Instagram
- [ ] Recopilar feedback de 10-20 visitas

### Semana 3-8 Â· Outbound + Contenido
- [ ] Lista de 50 pymes objetivo en Sheet
- [ ] 10-15 mensajes outbound por semana
- [ ] 2 artÃ­culos de blog por semana
- [ ] 2-3 posts LinkedIn por semana
- [ ] 1-2 reels Instagram por semana

### Continuo
- [ ] RevisiÃ³n semanal mÃ©tricas (cada lunes)
- [ ] RevisiÃ³n mensual estrategia (Ãºltimo viernes)
- [ ] RevisiÃ³n trimestral grande (cada 3 meses)

---

## ðŸŽ‰ Cuando consigas el primer cliente

1. ImplementÃ¡ lo prometido en plazo (2-4 semanas)
2. Pedile testimonio y permiso para mostrar el caso
3. Sumalo a `/casos/` (pÃ¡gina nueva que crearemos)
4. Pedile que deje review en Google Business Profile
5. Pedile referidos (3-5 contactos similares)
6. DocumentÃ¡ todo el proceso interno para el siguiente cliente

---

## ðŸ“ž Contactos clave que necesitÃ¡s guardar

- **NIC Chile** (dominio): nic.cl Â· soporte@nic.cl
- **Cloudflare** (hosting): cloudflare.com/support
- **Twilio** (cuando uses WhatsApp Business): support@twilio.com
- **Anthropic** (Claude API): support@anthropic.com
- **OpenFactura** (boletas SII): openfactura.cl/contacto
- **Fintoc** (banca): fintoc.com/contacto

---

**Ãšltima actualizaciÃ³n:** 2026-05-24
**PrÃ³xima revisiÃ³n:** DespuÃ©s del DÃ­a 7 del lanzamiento (verificar que todo estÃ© indexado)

