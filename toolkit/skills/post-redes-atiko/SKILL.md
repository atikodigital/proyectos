---
name: post-redes-atiko
description: Genera posts para redes sociales (Instagram, LinkedIn, X/Twitter, Facebook) con la voz de marca Atiko. Adapta el contenido al formato y audiencia de cada plataforma. Entrega copy listo + brief de diseÃ±o para Canva + hashtags chilenos relevantes. Se activa con "post para [red]", "redes sociales atiko", "publicar sobre [tema]", "contenido de hoy", "carrusel sobre [tema]".
version: 1.0
author: Atiko
---

# Post Redes Sociales Atiko â€” Skill

## CuÃ¡ndo usar esta skill

Para generar contenido orgÃ¡nico de Atiko (no para clientes â€” para los clientes existe `marketing:draft-content`).

Triggers:
- "post para Instagram sobre [tema]"
- "publica en LinkedIn que [logro]"
- "contenido para [red] hoy"
- "carrusel sobre [tema]"
- "necesito post sobre [tema]"
- "story de [evento]"

## Voz de marca Atiko (siempre aplicar)

### Tono
- **Directo y honesto** â€” sin marketing-speak vacÃ­o
- **Ãštil primero, vendedor despuÃ©s** â€” 80% del contenido enseÃ±a, 20% vende
- **Cercano sin perder profesionalismo** â€” tutea, pero no es informal extremo
- **Storytelling con datos** â€” todas las afirmaciones con nÃºmeros o ejemplos reales
- **Chileno sin chilenismos excesivos** â€” "pyme", "negocio", evitar "huevÃ³n", "weÃ³n", "po"

### Lo que SÃ usa Atiko
- Cifras concretas ($89.000, "3 horas/dÃ­a", "127 vouchers")
- Ejemplos reales (anonimizados si es cliente)
- Preguntas que hacen pensar al lector
- Llamados a la acciÃ³n claros (1 por post)

### Lo que NO usa Atiko
- âŒ "Revoluciona", "transforma", "potencia", "innovador" â€” verbos vacÃ­os
- âŒ "Somos los mejores" â€” autobombo sin sustento
- âŒ Emojis decorativos en cada palabra (mÃ¡ximo 2-3 emojis por post)
- âŒ Hashtags spam #motivaciÃ³n #emprendedor #pyme #chile en cantidad
- âŒ Stock photos genÃ©ricas
- âŒ Frases de coach motivacional ("Ã©xito es tuyo si quieres")

## InformaciÃ³n requerida

Antes de generar:

1. **Tema/asunto** del post
2. **Red social** (Instagram, LinkedIn, X, Facebook â€” uno o varios)
3. **Formato** (post simple, carrusel, reel, story, video)
4. **Objetivo** (educar, demostrar caso, anuncio, captar lead, conversaciÃ³n)
5. **Llamada a la acciÃ³n** (ver web, agendar, escribir WhatsApp, ninguna)

Si no se especifica formato/red, sugerir el mejor matching:

| Tema | Mejor red | Formato |
|------|-----------|---------|
| Caso de cliente | LinkedIn + IG | Carrusel 5-7 slides |
| Tip rÃ¡pido | IG + X | Post simple o reel 30s |
| Anuncio empresa (cumple/logro) | LinkedIn | Post largo con foto |
| Comparativa "antes/despuÃ©s" | IG | Carrusel 2 slides |
| Howto tÃ©cnico | LinkedIn + Blog | Post largo |
| DetrÃ¡s de cÃ¡maras | IG Stories | Story con sticker |

## Plantillas por formato

### A. Post Instagram simple (1080Ã—1080)

```markdown
# Post IG â€” [Tema]

## Copy del post

[LÃ­nea 1: Pregunta o afirmaciÃ³n rompedora]

[PÃ¡rrafos cortos, 2-3 lÃ­neas cada uno, con espacio en blanco]
[Total: 7-12 lÃ­neas mÃ¡ximo]

[Cierre con CTA en 1 lÃ­nea]

âš“ [hashtag principal #atiko]
ðŸ”— [URL si aplica]

## Hashtags (separados al final, NO en el texto principal)
.
.
.
#diseÃ±oweb #pymeschile #automatizaciones #santiago #agenciadigital #marketingdigital #chile #emprendedor #negociodigital #atiko

## Brief de diseÃ±o para Canva

**Plantilla:** Post-IG-Atiko-Base
**Fondo:** Negro #000000 con vignette dorada sutil
**Logo:** Esquina superior izquierda, escala 12%
**TÃ­tulo principal:** Bebas Neue, 80-120pt, blanco, centrado vertical superior
**SubtÃ­tulo/dato:** Space Grotesk 500, 24pt, dorado #C8A46A
**LÃ­nea decorativa:** Gradient doradoâ†’azul horizontal bajo el subtÃ­tulo
**Pie:** "@atikoagencia Â· atikodigital.cl" en 14pt, opacidad 60%

**Concepto visual:** [describir 1-2 lÃ­neas quÃ© mostrar]

## Mejor hora para publicar (Chile)
[DÃ­a sugerido] a las [hora] â€” mÃ¡s engagement en pyme target
```

### B. Carrusel Instagram (1080Ã—1080 Ã— 5-10 slides)

```markdown
# Carrusel IG â€” [Tema]

## Estructura

### Slide 1 â€” Portada (hook)
**TÃ­tulo:** [Pregunta o promesa en 5-7 palabras]
**SubtÃ­tulo:** "Desliza â†’"
**Concepto visual:** [breve]

### Slide 2 â€” Contexto
**TÃ­tulo:** El problema
**Texto:** [2-3 lÃ­neas describiendo el dolor]

### Slide 3 â€” Datos o ejemplo
**TÃ­tulo:** [stat o caso]
**Visual:** Gran nÃºmero o grÃ¡fico simple

### Slide 4 â€” SoluciÃ³n
**TÃ­tulo:** Lo que sÃ­ funciona
**Texto:** [soluciÃ³n en 3-4 bullets]

### Slide 5 â€” Detalle 1
[contenido]

### Slide 6 â€” Detalle 2
[contenido]

### Slide 7 â€” Cierre con CTA
**Texto:** "Â¿Quieres aplicar esto a tu negocio?"
**CTA:** "WhatsApp +56 9 2713 0792 Â· atikodigital.cl"
**DiseÃ±o:** Logo grande + colores marca

## Copy del post (caption)

[Pregunta inicial al lector]

[2-3 pÃ¡rrafos profundizando el tema del carrusel]

[CTA claro]

Â¿CuÃ¡l de estos te ha pasado? CuÃ©ntame â†“

#atiko #pymeschile

## Hashtags
.
.
.
[15 hashtags relevantes mezclando chilenos + sector]
```

### C. Post LinkedIn (artÃ­culo corto)

```markdown
# Post LinkedIn â€” [Tema]

## Copy

[LÃ­nea 1: hook que para el scroll â€” mÃ¡ximo 10 palabras]

[Espacio en blanco]

[PÃ¡rrafo 1: contexto. 2-3 lÃ­neas]

[PÃ¡rrafo 2: problema. 2-3 lÃ­neas]

[PÃ¡rrafo 3: insight o dato. 1-2 lÃ­neas]

[PÃ¡rrafo 4: soluciÃ³n/aprendizaje. 2-3 lÃ­neas]

[Espacio en blanco]

[Pregunta al lector que invite a comentar]

---
ðŸ‘‡ Â¿QuÃ© opinas?
---

PD: Si tu pyme tiene este problema, conversamos sin compromiso.
WhatsApp +56 9 2713 0792.

## Hashtags (3-5 max para LinkedIn)
#PymesChile #TransformaciÃ³nDigital #AutomatizaciÃ³n

## Recomendaciones LinkedIn especÃ­ficas
- Largo ideal: 1.300 caracteres (umbral para "ver mÃ¡s")
- Sin emojis decorativos (mÃ¡ximo 1 al inicio para parar el scroll)
- Subir foto/imagen aumenta alcance 2x
- Mejor horario Chile: Martes/MiÃ©rcoles 8-10am o 17-19pm
```

### D. Tweet / X (280 caracteres)

```markdown
# X / Twitter â€” [Tema]

## Tweet

[LÃ­nea 1 fuerte, mÃ¡ximo 200 caracteres]

[LÃ­nea 2 con dato o CTA: mÃ¡ximo 70 caracteres]

[opcional: link]

## Variantes (probar A/B)
1. [versiÃ³n con pregunta]
2. [versiÃ³n con nÃºmero]
3. [versiÃ³n con polÃ©mica suave]

## Mejor formato hilo (si tema lo amerita)
- Tweet 1: hook (lo dado)
- Tweet 2-5: cada uno desarrolla 1 punto
- Tweet final: CTA + atikodigital.cl
```

### E. Reel/Story Instagram (1080Ã—1920, 15-30s)

```markdown
# Reel/Story IG â€” [Tema]

## Guion (15-30 segundos)

### 0-3s â€” HOOK
[Frase contundente. Visual: persona hablando a cÃ¡mara o cifra grande]

### 3-12s â€” DESARROLLO
[3-4 puntos en sucesiÃ³n rÃ¡pida, transiciones cada 2-3s]

### 12-25s â€” REVELACIÃ“N/SOLUCIÃ“N
[Beneficio o soluciÃ³n]

### 25-30s â€” CTA
[AcciÃ³n concreta + handle]

## Texto en pantalla por escena

| Tiempo | Texto en pantalla | AcciÃ³n visual |
|--------|-------------------|----------------|
| 0-3s | [HOOK] | [acciÃ³n] |
| 3-6s | [punto 1] | [acciÃ³n] |
| 6-9s | [punto 2] | [acciÃ³n] |
| 9-12s | [punto 3] | [acciÃ³n] |
| 12-18s | [soluciÃ³n] | [acciÃ³n] |
| 18-25s | [demostraciÃ³n] | [acciÃ³n] |
| 25-30s | [CTA] | [logo + handle] |

## Audio sugerido
- [Tipo de audio: lo-fi / trending / voz propia]
- Mejor: voz propia + mÃºsica suave de fondo (gana algoritmo en 2026)

## Caption del reel
[2-3 lÃ­neas resumiendo el reel + CTA + hashtags]
```

## Banco de temas evergreen (siempre listos)

Cuando JosÃ© no sepa quÃ© postear, sugerir uno de estos:

### Sobre automatizaciones
1. Â¿CuÃ¡ntas horas pierde tu pyme copiando vouchers a Excel?
2. El cliente que ahorrÃ³ 38 horas/mes con UNA automatizaciÃ³n
3. Por quÃ© un chatbot con IA es mejor que respuestas predefinidas
4. El proceso de tu pyme que se puede automatizar HOY
5. n8n vs Make vs Zapier: cuÃ¡l usa Atiko y por quÃ©
6. CÃ³mo saber si una automatizaciÃ³n vale la pena (regla del 5x)
7. Los 5 procesos mÃ¡s rentables de automatizar en HORECA

### Sobre diseÃ±o web
1. Por quÃ© los sitios de Webflow se ven mÃ¡s caros que los de WordPress
2. Â¿Tu landing convierte o decora? La diferencia
3. CuÃ¡nto cuesta REALMENTE una pÃ¡gina web en Chile (sin chamuyo)
4. 7 errores en tu sitio que ahuyentan clientes
5. Antes/despuÃ©s: el sitio de [cliente anÃ³nimo]

### Sobre marketing
1. La diferencia entre Meta Ads y Google Ads para servicios profesionales
2. Â¿CuÃ¡nto presupuesto MÃNIMO para que las campaÃ±as funcionen?
3. Por quÃ© tu Google Business Profile es mÃ¡s importante que tu Instagram (a veces)
4. El email marketing estÃ¡ vivo: cÃ³mo lo usa Atiko

### Sobre la agencia
1. Por quÃ© Atiko cobra por suscripciÃ³n y no por proyecto
2. QuiÃ©nes son los clientes ideales (y quiÃ©nes NO)
3. El proceso que seguimos del kickoff al lanzamiento
4. Casos: cliente HORECA / Servicios Profesionales / E-commerce

### Sobre Chile pyme
1. Las 3 herramientas chilenas que toda pyme deberÃ­a conocer (SII, Acepta, Khipu)
2. F29 sin estrÃ©s: cÃ³mo se prepara una pyme bien organizada
3. Webpay vs Mercado Pago vs Khipu: cuÃ¡l conviene a tu pyme

## Calendario sugerido (cuando no haya nada hot)

| DÃ­a | Plataforma | Tipo |
|-----|------------|------|
| Lunes | LinkedIn | Post largo educativo |
| Martes | Instagram | Carrusel tip |
| MiÃ©rcoles | LinkedIn + IG | Caso de cliente |
| Jueves | Instagram | Reel rÃ¡pido |
| Viernes | Instagram + LinkedIn | Pregunta/comunidad |
| SÃ¡bado | â€” | Descanso o respuesta a comentarios |
| Domingo | Instagram | Story behind-the-scenes |

## MÃ©tricas a trackear (manual o con Postiz)

DespuÃ©s de cada publicaciÃ³n, anotar:

- Plataforma
- Fecha/hora
- Tema
- Formato
- Reach
- Engagement rate
- Comentarios
- Leads generados (mensajes WhatsApp tras post)

Al mes, identificar:
- Top 3 posts por engagement
- Top 3 posts por conversiÃ³n a lead
- Patrones (Â¿caso de cliente convierte? Â¿tip educativo da reach?)

Iterar: hacer MÃS de lo que funciona.

## Hashtags por sector (banco)

### Generales
#PymesChile #SantiagoChile #AgenciaDigital #MarketingDigital #DiseÃ±oWebChile

### AutomatizaciÃ³n
#AutomatizaciÃ³n #InteligenciaArtificial #ChatbotWhatsApp #N8n #IAparaempresas

### Por nicho cliente
HORECA: #RestaurantesChile #GastronomiaChile #CafeteriaSantiago
Profesionales: #PymeProfesional #StudioJurÃ­dico #DentistaChile
E-commerce: #EcommerceChile #TiendaOnline #VentaOnline

### Trending (rotar)
#Chile2026 #EmprendedoresChile #PymesQueAvanzan

