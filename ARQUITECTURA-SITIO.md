# Arquitectura del Sitio Atiko

**Fecha:** 2026-05-22
**VersiÃ³n:** 2.0 (refactor multi-pÃ¡gina)

Este documento describe la arquitectura completa del sitio `atikodigital.cl`, quÃ© keyword objetivo tiene cada pÃ¡gina, quÃ© propÃ³sito cumple en el funnel y cÃ³mo se enlazan entre sÃ­.

---

## Mapa de pÃ¡ginas (19 pÃ¡ginas indexables)

```
atikodigital.cl/
â”‚
â”œâ”€â”€ index.html                                    [HOME Â· brand Â· cinematogrÃ¡fica]
â”œâ”€â”€ privacidad.html                               [legal]
â”œâ”€â”€ terminos.html                                 [legal]
â”‚
â”œâ”€â”€ servicios/
â”‚   â”œâ”€â”€ index.html                                [HUB servicios]
â”‚   â”œâ”€â”€ diseno-web-pymes/index.html               [servicio]
â”‚   â”œâ”€â”€ agentes-ia-whatsapp/index.html            [servicio]
â”‚   â”œâ”€â”€ automatizar-boletas-sii/index.html        [servicio]
â”‚   â”œâ”€â”€ automatizar-cobranza/index.html           [servicio]
â”‚   â””â”€â”€ voucher-whatsapp-sheets/index.html        [servicio estrella]
â”‚
â”œâ”€â”€ industrias/
â”‚   â”œâ”€â”€ index.html                                [HUB industrias]
â”‚   â”œâ”€â”€ horeca/index.html                         [industria]
â”‚   â”œâ”€â”€ servicios-profesionales/index.html        [industria]
â”‚   â”œâ”€â”€ ecommerce/index.html                      [industria]
â”‚   â””â”€â”€ clinicas-dentales/index.html              [industria]
â”‚
â”œâ”€â”€ precios/index.html                            [consideraciÃ³n]
â”œâ”€â”€ proceso/index.html                            [consideraciÃ³n]
â”œâ”€â”€ sobre/index.html                              [brand]
â”‚
â””â”€â”€ blog/
    â”œâ”€â”€ index.html                                [HUB blog]
    â””â”€â”€ automatizar-voucher-whatsapp-google-sheets/index.html  [pillar tutorial]
```

---

## Mapa keyword â†’ pÃ¡gina

### PÃ¡ginas core
| PÃ¡gina | Keyword principal | Keyword secundaria | Vol estimado |
|---|---|---|---|
| `/` | atiko Â· agencia digital pymes | atiko chile | brand |
| `/servicios/` | servicios agencia digital pymes chile | â€” | medio |
| `/industrias/` | agencia digital por industria | â€” | bajo |
| `/precios/` | cuanto cuesta agencia digital chile | precios web pymes santiago | alto |
| `/proceso/` | como trabaja agencia digital | â€” | bajo |
| `/sobre/` | atiko quien es | brand | brand |
| `/blog/` | blog automatizaciÃ³n pymes | â€” | bajo |

### PÃ¡ginas de servicio (alta intenciÃ³n de compra)
| PÃ¡gina | Keyword principal | Vol estimado | Competencia |
|---|---|---|---|
| `/servicios/diseno-web-pymes/` | diseÃ±o web pymes chile | alto | alta |
| `/servicios/agentes-ia-whatsapp/` | chatbot whatsapp ia chile | medio | media |
| `/servicios/automatizar-boletas-sii/` | automatizar boletas sii chile | medio | baja |
| `/servicios/automatizar-cobranza/` | automatizar cobranza whatsapp pyme | bajo | muy baja |
| `/servicios/voucher-whatsapp-sheets/` | voucher whatsapp google sheets | bajo | nula |

### PÃ¡ginas de industria (segmentaciÃ³n B2B)
| PÃ¡gina | Keyword principal | Vol estimado |
|---|---|---|
| `/industrias/horeca/` | agencia digital restaurantes chile | medio |
| `/industrias/servicios-profesionales/` | web abogados chile | medio |
| `/industrias/ecommerce/` | agencia ecommerce chile | alto |
| `/industrias/clinicas-dentales/` | marketing clinica dental chile | alto |

### Blog (long-tail)
| PÃ¡gina | Keyword principal | Vol estimado |
|---|---|---|
| `/blog/automatizar-voucher-whatsapp-google-sheets/` | como automatizar voucher whatsapp sheets | bajo (nicho) |

---

## Estructura de enlaces internos

### Cada pÃ¡gina de servicio enlaza a:
- â†‘ Hub `/servicios/` (breadcrumb)
- â†’ PÃ¡gina de pricing `/precios/`
- â†’ Otras pÃ¡ginas de servicios relacionados (en footer)
- â†’ WhatsApp con texto pre-armado por servicio

### Cada pÃ¡gina de industria enlaza a:
- â†‘ Hub `/industrias/` (breadcrumb)
- â†’ PÃ¡ginas de servicios mencionados en el contenido
- â†’ Precios `/precios/`
- â†’ WhatsApp con texto pre-armado por industria

### Home enlaza a:
- Servicios (hub)
- Industrias (hub)
- Precios
- Blog
- Sobre

### Blog post enlaza a:
- Servicios relacionados (caso del voucher â†’ /servicios/voucher-whatsapp-sheets/)
- Otros artÃ­culos del blog
- Precios

---

## Schema.org por pÃ¡gina

| PÃ¡gina | Schema principal |
|---|---|
| `/` | ProfessionalService + OfferCatalog |
| `/servicios/` | ItemList + BreadcrumbList |
| `/servicios/*/` | Service + FAQPage + BreadcrumbList |
| `/industrias/*/` | Service (audience B2B) + BreadcrumbList |
| `/precios/` | FAQPage + BreadcrumbList |
| `/sobre/` | AboutPage + BreadcrumbList |
| `/blog/` | Blog + BreadcrumbList |
| `/blog/*/` | Article + HowTo + BreadcrumbList |

---

## Estrategia SEO por fase

### Fase 1 â€” IndexaciÃ³n (semanas 1-4)
- Submit sitemap a Google Search Console
- Indexar todas las URLs manualmente via "Inspeccionar URL"
- Verificar Core Web Vitals en cada pÃ¡gina (objetivo: verde en mobile)
- Aparecer por "atiko chile" (brand search)

### Fase 2 â€” Long-tail (mes 2-4)
- Publicar 1-2 artÃ­culos/semana en el blog
- Empezar a rankear keywords con baja competencia:
  - "voucher whatsapp google sheets"
  - "automatizar voucher whatsapp"
  - "agente ia restaurante chile"
- Backlinks iniciales: directorios pyme chile, perfiles redes

### Fase 3 â€” Industrias especÃ­ficas (mes 4-8)
- Empezar a aparecer en bÃºsquedas tipo "marketing clinica dental [comuna]"
- Casos de estudio reales (cuando lleguen)
- Reviews en Google Business Profile

### Fase 4 â€” Keywords competitivas (mes 8-18)
- Atacar "agencia digital pymes chile", "diseÃ±o web pymes santiago"
- RequerirÃ¡ 30+ backlinks de calidad
- 50+ artÃ­culos en el blog

---

## PÃ¡ginas a crear en futuro (no urgente)

### MÃ¡s industrias
- `/industrias/inmobiliarias/`
- `/industrias/educacion/`
- `/industrias/medicos-generales/`
- `/industrias/peluquerias-spa/`

### MÃ¡s servicios tÃ©cnicos
- `/servicios/seo-pymes/`
- `/servicios/google-ads-pymes/`
- `/servicios/meta-ads-pymes/`
- `/servicios/email-marketing-pymes/`

### MÃ¡s posts pillar
- "CuÃ¡nto cuesta una pÃ¡gina web en Chile 2026"
- "WhatsApp Business API vs WhatsApp normal"
- "Mejores chatbots IA para pymes chilenas"
- "n8n para principiantes: primera automatizaciÃ³n"
- "CÃ³mo hacer SEO local Santiago Chile"
- "10 automatizaciones n8n para restaurantes"
- "Mejores proveedores DTE Chile 2026"
- "Caso de estudio: clÃ­nica X automatizÃ³ Y, ahorra Z horas"

### PÃ¡ginas de comparaciÃ³n (alto valor SEO)
- `/vs/wakup/` â€” comparativa con competidor
- `/vs/freelancer-vs-agencia/`
- `/atiko-vs-shopify/`

### Otros
- `/contacto/` (pÃ¡gina propia en vez de solo CTA)
- `/clientes/` (casos de estudio cuando los tengamos)
- `/recursos/` (descargables: plantillas, checklists)

---

## Notas tÃ©cnicas

### CSS compartido
Todas las pÃ¡ginas internas usan `/assets/shared.css`. Si se actualiza, se aplica a todas. Cambios visuales deben respetar la paleta del home (gold #c8a46a, negro, etc.).

### Performance
Cada pÃ¡gina interior carga &lt;200kB total (sin frames pesados como el home). LCP objetivo &lt;1.5s, CLS &lt;0.1.

### Mobile-first
DiseÃ±adas para mobile primero. Probar siempre en mobile real antes de declarar terminada una pÃ¡gina.

### Accesibilidad
- Breadcrumbs con `aria-label`
- Skip links a contenido principal
- ImÃ¡genes con `alt`
- Contraste mÃ­nimo WCAG AA

---

**PrÃ³xima revisiÃ³n:** Cuando se publiquen los primeros 5 artÃ­culos del blog (~mes 2)

