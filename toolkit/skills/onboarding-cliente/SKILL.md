---
name: onboarding-cliente
description: Ejecuta el flujo completo de onboarding de un cliente nuevo de Atiko desde que firma contrato hasta el kickoff. Crea carpetas, redacta carta de bienvenida personalizada, agenda kickoff call, prepara material para la primera reuniÃ³n y arranca el cronograma de entrega. Se activa con "onboarding [cliente]", "firmÃ³ [empresa]", "nuevo cliente [nombre]", "cliente cerrado", "arrancamos con [empresa]".
version: 1.0
author: Atiko
---

# Onboarding Cliente â€” Skill de incorporaciÃ³n

## CuÃ¡ndo usar esta skill

Cuando un cliente FIRMA el contrato y paga 50% adelanto. Antes de empezar trabajo de diseÃ±o/dev.

Triggers:
- "onboarding [empresa]"
- "firmÃ³ [empresa]"
- "cliente nuevo [nombre]"
- "[empresa] cerrÃ³"
- "arrancamos con [cliente]"
- "[X] pagÃ³ el adelanto"

## InformaciÃ³n requerida

Antes de ejecutar, asegÃºrate de tener:

1. **Nombre empresa + contacto principal**
2. **Plan contratado** (Start / Pro / 360Â°)
3. **Add-ons** (automatizaciones custom, integraciones especÃ­ficas)
4. **Monto facturado** + adelanto recibido
5. **Fecha de pago confirmada**
6. **Fecha objetivo de lanzamiento** (calcular: lunes siguiente + 3 semanas)
7. **Email + WhatsApp del contacto**
8. **Si hay mÃ¡s stakeholders** (socio, contador, etc.)

## Flujo de onboarding (ejecutar en este orden)

### Paso 1: Crear estructura de carpetas en Drive

Ejecutar (o pedirle a JosÃ© que ejecute):

```
03-Clientes/[Empresa]/
â”œâ”€â”€ 00-Contrato/
â”‚   â”œâ”€â”€ contrato-firmado.pdf
â”‚   â”œâ”€â”€ propuesta-aprobada.pdf
â”‚   â””â”€â”€ discovery-notes.md
â”œâ”€â”€ 01-Brief-y-assets/
â”‚   â”œâ”€â”€ logo-cliente/
â”‚   â”œâ”€â”€ fotos-cliente/
â”‚   â”œâ”€â”€ textos-cliente/
â”‚   â””â”€â”€ accesos-cliente.md  â† (gestor contraseÃ±as)
â”œâ”€â”€ 02-DiseÃ±o/
â”‚   â”œâ”€â”€ wireframes/
â”‚   â”œâ”€â”€ mockups/
â”‚   â””â”€â”€ revisiones/
â”œâ”€â”€ 03-Desarrollo/
â”‚   â”œâ”€â”€ codigo/
â”‚   â”œâ”€â”€ deploy/
â”‚   â””â”€â”€ credenciales-staging/
â”œâ”€â”€ 04-Automatizaciones/
â”‚   â””â”€â”€ flows-n8n/
â”œâ”€â”€ 05-Facturas-emitidas/
â”œâ”€â”€ 06-Reportes-mensuales/
â””â”€â”€ 07-Comunicacion/
    â””â”€â”€ kickoff-notes.md
```

### Paso 2: Redactar carta de bienvenida (personalizada)

Template â€” completar con datos especÃ­ficos del cliente:

```markdown
**Para:** [Nombre]
**De:** JosÃ© Antonio OlguÃ­n Â· Agencia Atiko
**Asunto:** Bienvenido a Atiko Â· PrÃ³ximos pasos

---

Hola [Nombre],

Gracias por confiar en Atiko. Ya recibimos el adelanto y oficialmente arrancamos.

**Lo que sigue:**

ðŸ“… **Kickoff call:** [dÃ­a/hora propuesto]
Te mando link de Cal.com en este mismo mensaje para que confirmes el horario.
DuraciÃ³n: 60 minutos. Conviene que estÃ© quien decide.

ðŸŽ¯ **Antes del kickoff, te pedimos:**

1. **Tu logo en alta calidad** (idealmente .ai, .svg o .pdf)
2. **3-5 fotos** que representen tu negocio (productos, equipo, espacio)
3. **El texto base** que quieres comunicar (sobre nosotros, servicios, contacto)
4. **Acceso a tus cuentas actuales** si las tienes:
   - Dominio y hosting
   - Google Analytics / Search Console
   - Redes sociales
   - CRM o sistema interno
5. **Lista de competidores** que admires (3-5 sitios de referencia)

Te dejÃ© carpeta compartida acÃ¡ donde puedes subir todo:
ðŸ‘‰ [link Drive `03-Clientes/[Empresa]/01-Brief-y-assets/`]

ðŸ“Š **Cronograma comprometido:**

- **Semana 1** (esta): Kickoff + diseÃ±o wireframes
- **Semana 2**: DiseÃ±o visual + revisiÃ³n + desarrollo
- **Semana 3**: ConfiguraciÃ³n chatbot + automatizaciones + testing
- **Semana 4**: Lanzamiento + capacitaciÃ³n + soporte primer mes

ðŸš€ **Tu lanzamiento serÃ¡ el:** [fecha lanzamiento] (lunes ideal para que la semana sea completa)

ðŸ’¬ **Canal de comunicaciÃ³n:**
A partir de ahora, todo va por este WhatsApp. Yo respondo en horario hÃ¡bil (9-19h L-V). Si algo es urgente fuera de horario, igual escribime y veo.

ðŸ“‹ **Tu plan incluye:**
[Detallar bullets exactos del plan contratado + add-ons]

ðŸ“ **MÃ©tricas que vas a recibir cada mes:**
[Lista de mÃ©tricas segÃºn plan: visitas, conversaciones, leads, ROI ads, etc.]

ðŸ¤ **Mi compromiso contigo:**
- Honestidad: si algo no va a funcionar, te lo digo antes de hacerlo
- Velocidad: respondo mensajes en menos de 24h hÃ¡biles
- Mejora continua: el plan se ajusta a tu negocio, no al revÃ©s

Cualquier duda, escribime acÃ¡.
Nos vemos en el kickoff.

Saludos cordiales,

**JosÃ© Antonio OlguÃ­n**
Fundador Â· Agencia Atiko
+56 9 2713 0792
atikodigital@gmail.com
atikodigital.cl
```

### Paso 3: Agendar kickoff call

Generar mensaje para enviar:

```
Hola [Nombre], para el kickoff te dejo 3 opciones:

ðŸ“… OpciÃ³n A: [dÃ­a] [hora]
ðŸ“… OpciÃ³n B: [dÃ­a] [hora]
ðŸ“… OpciÃ³n C: [dÃ­a] [hora]

ReservÃ¡ la que te acomode acÃ¡ ðŸ‘‰ cal.com/atiko-jose/kickoff

O si ninguna sirve, sugerÃ­ horario y lo coordinamos.

Saludos,
JosÃ©
```

### Paso 4: Preparar agenda del kickoff (60 min)

Generar `kickoff-agenda.md` con:

```markdown
# Kickoff Call â€” [Empresa]
**Fecha:** [fecha]
**DuraciÃ³n:** 60 min
**Participantes:** JosÃ© OlguÃ­n (Atiko), [Nombre] ([Cargo]), [otros si aplica]

## Agenda

### 0-5 min Â· Bienvenida + rompehielo
- Saludo
- Confirmar que recibiÃ³ la carta de bienvenida
- Pregunta personal de calentamiento

### 5-15 min Â· Revisar contrato + cronograma
- Repasar entregables del plan contratado
- Confirmar fecha de lanzamiento
- Aclarar dudas sobre scope

### 15-30 min Â· Profundizar en el negocio del cliente
- "CuÃ©ntame cÃ³mo es un dÃ­a tÃ­pico tuyo trabajando"
- "Â¿QuÃ© te harÃ­a sentir orgulloso de tu marca al final de esto?"
- "Â¿Hay algo que tu competencia hace que TÃš no quieres copiar?"

### 30-45 min Â· RecopilaciÃ³n de assets en vivo
- Repasar checklist de la carta
- Pedir links de redes sociales en vivo
- Anotar credenciales que necesitamos acceso

### 45-55 min Â· Definiciones de diseÃ±o
- Estilo: minimalista / corporativo / juvenil / lujoso / artesanal
- 3 colores que NO quiere ver
- 3 sitios de referencia (puede mostrarlos en vivo)
- Â¿Hay marca/manual de marca existente?

### 55-60 min Â· Cierre + prÃ³ximos pasos
- Confirmar cronograma
- PrÃ³xima reuniÃ³n agendada (revisiÃ³n semana 1)
- Recordar canal de comunicaciÃ³n (WhatsApp)
```

### Paso 5: Configurar tracking del cliente

Crear entrada en CRM (Notion/HubSpot) con:

- **Estado:** Cliente activo
- **Fecha inicio:** [fecha pago]
- **Fecha lanzamiento comprometido:** [fecha + 21 dÃ­as]
- **Plan:** [nombre plan]
- **MRR aporte:** $[monto] CLP/mes
- **LTV estimado:** $[monto Ã— 12] CLP (asumiendo 12 meses)
- **PrÃ³xima factura:** [fecha 1ro mes siguiente]
- **Canal principal:** WhatsApp
- **Hora preferida contacto:** [si lo mencionÃ³]
- **CumpleaÃ±os/aniversario empresa:** [si lo sabe â€” para detalle post-lanzamiento]

### Paso 6: Emitir factura del adelanto

- [ ] Entrar al SII
- [ ] Emitir factura electrÃ³nica al RUT del cliente
- [ ] Concepto: "Anticipo 50% â€” Plan [nombre] Atiko segÃºn contrato del [fecha]"
- [ ] Monto: 50% Ã— monto mensual + 50% Ã— setup si aplica
- [ ] Enviar PDF al cliente por email
- [ ] Archivar en `05-Facturas-emitidas/`

### Paso 7: Crear board interno de proyecto

Crear board en Trello/Notion/Linear con tarjetas:

**Columnas:** Backlog Â· Esta semana Â· En progreso Â· RevisiÃ³n Â· Aprobado Â· Listo

**Tarjetas iniciales (Backlog):**

Semana 1:
- [ ] Kickoff call
- [ ] Recopilar assets cliente
- [ ] AnÃ¡lisis de competencia (3 sitios)
- [ ] Wireframes (Figma)
- [ ] RevisiÃ³n wireframes con cliente

Semana 2:
- [ ] DiseÃ±o visual v1
- [ ] RevisiÃ³n v1 con cliente
- [ ] DiseÃ±o v2 (con cambios)
- [ ] AprobaciÃ³n diseÃ±o
- [ ] Inicio desarrollo

Semana 3:
- [ ] Maquetar HTML/Webflow
- [ ] Configurar dominio + hosting + SSL
- [ ] Setup chatbot WhatsApp
- [ ] Configurar automatizaciÃ³n (si aplica)
- [ ] SEO tÃ©cnico
- [ ] Testing mobile + cross-browser

Semana 4:
- [ ] CapacitaciÃ³n cliente (45 min)
- [ ] Lanzamiento oficial
- [ ] Post de celebraciÃ³n (con permiso)
- [ ] Check-in dÃ­a 7
- [ ] Primer reporte de mÃ©tricas

### Paso 8: Mensaje de "ya estamos andando"

Mandar a JosÃ© esta nota:

```
âœ… Onboarding completo para [Empresa]

He preparado:
- ðŸ“ Carpeta Drive con estructura completa
- ðŸ“¨ Carta de bienvenida lista para enviar
- ðŸ“… Mensaje de agendamiento de kickoff
- ðŸ“‹ Agenda detallada del kickoff (60 min)
- ðŸŽ¯ Board de proyecto con todas las tareas
- ðŸ’° Factura para emitir en SII

PrÃ³ximos pasos para JosÃ©:
1. Enviar carta + link Cal.com al cliente
2. Cuando confirme kickoff, agendarlo en Calendar
3. Emitir factura del adelanto en SII
4. Subir contrato firmado y propuesta a `00-Contrato/`
5. Cuando lleguen los assets del cliente, avisarme y arrancamos diseÃ±o

Estoy listo para ayudarte con el primer wireframe cuando me digas.
```

## Casos especiales

### Si el cliente comprÃ³ ADD-ON de automatizaciÃ³n

AÃ±adir a la agenda del kickoff:
- Bloque de 15 min para "Detallar el proceso a automatizar"
- Solicitar acceso a: sistemas origen (WhatsApp Business), sistemas destino (Sheets, ERP, CRM), credenciales API si aplica

### Si el cliente es del nicho HORECA

Pedir adicionalmente en assets:
- MenÃº completo en PDF o foto
- Fotos del local
- Si tiene pÃ¡gina de reservas actual
- WhatsApp Business actual

### Si el cliente es Servicios Profesionales

Pedir adicionalmente:
- Lista de servicios con descripciÃ³n de cada uno
- Foto profesional del profesional/equipo
- Casos resueltos o testimonios (con autorizaciÃ³n)
- Si maneja agenda hoy (Google Calendar, papel, otro)

### Si el cliente es E-commerce

Pedir adicionalmente:
- CatÃ¡logo de productos (Excel o sistema actual)
- Si tiene Webpay activo
- PolÃ­tica de envÃ­os y devoluciones
- Stock actual + cÃ³mo se actualiza

## Lo que NO se debe hacer en onboarding

- âŒ Empezar a diseÃ±ar antes del kickoff
- âŒ Asumir que el cliente sabe lo que es "wireframe" o "mockup" â€” usar palabras simples
- âŒ Prometer features que no estaban en la propuesta firmada (anota como "fase 2" y lo conversamos despuÃ©s)
- âŒ Crear grupos de WhatsApp masivos (1:1 con el contacto principal, mÃ¡ximo agregar 1 stakeholder)
- âŒ Dejar pasar mÃ¡s de 24h sin responder al cliente nuevo (sobre todo en la primera semana)
- âŒ Empezar sin recibir el adelanto en banco confirmado (NO con "ya transferÃ­" â€” con confirmaciÃ³n bancaria)

