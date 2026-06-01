# ðŸŽ¯ Plan de EjecuciÃ³n Â· Atiko

**Fecha:** 2026-05-24
**Estado actual:** Web construida (24 pÃ¡ginas) + catÃ¡logo pÃºblico + posicionamiento IA/auto. Falta: dominio, deploy, framework backend, primer cliente.
**Meta a 90 dÃ­as:** 3-5 clientes pagando, framework propio funcionando, $400-800k MRR.

---

## ðŸ—ºï¸ Mapa completo de quÃ© falta hacer

```
FASE 1 Â· ESTA SEMANA (5-7 dÃ­as)
  â”œâ”€ Comprar dominio atikodigital.cl
  â”œâ”€ Mover frames del home
  â”œâ”€ Subir sitio a Cloudflare Pages
  â”œâ”€ Crear Google Search Console + Analytics
  â”œâ”€ Crear Google Business Profile (45 min, gratis)
  â””â”€ Soft launch a cÃ­rculo cercano (30-50 contactos)
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  RESULTADO: atikodigital.cl ONLINE, indexado, sin clientes aÃºn

FASE 2 Â· SEMANAS 2-4 (3 semanas)
  â”œâ”€ Crear repo en GitHub: atiko-platform
  â”œâ”€ Setup framework Node.js + TypeScript + Fastify
  â”œâ”€ Supabase (DB, auth multi-tenant)
  â”œâ”€ Deploy a Fly.io / Railway
  â”œâ”€ Primer mÃ³dulo: voucher-to-sheets
  â”œâ”€ Dashboard del cliente bÃ¡sico
  â””â”€ DocumentaciÃ³n interna
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  RESULTADO: backend propio listo para 1er cliente

FASE 3 Â· SEMANAS 4-8 (mes 2)
  â”œâ”€ Outbound a 50 pymes objetivo
  â”œâ”€ 2 artÃ­culos/semana en el blog
  â”œâ”€ Onboarding del 1er cliente fundador
  â”œâ”€ 3 mÃ³dulos mÃ¡s del framework
  â””â”€ IteraciÃ³n basada en feedback real
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  RESULTADO: 1-2 clientes facturando ($100-400k MRR)

FASE 4 Â· MESES 3-6 (escala)
  â”œâ”€ 5-8 clientes activos
  â”œâ”€ Dashboard del cliente pulido
  â”œâ”€ 10-15 mÃ³dulos del framework
  â”œâ”€ Casos de estudio pÃºblicos
  â””â”€ Programa de referidos
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  RESULTADO: $1.5-2.5M MRR Â· listo para crecer
```

---

## ðŸš¦ FASE 1 Â· Esta semana Â· Lanzar el sitio (5-7 dÃ­as)

> **Objetivo:** Que atikodigital.cl estÃ© online, indexado en Google y con primeras visitas. Sin tocar nada de framework backend todavÃ­a.

### DÃ­a 1 Â· HOY (1-2 horas)

#### 1.1 Â· Comprar dominio
- [ ] Ir a [nic.cl](https://www.nic.cl)
- [ ] Crear cuenta con tu RUT
- [ ] Comprar `atikodigital.cl` por 1 aÃ±o ($9.940 CLP)
- [ ] Esperar email de confirmaciÃ³n

#### 1.2 Â· Crear cuenta Gmail dedicada
- [ ] `atikodigital@gmail.com` (si no existe)
- [ ] Activar 2FA
- [ ] Anotar la pass en gestor de contraseÃ±as (1Password, Bitwarden, o Notion seguro)

#### 1.3 Â· Crear cuenta GitHub
- [ ] Si no tenÃ©s: [github.com](https://github.com) con email Atiko
- [ ] Plan Free estÃ¡ perfecto
- [ ] Anotar usuario

### DÃ­a 2 Â· Preparar archivos del sitio (1 hora)

#### 2.1 Â· Mover los frames
```powershell
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko"
mkdir -p assets\frames\hq assets\frames\4k assets\frames\wa assets\frames\4k2 assets\frames\max assets\frames\curated

robocopy "C:\Users\josea\Downloads\frames_hq" "assets\frames\hq" /E
robocopy "C:\Users\josea\Downloads\frames_4k" "assets\frames\4k" /E
robocopy "C:\Users\josea\Downloads\frames_wa" "assets\frames\wa" /E
robocopy "C:\Users\josea\Downloads\frames_4k2" "assets\frames\4k2" /E
robocopy "C:\Users\josea\Downloads\frames_max_jpg" "assets\frames\max" /E
robocopy "C:\Users\josea\Downloads\frames_atiko_clean\frames_atiko2" "assets\frames\curated" /E
```

#### 2.2 Â· Cambiar a modo producciÃ³n
- [ ] Abrir `index.html` lÃ­nea 1043
- [ ] Cambiar `const FRAMES_MODE = 'local';` â†’ `const FRAMES_MODE = 'production';`

#### 2.3 Â· Probar localmente
```powershell
python -m http.server 8000
```
- [ ] Abrir `http://localhost:8000/`
- [ ] Verificar que los frames carguen
- [ ] Verificar mobile (DevTools â†’ toggle device)

### DÃ­a 3 Â· Deploy tÃ©cnico (45 min)

#### 3.1 Â· Cuenta Cloudflare
- [ ] [dash.cloudflare.com](https://dash.cloudflare.com)
- [ ] Sign up con email Atiko
- [ ] Confirmar email

#### 3.2 Â· Conectar dominio
- [ ] Add a Site â†’ `atikodigital.cl` â†’ Plan Free
- [ ] Anotar los 2 nameservers que te da Cloudflare
- [ ] Volver a NIC â†’ cambiar nameservers
- [ ] Esperar propagaciÃ³n (1-24h, generalmente <1h)

#### 3.3 Â· Crear repo Atiko-web (PARA EL SITIO PÃšBLICO)
```bash
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko"
git init
git add .
git commit -m "initial Â· launch ready"

# En GitHub: crear repo nuevo "atiko-web" (privado)
git remote add origin https://github.com/TU-USUARIO/atiko-web.git
git branch -M main
git push -u origin main
```

#### 3.4 Â· Deploy en Cloudflare Pages
- [ ] Workers & Pages â†’ Create application â†’ Pages â†’ Connect to Git
- [ ] Autorizar GitHub, elegir `atiko-web`
- [ ] Build command: vacÃ­o Â· Output: `/`
- [ ] Save and Deploy â†’ espera 2 min
- [ ] Custom domain â†’ `atikodigital.cl`
- [ ] Verificar SSL en https://atikodigital.cl

### DÃ­a 4 Â· IndexaciÃ³n SEO (45 min)

#### 4.1 Â· Google Search Console
- [ ] [search.google.com/search-console](https://search.google.com/search-console)
- [ ] Add Property â†’ URL Prefix â†’ `https://atikodigital.cl/`
- [ ] Verificar con HTML tag
- [ ] **IMPORTANTE:** Pasame el tag y te lo agrego al `<head>`
- [ ] Submit sitemap â†’ `sitemap.xml`
- [ ] Request indexing manual de: `/`, `/agentes-ia/`, `/automatizaciones/`, `/catalogo/`, `/precios/`

#### 4.2 Â· Google Analytics 4
- [ ] [analytics.google.com](https://analytics.google.com)
- [ ] Crear cuenta "Atiko" â†’ propiedad atikodigital.cl
- [ ] Time zone: America/Santiago Â· Currency: CLP
- [ ] Crear web data stream
- [ ] **Pasame el Measurement ID** (G-XXXXXXXXXX) y te lo agrego al sitio

#### 4.3 Â· Bing Webmaster Tools
- [ ] [bing.com/webmasters](https://www.bing.com/webmasters)
- [ ] Importar desde Google Search Console (1 click)

### DÃ­a 5 Â· Presencia local (2 horas)

#### 5.1 Â· Google Business Profile â­ CRÃTICO
- [ ] [business.google.com](https://business.google.com)
- [ ] Nombre: Agencia Atiko
- [ ] CategorÃ­a: Marketing Agency (+ Software Company + Business Consultant)
- [ ] UbicaciÃ³n: Service area (RegiÃ³n Metropolitana) sin direcciÃ³n fÃ­sica
- [ ] TelÃ©fono: +56 9 2713 0792
- [ ] Web: https://atikodigital.cl
- [ ] Iniciar verificaciÃ³n (postal o video)

#### 5.2 Â· Reservar redes sociales
- [ ] Instagram: @atikodigital.cl
- [ ] LinkedIn empresa: Agencia Atiko (con tu personal como admin)
- [ ] TikTok: @atikodigital.cl
- [ ] X/Twitter: @atikodigital

### DÃ­a 6 Â· QA + Soft launch (3-4 horas)

#### 6.1 Â· QA final
- [ ] Verificar que GA4 estÃ© recibiendo datos
- [ ] Probar TODOS los CTAs de WhatsApp en mobile real
- [ ] Verificar preview del link en WhatsApp (mandate a vos mismo)
- [ ] securityheaders.com debe sacar A o A+
- [ ] pagespeed.web.dev: home + 1 hub + 1 servicio + blog

#### 6.2 Â· Soft launch
- [ ] Lista de 30-50 contactos cercanos en Sheet
- [ ] Mensaje WhatsApp personalizado a cada uno (no copy-paste)
- [ ] Post en LinkedIn personal con story de lanzamiento
- [ ] Story en Instagram
- [ ] Recopilar feedback de 10-20 visitas en Notion/Sheet

---

## ðŸ› ï¸ FASE 2 Â· Semanas 2-4 Â· Construir Atiko Platform (backend)

> **Objetivo:** Tener el framework backend propio funcionando, listo para onboardear al primer cliente real.

### Semana 2 Â· Setup del framework (yo te escribo, vos testeÃ¡s)

#### 2.1 Â· Crear repo `atiko-platform` (PARA EL BACKEND)
```bash
cd "C:\Users\josea\Desktop\proyectos\paginas web\"
mkdir atiko-platform
cd atiko-platform
git init
```

**Estructura objetivo:**
```
atiko-platform/
â”œâ”€â”€ apps/
â”‚   â”œâ”€â”€ api/              # Backend Fastify (Node + TypeScript)
â”‚   â”œâ”€â”€ dashboard/        # Next.js panel del cliente
â”‚   â””â”€â”€ worker/           # Workers para tareas async/cron
â”œâ”€â”€ packages/
â”‚   â”œâ”€â”€ core/             # Tipos compartidos, schema DB
â”‚   â”œâ”€â”€ modules/          # Cada automatizaciÃ³n un mÃ³dulo
â”‚   â”‚   â”œâ”€â”€ voucher-to-sheets/
â”‚   â”‚   â”œâ”€â”€ cobranza-whatsapp/
â”‚   â”‚   â”œâ”€â”€ boletas-sii/
â”‚   â”‚   â””â”€â”€ ...
â”‚   â”œâ”€â”€ integrations/     # Twilio, Anthropic, OpenFactura, Fintoc, Google
â”‚   â””â”€â”€ ui/               # Componentes compartidos dashboard
â”œâ”€â”€ docs/                 # DocumentaciÃ³n interna
â”œâ”€â”€ scripts/              # Setup, migrations, seeds
â”œâ”€â”€ .env.example
â”œâ”€â”€ package.json          # workspace monorepo
â”œâ”€â”€ pnpm-workspace.yaml
â””â”€â”€ README.md
```

#### 2.2 Â· Decisiones tÃ©cnicas confirmadas
- Lenguaje: **Node.js 20 + TypeScript 5**
- HTTP framework: **Fastify 5** (mÃ¡s rÃ¡pido que Express)
- DB: **Supabase** (PostgreSQL + Auth + Storage + Realtime)
- Hosting backend: **Fly.io** (mÃ¡s simple que DigitalOcean, ~USD $10/mes)
- Dashboard cliente: **Next.js 15 + Tailwind**
- Auth: **Supabase Auth** (multi-tenant nativo)
- Testing: **Vitest**
- Monorepo: **pnpm workspaces**
- CI/CD: **GitHub Actions** â†’ Fly.io auto-deploy

#### 2.3 Â· Sprint backlog Semana 2
- [ ] Setup monorepo + tooling (1 dÃ­a) â†’ yo escribo, vos `pnpm install`
- [ ] Schema Supabase (clientes, automatizaciones, ejecuciones, logs) (1 dÃ­a)
- [ ] API base Fastify + auth middleware (1 dÃ­a)
- [ ] Sistema de webhooks `/api/v1/hooks/:client/:module` (1 dÃ­a)
- [ ] Primer mÃ³dulo: `voucher-to-sheets` completo + tests (2 dÃ­as)

### Semana 3 Â· Dashboard del cliente

#### 3.1 Â· Backlog Semana 3
- [ ] Setup Next.js + Tailwind + shadcn/ui
- [ ] Login multi-tenant con Supabase Auth
- [ ] Ver automatizaciones activas del cliente
- [ ] Ver mÃ©tricas (ejecuciones, horas ahorradas, errores)
- [ ] Ver logs de cada ejecuciÃ³n
- [ ] Activar/pausar automatizaciones
- [ ] Deploy a `panel.atikodigital.cl` (Cloudflare Pages o Vercel)

### Semana 4 Â· 3 mÃ³dulos mÃ¡s + onboarding 1er cliente

- [ ] MÃ³dulo `cobranza-whatsapp`
- [ ] MÃ³dulo `agendamiento-whatsapp`
- [ ] MÃ³dulo `agente-ia-conversacional` (Claude + memoria)
- [ ] DocumentaciÃ³n de cÃ³mo agregar un cliente nuevo
- [ ] Hacer el onboarding del 1er cliente real
- [ ] Iterar segÃºn feedback

---

## ðŸ“£ FASE 3 Â· Mes 2 Â· Ventas + contenido (4 semanas)

> **Objetivo:** 3-5 clientes fundadores activos. $400-800k MRR.

### Outbound (15 mensajes/semana = 60/mes)

#### Lista de 50 pymes objetivo (crear en Sheet)
- 10 restaurantes en zonas premium (Las Condes, Vitacura)
- 10 clÃ­nicas dentales medianas
- 10 e-commerce de Instagram (200+ followers activos)
- 10 estudios profesionales (contadores, abogados pyme)
- 10 inmobiliarias y servicios tÃ©cnicos

#### Mensaje base
Ver plantilla completa en `PLAN-LANZAMIENTO-ATIKO.md` secciÃ³n 7.3.

#### MÃ©tricas esperadas (50 mensajes/mes)
- 15-25 respuestas (30-50%)
- 5-10 agendan llamada
- 1-3 contratan

### Contenido blog (2 artÃ­culos/semana)

Semana 5: Claude vs GPT-4 vs Gemini para pymes Â· CuÃ¡nto cuesta un agente IA Chile 2026
Semana 6: WhatsApp Business API vs WhatsApp normal Â· CÃ³mo cumplir Ley 21.719 con IA
Semana 7: 10 automatizaciones para restaurantes Â· Automatizar vs contratar
Semana 8: Tutorial OpenFactura + n8n boletas SII Â· 10 automatizaciones clÃ­nica dental

### LinkedIn personal + Atiko (3 posts/semana)

- 1 post de "caso real" (anonimizado)
- 1 post de "hot take" sobre IA/automatizaciÃ³n
- 1 post compartiendo artÃ­culo del blog

---

## ðŸ“Š FASE 4 Â· Meses 3-6 Â· Escalar (12 semanas)

> **Objetivo:** 8-12 clientes activos. $1.5-2.5M MRR. Casos de estudio pÃºblicos.

### Mes 3
- Llegar a 5-8 clientes activos
- Pulir el dashboard del cliente
- Implementar sistema de referidos (cliente que trae cliente = 1 mes gratis)
- Crear primer caso de estudio pÃºblico (`/casos/cliente-1/`)

### Mes 4
- 8-10 clientes activos
- Dashboard con mÃ©tricas avanzadas (forecasting, anomaly detection)
- 5 mÃ³dulos mÃ¡s del framework (total 12-15)
- Lanzar newsletter mensual con casos + tips

### Mes 5
- 10-12 clientes activos
- Considerar contratar primer freelancer (devops/operaciones)
- Programa de partners (resellers/freelancers que vendan Atiko)
- 2 casos de estudio pÃºblicos

### Mes 6
- 12-15 clientes activos
- Workshop pÃºblico sobre IA para pymes (gratis, captura leads)
- Aparecer en 2-3 podcasts chilenos
- Considerar contratar SDR para outbound a escala

---

## ðŸ’° Resumen financiero del plan

### InversiÃ³n total para arrancar (semanas 1-4)
| Item | Monto |
|------|-------|
| Dominio atikodigital.cl | $9.940 CLP Ãºnica vez |
| Cloudflare Pages | $0 |
| GitHub (privado) | $0 |
| Supabase (free tier) | $0 |
| Fly.io (cuando deploy backend) | ~USD $10/mes ($10k CLP) |
| Anthropic Claude API | ~USD $5/mes inicial ($5k CLP) |
| Twilio (cuando primer cliente) | ~USD $10/mes ($10k CLP) |
| **TOTAL primer mes** | **~$35.000 CLP** |

### Ingresos esperados (modelo conservador)
| Mes | Clientes | MRR | Costos | Net |
|-----|----------|-----|--------|-----|
| 1 | 0 | $0 | $35k | -$35k |
| 2 | 1 (descuento 30%) | $133k | $50k | +$83k |
| 3 | 3 | $400k | $80k | +$320k |
| 4 | 5 | $700k | $120k | +$580k |
| 5 | 7 | $1.0M | $150k | +$850k |
| 6 | 10 | $1.5M | $200k | +$1.3M |
| 12 | 20-30 | $4-7M | $500k | +$3.5-6.5M |

---

## ðŸŽ¯ Las 3 cosas a hacer HOY (decisiones bloqueantes)

1. **Comprar dominio `atikodigital.cl`** en nic.cl ($9.940 CLP, 20 min) â†’ bloquea todo lo demÃ¡s
2. **Crear cuenta Gmail `atikodigital@gmail.com`** â†’ necesaria para Google Business + Search Console + Analytics
3. **Crear cuenta GitHub** con esa cuenta Gmail â†’ necesaria para subir tanto el sitio como el platform

Cuando tengas esas 3, avisame y arrancamos el deploy del sitio + setup del repo de la platform en paralelo.

---

## ðŸ“ž CuÃ¡ndo me necesitÃ¡s (modelo de trabajo conmigo)

### Para deploy del sitio (Fase 1)
- Cuando tengas el dominio + cuentas â†’ iniciamos sesiÃ³n, te guÃ­o paso a paso
- ~3-4 sesiones de 1-2 horas total

### Para construir el framework (Fase 2)
- SesiÃ³n cada 2-3 dÃ­as donde yo escribo cÃ³digo y vos testeÃ¡s
- ~12-15 sesiones en 3 semanas
- Yo te entrego el cÃ³digo, vos hacÃ©s `git push` y deploy

### Para contenido (Fase 3+)
- SesiÃ³n semanal de 1-2 horas para 1-2 artÃ­culos
- Posts LinkedIn los podÃ©s generar conmigo en ratos sueltos

---

## âš ï¸ Errores que NO hay que cometer

1. **No empezar el framework antes del sitio publicado** â†’ necesitÃ¡s validar con clientes primero
2. **No prometer al primer cliente algo que no podÃ©s entregar** â†’ mejor menos features pero estables
3. **No descontinuar el blog cuando lleguen clientes** â†’ el SEO se construye con consistencia
4. **No bajar el precio para conseguir mÃ¡s clientes** â†’ $89k/mes ya es muy bajo, defendelo
5. **No automatizar tu propia operaciÃ³n sin clientes** â†’ primero clientes, despuÃ©s optimizar
6. **No olvidarse de pedir reviews** a cada cliente contento â†’ reseÃ±as en Google Business son crÃ­ticas para SEO local

---

## ðŸŽ‰ Cuando consigas el cliente #5

HacÃ©s un post en LinkedIn celebrÃ¡ndolo, generÃ¡s caso de estudio en `/casos/`, pedÃ­s a esos 5 que escriban testimonial corto que vas a poner en home como "social proof", y considerÃ¡s subir precios para los clientes siguientes (los primeros 5 mantienen el descuento del 30% como prometido).

---

**Ãšltima actualizaciÃ³n:** 2026-05-24
**PrÃ³xima revisiÃ³n:** DespuÃ©s de tener el sitio publicado (DÃ­a 7 del plan)

