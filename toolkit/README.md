# Atiko Toolkit Â· Skills + Hooks + MCPs

> Sistema operativo de Agencia Atiko. Conjunto de skills, hooks y MCPs custom que automatizan los procesos clave del negocio: ventas, entrega, operaciÃ³n y automatizaciones para clientes.

---

## Inventario del toolkit

### ðŸŽ¯ Skills (7) â€” instrucciones que Claude carga cuando aplican

Skills que automatizan workflows propios de Atiko. Cada una vive en su carpeta con un `SKILL.md`.

| Skill | Para quÃ© | Triggers | Tiempo de uso |
|-------|----------|----------|----------------|
| **`cotizar-atiko`** | Generar propuesta comercial personalizada | "cotiza", "propuesta para X" | 5 min |
| **`discovery-call`** | Guion + notas de llamada de descubrimiento | "discovery con X", "preparame call" | Antes, durante, despuÃ©s |
| **`onboarding-cliente`** | Flujo completo desde firma hasta kickoff | "firmÃ³ X", "onboarding Y" | 30 min ejecuciÃ³n |
| **`reporte-mensual-cliente`** | Generar reporte mensual cliente | "reporte de X", "report mes Y" | 15 min |
| **`emision-boleta-sii`** | Emitir DTE en SII Chile paso a paso | "emite boleta", "factura SII" | 10 min |
| **`voucher-to-sheets`** | Playbook tÃ©cnico automatizaciÃ³n estrella | "implementar voucher", "voucher sheets" | Para entregar a clientes |
| **`post-redes-atiko`** | Generar copy + brief de diseÃ±o para redes | "post para IG", "carrusel sobre X" | 10 min |

### ðŸª Hooks (2) â€” eventos que disparan acciones automÃ¡ticas

Hooks corren sin intervenciÃ³n manual cuando ocurre un evento.

| Hook | CuÃ¡ndo dispara | QuÃ© hace |
|------|----------------|----------|
| **`auto-carpeta-cliente`** | Cliente nuevo en CRM (stage = customer) | Crea estructura Drive + bienvenida + share + notif WhatsApp |
| **`registro-leads`** | Lead llega por cualquier canal | Sheets + CRM + clasificaciÃ³n IA + auto-respuesta + notif JosÃ© |

### ðŸ”Œ MCPs (3) â€” servidores que conectan Claude con sistemas externos

MCPs expanden lo que Claude puede hacer conectÃ¡ndolo a servicios.

| MCP | Conecta con | CuÃ¡ndo construir |
|-----|-------------|-------------------|
| **`mcp-n8n`** | Tu n8n self-hosted | Cuando tengas 2+ automatizaciones corriendo |
| **`mcp-sii-chile`** | SII vÃ­a OpenFactura | Cuando emitas 5+ DTEs/mes |
| **`mcp-banco-fintoc`** | Banco vÃ­a Fintoc | Cuando tengas 5+ clientes pagando mensual |

---

## Orden de construcciÃ³n recomendado

NO construyas todo al mismo tiempo. Sigue este orden estricto:

### Etapa 1 â€” Skills bÃ¡sicas (esta semana, ~3 horas total)

Estas skills ya estÃ¡n creadas como archivos `.md`. Para usarlas:

1. Las skills estÃ¡n en `toolkit/skills/[nombre]/SKILL.md`
2. Cada vez que necesites una, abre una sesiÃ³n con Claude y dile: "Usa la skill cotizar-atiko" o describe lo que quieres y Claude la detecta por triggers
3. **Iterar** sobre cada skill: la primera vez que la uses, anota lo que no encajÃ³ y mejÃ³ralo

**AcciÃ³n:** las prÃ³ximas 3 veces que necesites cotizar/onboardear/reportar, usa las skills. Anota mejoras.

### Etapa 2 â€” Plugins externos (semana 2)

Antes de hooks y MCPs, instalar plugins ya disponibles:

- [ ] **Small Business plugin** (instÃ¡lalo desde la card que te sugerÃ­)
- [ ] **Zapier plugin** (instÃ¡lalo desde la card)
- [ ] **Postiz plugin** (instÃ¡lalo desde la card)

Esto te da 80% del valor con 0% de esfuerzo tÃ©cnico.

### Etapa 3 â€” Primer hook (mes 2)

Cuando tengas tu 2do cliente, implementar:

- [ ] **Hook `registro-leads`** (3h de implementaciÃ³n)

Este es el mÃ¡s alto ROI porque captura leads en segundo cero independiente del canal.

### Etapa 4 â€” MCP n8n (mes 2-3)

Cuando vendas la primera automatizaciÃ³n custom:

- [ ] **MCP `mcp-n8n`** + servidor DigitalOcean

Necesario para gestionar flows de clientes desde Claude.

### Etapa 5 â€” Hook auto-carpeta + MCP SII (mes 3-4)

Cuando tengas 3-5 clientes:

- [ ] **Hook `auto-carpeta-cliente`**
- [ ] **MCP `mcp-sii-chile`** (cuando emitas 5+ DTEs/mes)

### Etapa 6 â€” MCP Banco (mes 4-6)

Cuando tengas 5+ clientes recurrentes:

- [ ] **MCP `mcp-banco-fintoc`**

Cierra el ciclo: emitir factura â†’ detectar pago â†’ marcar pagada â†’ cobrar moroso.

---

## Estructura del toolkit

```
toolkit/
â”œâ”€â”€ README.md                                 â† este archivo
â”‚
â”œâ”€â”€ skills/
â”‚   â”œâ”€â”€ cotizar-atiko/SKILL.md
â”‚   â”œâ”€â”€ discovery-call/SKILL.md
â”‚   â”œâ”€â”€ onboarding-cliente/SKILL.md
â”‚   â”œâ”€â”€ reporte-mensual-cliente/SKILL.md
â”‚   â”œâ”€â”€ emision-boleta-sii/SKILL.md
â”‚   â”œâ”€â”€ voucher-to-sheets/SKILL.md
â”‚   â””â”€â”€ post-redes-atiko/SKILL.md
â”‚
â”œâ”€â”€ hooks/
â”‚   â”œâ”€â”€ auto-carpeta-cliente/HOOK.md
â”‚   â””â”€â”€ registro-leads/HOOK.md
â”‚
â””â”€â”€ mcps/
    â”œâ”€â”€ mcp-n8n/MCP.md
    â”œâ”€â”€ mcp-sii-chile/MCP.md
    â””â”€â”€ mcp-banco-fintoc/MCP.md
```

---

## CÃ³mo usar las skills

### OpciÃ³n A â€” InvocaciÃ³n natural (recomendado al inicio)

Le hablas a Claude como humano y Ã©l detecta quÃ© skill aplica:

```
TÃº: "Cotiza Atiko para Restaurante La Marga, dueÃ±o Juan,
     dolor: gasta 3h/dÃ­a pasando vouchers a Excel"

Claude: [detecta trigger "cotiza" â†’ carga cotizar-atiko â†’
         pide datos faltantes â†’ genera propuesta]
```

### OpciÃ³n B â€” InvocaciÃ³n explÃ­cita

Cuando quieras ser especÃ­fico:

```
TÃº: "Usa skill discovery-call para preparar reuniÃ³n con CafÃ© Norte hoy a las 16h"

Claude: [carga discovery-call â†’ te entrega checklist preparaciÃ³n]
```

### OpciÃ³n C â€” En modo "modo trabajo" largo

Para sesiones largas donde vas a hacer varias cosas:

```
TÃº: "Voy a cerrar 3 clientes hoy. Quiero hacer discovery con los 3,
     despuÃ©s cotizar a los que califiquen, y al final preparar onboarding del que firme primero."

Claude: [usa las 3 skills en secuencia, una por cada cliente]
```

---

## AnatomÃ­a de una skill (para que entiendas quÃ© edita Claude)

Cada `SKILL.md` tiene:

```markdown
---
name: nombre-skill
description: CuÃ¡ndo se activa + triggers principales
version: 1.0
author: Atiko
---

# TÃ­tulo de la skill

## CuÃ¡ndo usar
[criterios + triggers]

## InformaciÃ³n requerida
[quÃ© datos necesita antes de ejecutar]

## Proceso
[pasos detallados]

## Templates / Plantillas
[outputs estandarizados]

## Errores comunes
[quÃ© evitar]
```

Cuando una skill no te entregue lo que esperÃ¡s, **edita el `SKILL.md`** correspondiente. Anota:
- QuÃ© pasÃ³ (quÃ© te entregÃ³ vs quÃ© esperabas)
- Por quÃ© pasÃ³ (faltaba info en la skill, instrucciÃ³n ambigua)
- Mejora (texto agregado/quitado)

La skill MEJORA con cada uso.

---

## CÃ³mo extender el toolkit en el futuro

### Para crear una skill nueva

1. Identifica un proceso que repitas 2+ veces
2. Anota: triggers, info requerida, pasos, output esperado
3. Copia `toolkit/skills/cotizar-atiko/SKILL.md` como template
4. Reemplaza contenido con el proceso nuevo
5. PruÃ©bala 3 veces ajustando

### Para crear un hook nuevo

Pre-requisito: tener n8n self-hosted corriendo.

1. Define evento gatillo (ej: "cliente paga primer mensualidad")
2. Define acciones (ej: "mandar email gracias + crear ficha post-venta + invitar a NPS")
3. Crea spec en `toolkit/hooks/[nombre]/HOOK.md`
4. Implementa en n8n
5. Documenta variables de entorno

### Para crear un MCP nuevo

Pre-requisito: experiencia con Node.js + MCP SDK.

1. Identifica sistema externo a conectar (API)
2. Define quÃ© tools expones a Claude (verbos: list, get, create, update, delete)
3. Crea spec en `toolkit/mcps/[nombre]/MCP.md`
4. Implementa con `@modelcontextprotocol/sdk`
5. Configura en `claude_desktop_config.json`
6. Testea cada tool

---

## CuÃ¡ndo NO crear nuevas skills/hooks/MCPs

- âŒ Si solo lo vas a usar 1 vez en la vida
- âŒ Si ya hay un plugin/skill existente que cubre el caso
- âŒ Si todavÃ­a no tienes claro el proceso (primero ejecuta 3-5 veces manual, despuÃ©s automatiza)
- âŒ Si va a tomar mÃ¡s tiempo construirla que ahorrarte en 6 meses

Regla: **automatiza solo lo que ya funciona manualmente**. Automatizar caos = caos automatizado.

---

## Roadmap del toolkit (prÃ³ximas adiciones sugeridas)

Cuando Atiko escale, considerar aÃ±adir:

### Skills futuras

- [ ] `cobranza-suave` â€” guion + mensajes para cobrar moroso sin perder cliente
- [ ] `contrato-modificar` â€” generar adenda/modificaciÃ³n contrato existente
- [ ] `pricing-revision` â€” calcular subida de precios para clientes existentes
- [ ] `caso-de-estudio` â€” generar caso publicable desde proyecto cerrado
- [ ] `bono-empleado` â€” calcular bono para colaborador cuando exista
- [ ] `briefing-freelance` â€” generar briefing claro para freelance contratado

### Hooks futuros

- [ ] `pago-recibido` â€” al detectar pago en banco, marca factura pagada + nota a cliente
- [ ] `aniversario-cliente` â€” al cumplirse 1 aÃ±o, envÃ­a felicitaciÃ³n personalizada
- [ ] `nps-trimestral` â€” manda encuesta NPS cada 90 dÃ­as
- [ ] `freelance-asignacion` â€” al crear tarea, asigna freelance segÃºn skill + carga

### MCPs futuros

- [ ] `mcp-canva` â€” generar diseÃ±os automÃ¡ticamente desde brief
- [ ] `mcp-figma` â€” leer/editar archivos Figma de cliente
- [ ] `mcp-shopify` â€” para clientes e-commerce con Shopify
- [ ] `mcp-mercadolibre` â€” para clientes que venden ahÃ­
- [ ] `mcp-instagram-graph` â€” programar + analytics IG con permisos directos
- [ ] `mcp-google-ads-mgmt` â€” gestionar campaÃ±as Google Ads de clientes

---

## FilosofÃ­a del toolkit

1. **Cada skill resuelve UN problema bien definido.** No skills "que hacen muchas cosas".
2. **Los outputs son estandarizados.** Mismo input â†’ mismo formato de output siempre.
3. **El "porquÃ©" importa mÃ¡s que el "cÃ³mo".** Cada skill explica cuÃ¡ndo NO usarla.
4. **Iterar es la regla.** Las skills nacen 60% buenas, terminan 95% por uso real.
5. **Lo manual primero, despuÃ©s automatizar.** No automatices procesos rotos.
6. **El cliente nunca debe sentirse procesado.** Las skills son internas â€” el cliente recibe atenciÃ³n humana y personalizada.

---

## Anti-patrones a evitar

- âŒ **Tener 30 skills donde 5 cubren el 80% de los casos** â€” borra las que no usas
- âŒ **MCPs que no agregan valor a Claude pero suben costo** â€” si no lo usas semanalmente, no vale la pena
- âŒ **Hooks que ejecutan acciones que JosÃ© prefiere hacer manual** (ej: hablar con cliente â€” eso NO se automatiza)
- âŒ **Templates rÃ­gidos sin espacio para personalizaciÃ³n** â€” el cliente nota cuando algo es "copy-paste"
- âŒ **DocumentaciÃ³n que nadie lee** â€” si una skill no se entiende en 5 min, estÃ¡ mal documentada

---

## MÃ©tricas de Ã©xito del toolkit

DespuÃ©s de 3 meses de uso, evaluar:

- **Tiempo ahorrado total:** horas/semana Ã— 12 semanas
- **Skills mÃ¡s usadas:** invertir mÃ¡s en las top 3
- **Skills no usadas:** archivar/eliminar
- **Errores reportados por cliente:** deberÃ­a ser 0 â€” si hay, mejorar templates
- **Costos del toolkit:** USD/mes total (deberÃ­a ser < 5% de los ingresos Atiko)

---

## Soporte y mantenimiento

Cada trimestre:

- [ ] Revisar cada skill: Â¿sigue siendo relevante? Â¿hay errores frecuentes?
- [ ] Actualizar precios en `cotizar-atiko` si subiste
- [ ] Verificar que MCPs funcionan (probar 1 tool de cada uno)
- [ ] Eliminar skills no usadas
- [ ] Considerar agregar skills nuevas segÃºn procesos repetidos

---

**Contacto Atiko:**
- atikodigital@gmail.com
- WhatsApp +56 9 2713 0792
- atikodigital.cl

